import csv
import io
import logging
from decimal import Decimal, InvalidOperation
from datetime import timedelta

from rest_framework import viewsets, permissions, filters, status
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Sum, Max, F, ExpressionWrapper, DecimalField
from django.db.models.functions import Coalesce
from django.http import HttpResponse
from django.utils import timezone
from core.mixins import TenantMixin
from core.views import NexusViewSet
from core.response import ApiResponse
from core.exceptions import ConflictError, AppException, ValidationError as AppValidationError
from core.permissions import make_role_permission, ADMIN_ROLES, ALL_ROLES
from .models import (
    Category, Product, ProductImage, SerialNumber, StockLevel,
    StockMovement, Supplier, PurchaseOrder, PurchaseOrderItem,
    UnitOfMeasure, ProductVariant, ReturnOrder, ReturnOrderItem,
    SupplierProduct, StockCount, StockCountItem,
    ProductBundle, SupplierPayment,
)
from .serializers import (
    CategorySerializer, CategoryTreeSerializer,
    ProductSerializer, ProductImageSerializer, SerialNumberSerializer,
    StockLevelSerializer, StockMovementSerializer,
    SupplierSerializer,
    PurchaseOrderSerializer, PurchaseOrderWriteSerializer, ReceiveItemsSerializer,
    UnitOfMeasureSerializer,
    ProductVariantSerializer,
    ReturnOrderSerializer, ReturnOrderWriteSerializer,
    SupplierProductSerializer,
    StockCountSerializer, StockCountWriteSerializer, StockCountItemSerializer,
    ProductBundleSerializer, SupplierPaymentSerializer,
)
from .services import (
    receive_purchase_order,
    complete_stock_count,
    auto_reorder as run_auto_reorder,
)
from parties.services import resolve_or_create_supplier_party


logger = logging.getLogger(__name__)


class ProductPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100


class CategoryViewSet(NexusViewSet):
    """Inventory categories: read=all, write=admin+."""

    required_module = 'inventory'
    queryset = Category.objects.all()
    serializer_class = CategorySerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve', 'tree'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES, permission_key='inventory.view')()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES, permission_key='inventory.manage')()]

    @action(detail=False, methods=['get'], url_path='tree')
    def tree(self, request):
        """Return only root categories with nested children."""
        roots = self.get_queryset().filter(parent__isnull=True)
        return ApiResponse.success(data=CategoryTreeSerializer(roots, many=True).data)


class ProductImageViewSet(NexusViewSet):
    required_module = 'inventory'
    serializer_class = ProductImageSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES, permission_key='inventory.view')()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES, permission_key='inventory.manage')()]

    def get_queryset(self):
        self.ensure_tenant()
        qs = ProductImage.objects.filter(tenant=self.tenant)
        product_id = self.request.query_params.get('product')
        if product_id:
            qs = qs.filter(product_id=product_id)
        return qs

    @action(detail=True, methods=['post'], url_path='set-primary')
    def set_primary(self, request, pk=None):
        image = self.get_object()
        ProductImage.objects.filter(product=image.product).update(is_primary=False)
        image.is_primary = True
        image.save(update_fields=['is_primary'])
        return ApiResponse.success(data=ProductImageSerializer(image).data)


class SerialNumberViewSet(NexusViewSet):
    """Serial number tracking for warranty products."""
    required_module = 'inventory'
    serializer_class = SerialNumberSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['product', 'status']
    search_fields = ['serial_number']
    ordering = ['-created_at']

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES, permission_key='inventory.view')()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES, permission_key='inventory.manage')()]

    def get_queryset(self):
        self.ensure_tenant()
        return SerialNumber.objects.filter(tenant=self.tenant).select_related('product')

    def perform_create(self, serializer):
        serializer.save(tenant=self.tenant)

    @action(detail=True, methods=['post'], url_path='mark-used')
    def mark_used(self, request, pk=None):
        """Mark a serial number as used (admin only)."""
        serial = self.get_object()
        if serial.status != SerialNumber.STATUS_AVAILABLE:
            raise ConflictError('Serial number is not available')
        
        serial.status = SerialNumber.STATUS_USED
        serial.used_at = timezone.now()
        serial.reference_type = request.data.get('reference_type', '')
        serial.reference_id = request.data.get('reference_id')
        serial.save(update_fields=['status', 'used_at', 'reference_type', 'reference_id'])
        return ApiResponse.success(data=SerialNumberSerializer(serial).data)

    @action(detail=True, methods=['post'], url_path='mark-returned')
    def mark_returned(self, request, pk=None):
        """Mark a serial number as returned (admin only)."""
        serial = self.get_object()
        serial.status = SerialNumber.STATUS_RETURNED
        serial.notes = request.data.get('notes', serial.notes)
        serial.save(update_fields=['status', 'notes'])
        return ApiResponse.success(data=SerialNumberSerializer(serial).data)


class ProductViewSet(NexusViewSet):
    """Products: read=all, write=admin+."""

    required_module = 'inventory'
    queryset = Product.objects.filter(is_deleted=False).select_related('category', 'stock_level').prefetch_related('images')
    serializer_class = ProductSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter, DjangoFilterBackend]
    search_fields = ['name', 'sku', 'barcode', 'brand', 'description']
    ordering_fields = ['name', 'unit_price', 'created_at']
    ordering = ['name']
    filterset_fields = ['category', 'is_service', 'is_active']
    pagination_class = ProductPagination

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES, permission_key='inventory.view')()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES, permission_key='inventory.manage')()]

    def list(self, request, *args, **kwargs):
        """Override list to support ?all=true for lightweight autocomplete lists."""
        if request.query_params.get('all') == 'true':
            qs = self.filter_queryset(self.get_queryset())
            data = list(qs.values('id', 'name', 'sku', 'unit_price', 'is_service', 'reorder_level')[:500])
            return ApiResponse.success(data=data)
        return super().list(request, *args, **kwargs)

    @action(detail=False, methods=['get'], url_path='low-stock')
    def low_stock(self, request):
        """GET /inventory/products/low-stock/ — products at or below reorder level."""
        self.ensure_tenant()
        qs = Product.objects.filter(
            tenant=self.tenant,
            is_deleted=False,
            is_active=True,
            is_service=False,
            track_stock=True,
        ).select_related('stock_level', 'category')

        low = [
            p for p in qs
            if (getattr(p, 'stock_level', None) and
                p.stock_level.quantity_on_hand <= p.reorder_level)
        ]
        return ApiResponse.success(data=ProductSerializer(low, many=True).data)

    @action(detail=False, methods=['post'], url_path='import-csv',
            parser_classes=[MultiPartParser, FormParser])
    def import_csv(self, request):
        """
        POST /inventory/products/import-csv/ — bulk import products from CSV.
        Required columns: name, sku, unit_price
        Optional: barcode, brand, description, cost_price, reorder_level, is_service, is_active
        """
        self.ensure_tenant()
        file = request.FILES.get('file')
        if not file:
            raise AppValidationError('No file uploaded.')
        if not file.name.endswith('.csv'):
            raise AppValidationError('File must be a CSV.')

        decoded = file.read().decode('utf-8-sig')
        reader = csv.DictReader(io.StringIO(decoded))
        required_cols = {'name', 'sku', 'unit_price'}
        if not required_cols.issubset(set(reader.fieldnames or [])):
            raise AppValidationError(f'CSV must contain columns: {required_cols}')

        created = updated = errors = 0
        error_rows = []
        for i, row in enumerate(reader, start=2):  # row 1 = header
            name = row.get('name', '').strip()
            sku  = row.get('sku', '').strip()
            if not name or not sku:
                error_rows.append({'row': i, 'error': 'name and sku are required'})
                errors += 1
                continue
            try:
                unit_price = Decimal(str(row.get('unit_price', '0')).strip())
            except InvalidOperation:
                error_rows.append({'row': i, 'error': f'Invalid unit_price: {row.get("unit_price")}'})
                errors += 1
                continue

            defaults = {
                'name': name,
                'unit_price': unit_price,
                'created_by': request.user,
            }
            for opt_field in ('barcode', 'brand', 'description'):
                if row.get(opt_field, '').strip():
                    defaults[opt_field] = row[opt_field].strip()
            for dec_field in ('cost_price',):
                raw = row.get(dec_field, '').strip()
                if raw:
                    try:
                        defaults[dec_field] = Decimal(raw)
                    except InvalidOperation:
                        pass
            for int_field in ('reorder_level',):
                raw = row.get(int_field, '').strip()
                if raw:
                    try:
                        defaults[int_field] = int(raw)
                    except ValueError:
                        pass
            for bool_field in ('is_service', 'is_active', 'track_stock'):
                raw = row.get(bool_field, '').strip().lower()
                if raw in ('true', '1', 'yes'):
                    defaults[bool_field] = True
                elif raw in ('false', '0', 'no'):
                    defaults[bool_field] = False

            obj, was_created = Product.objects.update_or_create(
                tenant=self.tenant, sku=sku,
                defaults=defaults,
            )
            if was_created:
                created += 1
            else:
                updated += 1

        return ApiResponse.success(data={
            'created': created,
            'updated': updated,
            'errors': errors,
            'error_rows': error_rows,
        })


class ServiceViewSet(NexusViewSet):
    """
    Service catalog — a curated view of Product records where is_service=True.
    Services have no stock tracking; they represent billable/purchasable services.

    GET    /inventory/services/          list (add ?all=true for lightweight dropdown)
    POST   /inventory/services/          create
    GET    /inventory/services/{id}/     retrieve
    PUT    /inventory/services/{id}/     update
    DELETE /inventory/services/{id}/     deactivate (sets is_active=False)
    """
    required_module = 'inventory'

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(),
                    make_role_permission(*ALL_ROLES, permission_key='inventory.view')()]
        return [permissions.IsAuthenticated(),
                make_role_permission(*ADMIN_ROLES, permission_key='inventory.manage')()]

    def get_queryset(self):
        self.ensure_tenant()
        qs = Product.objects.filter(
            tenant=self.tenant, is_service=True, is_deleted=False,
        ).select_related('uom', 'category')
        search = self.request.query_params.get('search', '')
        if search:
            qs = qs.filter(name__icontains=search)
        return qs.order_by('name')

    def get_object(self):
        self.ensure_tenant()
        pk = self.kwargs.get('pk')
        try:
            return Product.objects.filter(tenant=self.tenant).get(
                pk=pk, is_service=True, is_deleted=False,
            )
        except Product.DoesNotExist:
            from rest_framework.exceptions import NotFound as DRFNotFound
            raise DRFNotFound('Service not found.')

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()
        # Lightweight ?all=true for dropdowns
        if request.query_params.get('all') == 'true':
            data = list(
                qs.filter(is_active=True)
                .values('id', 'name', 'description', 'unit_price', 'uom')
                [:500]
            )
            return ApiResponse.success(data=data)
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(ProductSerializer(page, many=True).data)
        return ApiResponse.success(data=ProductSerializer(qs, many=True).data)

    def retrieve(self, request, *args, **kwargs):
        return ApiResponse.success(data=ProductSerializer(self.get_object()).data)

    def create(self, request, *args, **kwargs):
        self.ensure_tenant()
        serializer = ProductSerializer(
            data={**request.data, 'is_service': True, 'track_stock': False},
            context=self.get_serializer_context(),
        )
        serializer.is_valid(raise_exception=True)
        instance = serializer.save(tenant=self.tenant, is_service=True, track_stock=False)
        return ApiResponse.created(data=ProductSerializer(instance).data)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = ProductSerializer(
            instance,
            data={**request.data, 'is_service': True, 'track_stock': False},
            partial=partial,
            context=self.get_serializer_context(),
        )
        serializer.is_valid(raise_exception=True)
        instance = serializer.save(is_service=True, track_stock=False)
        return ApiResponse.success(data=ProductSerializer(instance).data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.is_active = False
        instance.save(update_fields=['is_active'])
        return ApiResponse.success(message='Service deactivated.')


class StockLevelViewSet(NexusViewSet):
    """Stock levels are read-only; they are managed by signals."""
    required_module = 'inventory'
    queryset = StockLevel.objects.select_related('product')
    serializer_class = StockLevelSerializer
    http_method_names = ['get', 'head', 'options']
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*ALL_ROLES, permission_key='inventory.view')]


class StockMovementViewSet(NexusViewSet):
    """Stock movements: read=all, write=admin+."""
    required_module = 'inventory'
    serializer_class = StockMovementSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['product', 'movement_type']
    ordering = ['-created_at']

    def get_queryset(self):
        self.ensure_tenant()
        qs = StockMovement.objects.filter(
            tenant=self.tenant
        ).select_related('product', 'created_by').order_by('-created_at')
        if fy_raw := self.request.query_params.get('fiscal_year'):
            try:
                from core.nepali_date import fiscal_year_date_range, FiscalYear
                fy = FiscalYear(bs_year=int(fy_raw))
                start_ad, end_ad = fiscal_year_date_range(fy)
                qs = qs.filter(created_at__date__gte=start_ad, created_at__date__lte=end_ad)
            except (ValueError, KeyError):
                pass
        return qs

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES, permission_key='inventory.view')()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES, permission_key='inventory.manage')()]



# ── Supplier ──────────────────────────────────────────────────────────────────

class SupplierViewSet(NexusViewSet):
    """Supplier CRUD: read=all, write=admin+."""
    required_module = 'inventory'
    serializer_class = SupplierSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'contact_person', 'email', 'phone']
    ordering = ['name']

    def get_queryset(self):
        self.ensure_tenant()
        qs = Supplier.objects.filter(tenant=self.tenant)
        if self.request.query_params.get('active') == 'true':
            qs = qs.filter(is_active=True)
        return qs

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES, permission_key='inventory.view')()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES, permission_key='inventory.manage')()]

    @staticmethod
    def _sync_supplier_party(instance) -> None:
        """Best-effort Party sync for supplier profile changes.

        Sync failures are logged and do not block supplier CRUD operations.
        """
        try:
            resolve_or_create_supplier_party(instance, dry_run=False)
        except Exception as exc:
            logger.exception('Supplier->Party sync failed for supplier %s: %s', instance.pk, exc)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save(tenant=self.tenant, created_by=self.request.user)
        self._sync_supplier_party(instance)
        out = self.get_serializer(instance)
        return ApiResponse.created(data=out.data)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        self._sync_supplier_party(instance)
        out = self.get_serializer(instance)
        return ApiResponse.success(data=out.data)



# ── Purchase Order ────────────────────────────────────────────────────────────

class PurchaseOrderViewSet(NexusViewSet):
    """
    Purchase Orders.
    POST /inventory/purchase-orders/{id}/receive/ — receive items, auto-creates StockMovement(in)
    POST /inventory/purchase-orders/{id}/send/    — mark as sent
    POST /inventory/purchase-orders/{id}/cancel/  — cancel
    """
    required_module = 'inventory'
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'supplier']
    search_fields = ['po_number', 'supplier__name', 'notes']
    ordering = ['-created_at']

    def get_queryset(self):
        self.ensure_tenant()
        qs = PurchaseOrder.objects.filter(tenant=self.tenant).select_related(
            'supplier', 'created_by', 'received_by',
        ).prefetch_related('items__product')
        if fy_raw := self.request.query_params.get('fiscal_year'):
            try:
                from core.nepali_date import fiscal_year_date_range, FiscalYear
                fy = FiscalYear(bs_year=int(fy_raw))
                start_ad, end_ad = fiscal_year_date_range(fy)
                qs = qs.filter(created_at__date__gte=start_ad, created_at__date__lte=end_ad)
            except (ValueError, KeyError):
                pass
        return qs

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return PurchaseOrderWriteSerializer
        return PurchaseOrderSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES, permission_key='inventory.view')()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES, permission_key='inventory.manage')()]

    def create(self, request, *args, **kwargs):
        """Return the full read serializer (with id) after creating a PO."""
        write_ser = PurchaseOrderWriteSerializer(
            data=request.data,
            context=self.get_serializer_context(),
        )
        write_ser.is_valid(raise_exception=True)
        po = write_ser.save(tenant=self.tenant, created_by=self.request.user)
        return ApiResponse.created(data=PurchaseOrderSerializer(po, context=self.get_serializer_context()).data)

    @action(detail=True, methods=['post'], url_path='receive')
    def receive(self, request, pk=None):
        """
        Body: { "lines": [{"item_id": 1, "quantity_received": 5}], "notes": "" }
        Creates StockMovement(in) for each line and updates PO status.
        """
        po = self.get_object()
        ser = ReceiveItemsSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        po = receive_purchase_order(
            po=po,
            lines=ser.validated_data['lines'],
            notes=ser.validated_data.get('notes', ''),
            user=request.user,
        )
        return ApiResponse.success(data=PurchaseOrderSerializer(po).data)

    @action(detail=True, methods=['post'], url_path='send')
    def send(self, request, pk=None):
        po = self.get_object()
        if po.status != PurchaseOrder.STATUS_DRAFT:
            raise ConflictError('Only draft POs can be marked as sent.')
        po.status = PurchaseOrder.STATUS_SENT
        po.save(update_fields=['status'])
        return ApiResponse.success(data=PurchaseOrderSerializer(po).data)

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, pk=None):
        po = self.get_object()
        if po.status in (PurchaseOrder.STATUS_PARTIAL, PurchaseOrder.STATUS_RECEIVED):
            raise ConflictError('Cannot cancel a PO that has already been (partially) received.')
        if po.status == PurchaseOrder.STATUS_CANCELLED:
            raise ConflictError('Already cancelled.')
        po.status = PurchaseOrder.STATUS_CANCELLED
        po.save(update_fields=['status'])
        return ApiResponse.success(data=PurchaseOrderSerializer(po).data)

    @action(detail=True, methods=['get'], url_path='pdf')
    def pdf(self, request, pk=None):
        """GET /inventory/purchase-orders/{id}/pdf/ — download PO as PDF."""
        po = self.get_object()
        try:
            from weasyprint import HTML
            from django.template.loader import render_to_string
        except ImportError:
            return HttpResponse(b'%PDF stub - install weasyprint', content_type='application/pdf')

        items = po.items.select_related('product', 'variant').all()
        html_string = render_to_string(
            'inventory/po_pdf.html',
            {'po': po, 'items': items, 'tenant': self.tenant},
        )
        pdf_bytes = HTML(string=html_string).write_pdf()
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="PO-{po.po_number}.pdf"'
        return response


# ── Unit of Measure ───────────────────────────────────────────────────────────

class UnitOfMeasureViewSet(NexusViewSet):
    """
    Units of measure (kg, pcs, litre, etc.).
    Read = all authenticated, Write = admin+.
    """
    required_module = 'inventory'
    serializer_class = UnitOfMeasureSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'abbreviation']
    ordering = ['name']

    def get_queryset(self):
        self.ensure_tenant()
        return UnitOfMeasure.objects.filter(tenant=self.tenant)

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES, permission_key='inventory.view')()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES, permission_key='inventory.manage')()]



# ── Product Variants ──────────────────────────────────────────────────────────

class ProductVariantViewSet(NexusViewSet):
    """
    Product variants (e.g. Color=Red, Size=L).
    GET /inventory/variants/?product=<id>
    Read = all authenticated, Write = admin+.
    """
    required_module = 'inventory'
    serializer_class = ProductVariantSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['product', 'is_active']
    search_fields = ['sku', 'barcode']
    ordering = ['product__name', 'sku']

    def get_queryset(self):
        self.ensure_tenant()
        return ProductVariant.objects.filter(
            tenant=self.tenant
        ).select_related('product', 'stock_level')

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES, permission_key='inventory.view')()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES, permission_key='inventory.manage')()]



# ── Return to Supplier ────────────────────────────────────────────────────────

class ReturnOrderViewSet(NexusViewSet):
    """
    Return-to-Supplier orders (RMA).
    Status flow: draft → sent → accepted | cancelled
    POST /inventory/return-orders/{id}/send/   — creates StockMovement(return_supplier) per item
    POST /inventory/return-orders/{id}/accept/ — mark accepted
    POST /inventory/return-orders/{id}/cancel/ — void (reverses stock if already sent)
    """
    required_module = 'inventory'
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'supplier', 'reason']
    search_fields = ['return_number', 'supplier__name', 'notes']
    ordering = ['-created_at']

    def get_queryset(self):
        self.ensure_tenant()
        qs = ReturnOrder.objects.filter(tenant=self.tenant).select_related(
            'supplier', 'purchase_order', 'created_by',
        ).prefetch_related('items__product')
        if fy_raw := self.request.query_params.get('fiscal_year'):
            try:
                from core.nepali_date import fiscal_year_date_range, FiscalYear
                fy = FiscalYear(bs_year=int(fy_raw))
                start_ad, end_ad = fiscal_year_date_range(fy)
                qs = qs.filter(created_at__date__gte=start_ad, created_at__date__lte=end_ad)
            except (ValueError, KeyError):
                pass
        return qs

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return ReturnOrderWriteSerializer
        return ReturnOrderSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES, permission_key='inventory.view')()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES, permission_key='inventory.manage')()]

    @action(detail=True, methods=['post'], url_path='send')
    def send(self, request, pk=None):
        """Transition draft → sent; creates outbound StockMovements for each item."""
        ro = self.get_object()
        if ro.status != ReturnOrder.STATUS_DRAFT:
            raise ConflictError('Only draft return orders can be sent.')
        if not ro.items.exists():
            raise ConflictError('Cannot send a return order with no items.')
        # Create stock-out movements for each item
        for item in ro.items.select_related('product'):
            StockMovement.objects.create(
                tenant=ro.tenant,
                product=item.product,
                movement_type=StockMovement.MOVEMENT_RETURN_SUPPLIER,
                quantity=item.quantity,
                reference_type='return_order',
                reference_id=ro.pk,
                notes=f"Return {ro.return_number} to supplier {ro.supplier.name}",
                created_by=request.user,
            )
        ro.status = ReturnOrder.STATUS_SENT
        ro.sent_at = timezone.now()
        ro.save(update_fields=['status', 'sent_at'])
        return ApiResponse.success(data=ReturnOrderSerializer(ro).data)

    @action(detail=True, methods=['post'], url_path='accept')
    def accept(self, request, pk=None):
        """Transition sent → accepted."""
        ro = self.get_object()
        if ro.status != ReturnOrder.STATUS_SENT:
            raise ConflictError('Only sent return orders can be accepted.')
        ro.status = ReturnOrder.STATUS_ACCEPTED
        ro.save(update_fields=['status'])
        return ApiResponse.success(data=ReturnOrderSerializer(ro).data)

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, pk=None):
        """Cancel; if already sent, reverses the stock movements (stock-in)."""
        ro = self.get_object()
        if ro.status in (ReturnOrder.STATUS_ACCEPTED, ReturnOrder.STATUS_CANCELLED):
            raise ConflictError(f'Cannot cancel a return order in "{ro.status}" status.')
        if ro.status == ReturnOrder.STATUS_SENT:
            # Reverse the outbound movements
            for item in ro.items.select_related('product'):
                StockMovement.objects.create(
                    tenant=ro.tenant,
                    product=item.product,
                    movement_type=StockMovement.MOVEMENT_IN,
                    quantity=item.quantity,
                    reference_type='return_order_cancel',
                    reference_id=ro.pk,
                    notes=f"Reversal: cancelled return order {ro.return_number}",
                    created_by=request.user,
                )
        ro.status = ReturnOrder.STATUS_CANCELLED
        ro.save(update_fields=['status'])
        return ApiResponse.success(data=ReturnOrderSerializer(ro).data)


# ── Reports ───────────────────────────────────────────────────────────────────

class ReportViewSet(TenantMixin, viewsets.ViewSet):
    """
    Inventory reporting endpoints (read-only).
    GET /inventory/reports/valuation/    — per-product value = stock × cost_price
    GET /inventory/reports/dead-stock/   — products with no movement in N days (default 60)
    GET /inventory/reports/abc-analysis/ — classify products A/B/C by cumulative stock value
    GET /inventory/reports/forecast/     — stock-out forecast based on avg daily consumption
    GET /inventory/reports/export-csv/   — download all products as CSV
    """
    required_module = 'inventory'
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*ALL_ROLES, permission_key='inventory.view')]

    # ── Valuation ─────────────────────────────────────────────────────────────
    @action(detail=False, methods=['get'], url_path='valuation')
    def valuation(self, request):
        """Stock valuation: quantity_on_hand × cost_price per product."""
        self.ensure_tenant()
        products = (
            Product.objects
            .filter(tenant=self.tenant, is_deleted=False, is_service=False, track_stock=True)
            .select_related('stock_level', 'category')
            .order_by('name')
        )
        rows = []
        total_value = Decimal('0.00')
        for p in products:
            qty = getattr(getattr(p, 'stock_level', None), 'quantity_on_hand', 0) or 0
            cost = p.cost_price or Decimal('0.00')
            value = Decimal(str(qty)) * cost
            total_value += value
            rows.append({
                'id': p.id,
                'name': p.name,
                'sku': p.sku,
                'category': p.category.name if p.category else None,
                'quantity_on_hand': qty,
                'cost_price': float(cost),
                'total_value': float(value),
            })
        return ApiResponse.success(data={'rows': rows, 'total_value': float(total_value)})

    # ── Dead Stock ────────────────────────────────────────────────────────────
    @action(detail=False, methods=['get'], url_path='dead-stock')
    def dead_stock(self, request):
        """
        Products with zero movement in the last N days (default 60).
        Query param: ?days=90
        """
        self.ensure_tenant()
        days = int(request.query_params.get('days', 60))
        cutoff = timezone.now() - timedelta(days=days)

        # Products that had *any* movement after cutoff → active
        active_product_ids = set(
            StockMovement.objects
            .filter(tenant=self.tenant, created_at__gte=cutoff)
            .values_list('product_id', flat=True)
        )
        products = (
            Product.objects
            .filter(tenant=self.tenant, is_deleted=False, is_service=False, track_stock=True)
            .exclude(id__in=active_product_ids)
            .select_related('stock_level', 'category')
            .order_by('name')
        )
        rows = []
        for p in products:
            qty = getattr(getattr(p, 'stock_level', None), 'quantity_on_hand', 0) or 0
            last_movement = (
                StockMovement.objects
                .filter(tenant=self.tenant, product=p)
                .aggregate(last=Max('created_at'))['last']
            )
            rows.append({
                'id': p.id,
                'name': p.name,
                'sku': p.sku,
                'category': p.category.name if p.category else None,
                'quantity_on_hand': qty,
                'last_movement': last_movement,
                'days_inactive': days if not last_movement else (timezone.now() - last_movement).days,
            })
        return ApiResponse.success(data={'days': days, 'rows': rows, 'count': len(rows)})

    # ── ABC Analysis ──────────────────────────────────────────────────────────
    @action(detail=False, methods=['get'], url_path='abc-analysis')
    def abc_analysis(self, request):
        """
        Classify products A (top 70% of total value), B (next 20%), C (bottom 10%).
        Sorted by stock value descending.
        """
        self.ensure_tenant()
        products = (
            Product.objects
            .filter(tenant=self.tenant, is_deleted=False, is_service=False, track_stock=True)
            .select_related('stock_level')
        )
        rows = []
        for p in products:
            qty = getattr(getattr(p, 'stock_level', None), 'quantity_on_hand', 0) or 0
            cost = float(p.cost_price or 0)
            rows.append({
                'id': p.id, 'name': p.name, 'sku': p.sku,
                'quantity_on_hand': qty,
                'stock_value': round(qty * cost, 2),
            })

        rows.sort(key=lambda r: r['stock_value'], reverse=True)
        grand_total = sum(r['stock_value'] for r in rows) or 1  # avoid /0

        cumulative = 0.0
        for r in rows:
            cumulative += r['stock_value']
            pct = cumulative / grand_total
            r['class'] = 'A' if pct <= 0.70 else ('B' if pct <= 0.90 else 'C')
            r['cumulative_pct'] = round(pct * 100, 2)

        return ApiResponse.success(data={'rows': rows, 'total_value': round(grand_total, 2)})

    # ── Forecast ──────────────────────────────────────────────────────────────
    @action(detail=False, methods=['get'], url_path='forecast')
    def forecast(self, request):
        """
        Stock-out forecast based on average daily consumption over the last N days.
        Query param: ?days=30   (window for computing avg consumption)
        Returns: estimated days_of_stock_remaining per product.
        """
        self.ensure_tenant()
        days = int(request.query_params.get('days', 30))
        since = timezone.now() - timedelta(days=days)

        # Sum of all outbound movements per product in the window
        out_types = [StockMovement.MOVEMENT_OUT, StockMovement.MOVEMENT_RETURN_SUPPLIER]
        consumed = (
            StockMovement.objects
            .filter(tenant=self.tenant, movement_type__in=out_types, created_at__gte=since)
            .values('product_id')
            .annotate(total_consumed=Sum('quantity'))
        )
        consumed_map = {r['product_id']: r['total_consumed'] for r in consumed}

        products = (
            Product.objects
            .filter(tenant=self.tenant, is_deleted=False, is_service=False, track_stock=True)
            .select_related('stock_level', 'category')
            .order_by('name')
        )
        rows = []
        for p in products:
            qty = getattr(getattr(p, 'stock_level', None), 'quantity_on_hand', 0) or 0
            total_consumed = consumed_map.get(p.id, 0)
            avg_daily = total_consumed / days if days else 0
            days_remaining = (qty / avg_daily) if avg_daily > 0 else None  # None = no consumption
            rows.append({
                'id': p.id,
                'name': p.name,
                'sku': p.sku,
                'category': p.category.name if p.category else None,
                'quantity_on_hand': qty,
                'reorder_level': p.reorder_level,
                'avg_daily_consumption': round(avg_daily, 2),
                'days_of_stock': round(days_remaining, 1) if days_remaining is not None else None,
                'needs_reorder': qty <= p.reorder_level,
            })
        # Sort: needs_reorder first, then by days_of_stock ascending (soonest stockout first)
        rows.sort(key=lambda r: (not r['needs_reorder'], r['days_of_stock'] if r['days_of_stock'] is not None else 9999))
        return ApiResponse.success(data={'window_days': days, 'rows': rows})

    # ── CSV Export ────────────────────────────────────────────────────────────
    @action(detail=False, methods=['get'], url_path='export-csv')
    def export_csv(self, request):
        """Download all products as a CSV file."""
        self.ensure_tenant()
        products = (
            Product.objects
            .filter(tenant=self.tenant, is_deleted=False)
            .select_related('stock_level', 'category', 'uom')
            .order_by('name')
        )
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="products_export.csv"'

        writer = csv.writer(response)
        writer.writerow([
            'name', 'sku', 'barcode', 'brand', 'description',
            'category', 'unit_price', 'cost_price', 'uom',
            'reorder_level', 'track_stock', 'is_service', 'is_active',
            'quantity_on_hand',
        ])
        for p in products:
            qty = getattr(getattr(p, 'stock_level', None), 'quantity_on_hand', '')
            writer.writerow([
                p.name, p.sku, p.barcode or '', p.brand or '', p.description or '',
                p.category.name if p.category else '',
                p.unit_price, p.cost_price or '',
                p.uom.abbreviation if p.uom else '',
                p.reorder_level, p.track_stock, p.is_service, p.is_active,
                qty,
            ])
        return response

    # ── Auto-Reorder ──────────────────────────────────────────────────────────
    @action(detail=False, methods=['post'], url_path='auto-reorder')
    def auto_reorder(self, request):
        """
        POST /inventory/reports/auto-reorder/
        Scan all low-stock products that have a preferred supplier via SupplierProduct.
        Group by supplier and create one draft PurchaseOrder per supplier.
        Returns a summary of POs created and any products skipped (no preferred supplier).
        """
        self.ensure_tenant()
        result = run_auto_reorder(tenant=self.tenant, user=request.user)
        if result.get('pos_created', 0) == 0:
            return ApiResponse.success(data=result)
        return ApiResponse.created(data=result)

    # ── Top Selling ───────────────────────────────────────────────────────────
    @action(detail=False, methods=['get'], url_path='top-selling')
    def top_selling(self, request):
        """
        GET /inventory/reports/top-selling/?limit=20&days=90
        Products ranked by total quantity used in tickets (TicketProduct) over
        the last N days (default 90).  Returns at most `limit` rows (default 20).
        """
        self.ensure_tenant()
        days  = int(request.query_params.get('days', 90))
        limit = min(int(request.query_params.get('limit', 20)), 100)
        since = timezone.now() - timedelta(days=days)

        try:
            from tickets.models import TicketProduct
        except ImportError:
            return ApiResponse.success(data={'days': days, 'rows': []})

        # Aggregate total quantity sold via tickets in the window
        usage = (
            TicketProduct.objects
            .filter(tenant=self.tenant, created_at__gte=since)
            .values('product_id')
            .annotate(total_qty=Sum('quantity'))
            .order_by('-total_qty')[:limit]
        )
        product_ids = [r['product_id'] for r in usage]
        qty_map = {r['product_id']: r['total_qty'] for r in usage}

        products = (
            Product.objects
            .filter(tenant=self.tenant, id__in=product_ids)
            .select_related('category', 'stock_level')
        )
        product_map = {p.id: p for p in products}

        rows = []
        for pid in product_ids:   # preserve ranking order
            p = product_map.get(pid)
            if not p:
                continue
            qty_on_hand = getattr(getattr(p, 'stock_level', None), 'quantity_on_hand', 0) or 0
            rows.append({
                'id': p.id,
                'name': p.name,
                'sku': p.sku,
                'category': p.category.name if p.category else None,
                'unit_price': float(p.unit_price),
                'quantity_sold': qty_map[pid],
                'quantity_on_hand': qty_on_hand,
            })
        return ApiResponse.success(data={'days': days, 'rows': rows})


# ── Supplier–Product Catalog ──────────────────────────────────────────────────

class SupplierProductViewSet(NexusViewSet):
    """
    Supplier–Product catalog: which supplier stocks which product,
    at what cost, and with what lead time.
    GET /inventory/supplier-products/?supplier=<id>
    GET /inventory/supplier-products/?product=<id>
    """
    required_module = 'inventory'
    serializer_class = SupplierProductSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['supplier', 'product', 'is_preferred']
    ordering = ['-is_preferred', 'supplier__name']

    def get_queryset(self):
        self.ensure_tenant()
        return SupplierProduct.objects.filter(
            tenant=self.tenant
        ).select_related('supplier', 'product')

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES, permission_key='inventory.view')()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES, permission_key='inventory.manage')()]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if serializer.validated_data.get('is_preferred'):
            SupplierProduct.objects.filter(
                tenant=self.tenant,
                product=serializer.validated_data['product'],
                is_preferred=True,
            ).update(is_preferred=False)
        instance = serializer.save(tenant=self.tenant, created_by=self.request.user)
        return ApiResponse.created(data=self.get_serializer(instance).data)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        if serializer.validated_data.get('is_preferred'):
            SupplierProduct.objects.filter(
                tenant=self.tenant,
                product=instance.product,
                is_preferred=True,
            ).exclude(pk=instance.pk).update(is_preferred=False)
        updated = serializer.save()
        return ApiResponse.success(data=self.get_serializer(updated).data)


# ── Stock Count (Stocktake) ───────────────────────────────────────────────────

class StockCountViewSet(NexusViewSet):
    """
    Physical inventory count sessions.
    POST /inventory/stock-counts/                  — create session
    POST /inventory/stock-counts/{id}/start/       — draft→counting, snapshots expected qtys
    PATCH /inventory/stock-counts/{id}/count-item/ — submit counted qty for one product
    POST /inventory/stock-counts/{id}/complete/    — approve → creates adjustment movements
    POST /inventory/stock-counts/{id}/cancel/      — void the session
    """
    required_module = 'inventory'
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['status', 'category']
    ordering = ['-created_at']

    def get_queryset(self):
        self.ensure_tenant()
        return StockCount.objects.filter(tenant=self.tenant).select_related(
            'category', 'created_by', 'completed_by',
        ).prefetch_related('items__product')

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return StockCountWriteSerializer
        return StockCountSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES, permission_key='inventory.view')()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES, permission_key='inventory.manage')()]

    @action(detail=True, methods=['post'], url_path='start')
    def start(self, request, pk=None):
        """Transition draft → counting; snapshot current stock levels as expected quantities."""
        sc = self.get_object()
        if sc.status != StockCount.STATUS_DRAFT:
            raise ConflictError('Only draft counts can be started.')

        qs = Product.objects.filter(
            tenant=self.tenant, is_deleted=False, is_service=False, track_stock=True
        ).select_related('stock_level')
        if sc.category_id:
            qs = qs.filter(category=sc.category)

        items = []
        for p in qs:
            qty = getattr(getattr(p, 'stock_level', None), 'quantity_on_hand', 0) or 0
            items.append(StockCountItem(
                tenant=self.tenant,
                stock_count=sc,
                product=p,
                expected_qty=qty,
                created_by=request.user,
            ))
        StockCountItem.objects.bulk_create(items, ignore_conflicts=True)
        sc.status = StockCount.STATUS_COUNTING
        sc.save(update_fields=['status'])
        return ApiResponse.success(data=StockCountSerializer(sc).data)

    @action(detail=True, methods=['patch'], url_path='count-item')
    def count_item(self, request, pk=None):
        """Body: { "product": <id>, "counted_qty": <int>, "notes": "" }"""
        sc = self.get_object()
        if sc.status != StockCount.STATUS_COUNTING:
            raise ConflictError('Count session is not in counting state.')

        product_id  = request.data.get('product')
        counted_qty = request.data.get('counted_qty')
        notes       = request.data.get('notes', '')

        if product_id is None or counted_qty is None:
            raise AppValidationError('"product" and "counted_qty" are required.')
        try:
            counted_qty = int(counted_qty)
            if counted_qty < 0:
                raise ValueError
        except (ValueError, TypeError):
            raise AppValidationError('"counted_qty" must be a non-negative integer.')

        try:
            item = sc.items.get(product_id=product_id)
        except StockCountItem.DoesNotExist:
            raise AppValidationError(f'Product {product_id} is not in this count session.')

        item.counted_qty = counted_qty
        item.notes = notes
        item.save(update_fields=['counted_qty', 'notes'])
        return ApiResponse.success(data=StockCountItemSerializer(item).data)

    @action(detail=True, methods=['post'], url_path='complete')
    def complete(self, request, pk=None):
        """
        Finish the count: for every item with a discrepancy,
        create a StockMovement(adjustment) and update StockLevel.
        """
        sc = self.get_object()
        sc, adjustments_created = complete_stock_count(sc=sc, user=request.user)
        return ApiResponse.success(data={
            **StockCountSerializer(sc).data,
            'adjustments_created': adjustments_created,
        })

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, pk=None):
        sc = self.get_object()
        if sc.status in (StockCount.STATUS_COMPLETED, StockCount.STATUS_CANCELLED):
            raise ConflictError(f'Cannot cancel a {sc.status} count session.')
        sc.status = StockCount.STATUS_CANCELLED
        sc.save(update_fields=['status'])
        return ApiResponse.success(data=StockCountSerializer(sc).data)


# ── Product Bundle ────────────────────────────────────────────────────────────

class ProductBundleViewSet(NexusViewSet):
    """
    Bundle composition — component list for a bundle product.
    GET  /inventory/product-bundles/?bundle=<id>
    POST /inventory/product-bundles/
    """
    required_module = 'inventory'
    serializer_class = ProductBundleSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['bundle']
    ordering = ['component__name']

    def get_queryset(self):
        self.ensure_tenant()
        return ProductBundle.objects.filter(
            tenant=self.tenant
        ).select_related('bundle', 'component')

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES, permission_key='inventory.view')()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES, permission_key='inventory.manage')()]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save(tenant=self.tenant)
        return ApiResponse.created(data=self.get_serializer(instance).data)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()
        return ApiResponse.success(data=self.get_serializer(updated).data)


# ── Supplier Payment ──────────────────────────────────────────────────────────

class SupplierPaymentViewSet(NexusViewSet):
    """
    Payments made to suppliers.
    GET  /inventory/supplier-payments/?supplier=<id>&purchase_order=<id>
    POST /inventory/supplier-payments/
    """
    required_module = 'inventory'
    serializer_class = SupplierPaymentSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['supplier', 'purchase_order', 'payment_method']
    ordering = ['-payment_date']

    def get_queryset(self):
        self.ensure_tenant()
        return SupplierPayment.objects.filter(
            tenant=self.tenant
        ).select_related('supplier', 'purchase_order', 'recorded_by')

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES, permission_key='inventory.view')()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES, permission_key='inventory.manage')()]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save(tenant=self.tenant, recorded_by=request.user)
        return ApiResponse.created(data=self.get_serializer(instance).data)

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        """
        GET /inventory/supplier-payments/summary/?supplier=<id>
        Returns per-supplier totals: total_ordered (PO amounts) vs total_paid.
        """
        self.ensure_tenant()
        from django.db.models import Q

        supplier_filter = request.query_params.get('supplier')
        qs = Supplier.objects.filter(tenant=self.tenant, is_active=True)
        if supplier_filter:
            qs = qs.filter(id=supplier_filter)

        rows = []
        for supplier in qs:
            total_po_amount = sum(
                po.total_amount
                for po in supplier.purchase_orders.filter(
                    tenant=self.tenant,
                ).exclude(status=PurchaseOrder.STATUS_CANCELLED)
            )
            total_paid = (
                SupplierPayment.objects
                .filter(tenant=self.tenant, supplier=supplier)
                .aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
            )
            rows.append({
                'supplier_id': supplier.id,
                'supplier_name': supplier.name,
                'total_po_amount': float(total_po_amount),
                'total_paid': float(total_paid),
                'outstanding': float(total_po_amount - total_paid),
            })
        rows.sort(key=lambda r: r['outstanding'], reverse=True)
        return ApiResponse.success(data={'rows': rows})
