import csv
import io
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
    Category, Product, ProductImage, StockLevel,
    StockMovement, Supplier, PurchaseOrder, PurchaseOrderItem,
    UnitOfMeasure, ProductVariant, ReturnOrder, ReturnOrderItem,
    SupplierProduct, StockCount, StockCountItem,
)
from .serializers import (
    CategorySerializer, CategoryTreeSerializer,
    ProductSerializer, ProductImageSerializer,
    StockLevelSerializer, StockMovementSerializer,
    SupplierSerializer,
    PurchaseOrderSerializer, PurchaseOrderWriteSerializer, ReceiveItemsSerializer,
    UnitOfMeasureSerializer,
    ProductVariantSerializer,
    ReturnOrderSerializer, ReturnOrderWriteSerializer,
    SupplierProductSerializer,
    StockCountSerializer, StockCountWriteSerializer, StockCountItemSerializer,
)


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
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]

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
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]

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
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]

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


class StockLevelViewSet(NexusViewSet):
    """Stock levels are read-only; they are managed by signals."""
    required_module = 'inventory'
    queryset = StockLevel.objects.select_related('product')
    serializer_class = StockLevelSerializer
    http_method_names = ['get', 'head', 'options']
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*ALL_ROLES)]


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
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]



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
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]



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
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]

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
        if po.status == PurchaseOrder.STATUS_CANCELLED:
            raise ConflictError('Cannot receive a cancelled purchase order.')
        if po.status == PurchaseOrder.STATUS_RECEIVED:
            raise ConflictError('Purchase order is already fully received.')

        ser = ReceiveItemsSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        lines = ser.validated_data['lines']
        notes = ser.validated_data.get('notes', '')

        items_map = {item.id: item for item in po.items.select_related('product')}

        for line in lines:
            item = items_map.get(line['item_id'])
            if not item:
                raise AppValidationError(f"Item {line['item_id']} not found on this PO.")
            qty = line['quantity_received']
            if qty <= 0:
                continue
            max_receivable = item.quantity_ordered - item.quantity_received
            if qty > max_receivable:
                raise AppValidationError(
                    f"Cannot receive {qty} of '{item.product.name}' — only {max_receivable} pending."
                )
            StockMovement.objects.create(
                tenant=po.tenant,
                product=item.product,
                movement_type=StockMovement.MOVEMENT_IN,
                quantity=qty,
                reference_type='purchase_order',
                reference_id=po.pk,
                notes=notes or f"Received via {po.po_number}",
                created_by=request.user,
            )
            item.quantity_received += qty
            item.save(update_fields=['quantity_received'])

        # Recompute status
        po.refresh_from_db()
        total_ordered  = sum(i.quantity_ordered  for i in po.items.all())
        total_received = sum(i.quantity_received for i in po.items.all())
        if total_received >= total_ordered:
            new_status = PurchaseOrder.STATUS_RECEIVED
        elif total_received > 0:
            new_status = PurchaseOrder.STATUS_PARTIAL
        else:
            new_status = po.status

        po.status = new_status
        if new_status in (PurchaseOrder.STATUS_RECEIVED, PurchaseOrder.STATUS_PARTIAL):
            po.received_by = request.user
            po.received_at = timezone.now()
        po.save(update_fields=['status', 'received_by', 'received_at'])
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
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]



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
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]



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
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]

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
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*ALL_ROLES)]

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

        products = (
            Product.objects
            .filter(tenant=self.tenant, is_deleted=False, is_active=True,
                    is_service=False, track_stock=True)
            .select_related('stock_level')
        )
        low_stock_products = [
            p for p in products
            if getattr(getattr(p, 'stock_level', None), 'quantity_on_hand', 0) <= p.reorder_level
        ]

        if not low_stock_products:
            return ApiResponse.success(data={'detail': 'No low-stock products found.', 'pos_created': 0})

        product_ids = [p.id for p in low_stock_products]

        sp_qs = (
            SupplierProduct.objects
            .filter(tenant=self.tenant, product_id__in=product_ids, is_preferred=True)
            .select_related('supplier', 'product')
        )
        preferred_map = {sp.product_id: sp for sp in sp_qs}

        supplier_lines: dict = {}
        skipped = []
        for p in low_stock_products:
            sp = preferred_map.get(p.id)
            if not sp:
                skipped.append({'id': p.id, 'name': p.name, 'sku': p.sku})
                continue
            if sp.supplier_id not in supplier_lines:
                supplier_lines[sp.supplier_id] = {'supplier': sp.supplier, 'items': []}
            current_stock = getattr(getattr(p, 'stock_level', None), 'quantity_on_hand', 0)
            reorder_qty = max(p.reorder_level - current_stock, sp.min_order_qty)
            supplier_lines[sp.supplier_id]['items'].append({
                'product': p,
                'quantity_ordered': reorder_qty,
                'unit_cost': sp.unit_cost,
            })

        created_pos = []
        for supplier_id, data in supplier_lines.items():
            po = PurchaseOrder.objects.create(
                tenant=self.tenant,
                supplier=data['supplier'],
                status=PurchaseOrder.STATUS_DRAFT,
                notes='Auto-generated from low-stock reorder',
                created_by=request.user,
            )
            for item in data['items']:
                PurchaseOrderItem.objects.create(
                    tenant=self.tenant,
                    po=po,
                    product=item['product'],
                    quantity_ordered=item['quantity_ordered'],
                    unit_cost=item['unit_cost'],
                    created_by=request.user,
                )
            created_pos.append({
                'po_number': po.po_number,
                'supplier': data['supplier'].name,
                'line_count': len(data['items']),
            })

        return ApiResponse.created(data={
            'pos_created': len(created_pos),
            'purchase_orders': created_pos,
            'skipped_no_supplier': skipped,
        })


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
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]

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
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]

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
        if sc.status != StockCount.STATUS_COUNTING:
            raise ConflictError('Only counting-status sessions can be completed.')

        # Wrap inside a transaction so a mid-loop failure does not leave stock
        # levels partially adjusted while movements are only partially created.
        from django.db import transaction as _tx
        from django.db.models import F as DbF
        adjustments_created = 0
        with _tx.atomic():
            for item in sc.items.select_related('product'):
                if item.counted_qty is None:
                    continue
                diff = item.discrepancy
                if diff == 0:
                    continue
                StockMovement.objects.create(
                    tenant=sc.tenant,
                    product=item.product,
                    movement_type=StockMovement.MOVEMENT_ADJUSTMENT,
                    quantity=abs(diff),
                    reference_type='stock_count',
                    reference_id=sc.pk,
                    notes=f"Stock count {sc.count_number}: {'surplus' if diff > 0 else 'shrinkage'} of {abs(diff)}",
                    created_by=request.user,
                )
                StockLevel.objects.filter(product=item.product).update(
                    quantity_on_hand=DbF('quantity_on_hand') + diff
                )
                adjustments_created += 1

            sc.status       = StockCount.STATUS_COMPLETED
            sc.completed_at = timezone.now()
            sc.completed_by = request.user
            sc.save(update_fields=['status', 'completed_at', 'completed_by'])

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
