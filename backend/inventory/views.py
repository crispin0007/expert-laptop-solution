from rest_framework import viewsets, permissions, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from django_filters.rest_framework import DjangoFilterBackend
from core.mixins import TenantMixin
from core.permissions import make_role_permission, ADMIN_ROLES, ALL_ROLES
from .models import Category, Product, ProductImage, StockLevel, StockMovement
from .serializers import (
    CategorySerializer, CategoryTreeSerializer,
    ProductSerializer, ProductImageSerializer,
    StockLevelSerializer, StockMovementSerializer,
)


class ProductPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100


class CategoryViewSet(TenantMixin, viewsets.ModelViewSet):
    """Inventory categories: read=all, write=admin+."""

    required_module = 'inventory'
    queryset = Category.objects.all()
    serializer_class = CategorySerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve', 'tree'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]

    def perform_create(self, serializer):
        serializer.save(tenant=self.tenant, created_by=self.request.user)

    @action(detail=False, methods=['get'], url_path='tree')
    def tree(self, request):
        """Return only root categories with nested children."""
        roots = self.get_queryset().filter(parent__isnull=True)
        return Response(CategoryTreeSerializer(roots, many=True).data)


class ProductImageViewSet(TenantMixin, viewsets.ModelViewSet):
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

    def perform_create(self, serializer):
        serializer.save(tenant=self.tenant, created_by=self.request.user)

    @action(detail=True, methods=['post'], url_path='set-primary')
    def set_primary(self, request, pk=None):
        image = self.get_object()
        ProductImage.objects.filter(product=image.product).update(is_primary=False)
        image.is_primary = True
        image.save(update_fields=['is_primary'])
        return Response({'status': 'ok'})


class ProductViewSet(TenantMixin, viewsets.ModelViewSet):
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

    def perform_create(self, serializer):
        serializer.save(tenant=self.tenant, created_by=self.request.user)

    def list(self, request, *args, **kwargs):
        """Override list to support ?all=true for lightweight autocomplete lists."""
        if request.query_params.get('all') == 'true':
            qs = self.filter_queryset(self.get_queryset())
            data = list(qs.values('id', 'name', 'sku', 'unit_price', 'is_service')[:500])
            return Response(data)
        return super().list(request, *args, **kwargs)


class StockLevelViewSet(TenantMixin, viewsets.ReadOnlyModelViewSet):
    """Stock levels are read-only; they are managed by signals."""
    required_module = 'inventory'
    queryset = StockLevel.objects.select_related('product')
    serializer_class = StockLevelSerializer
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*ALL_ROLES)]


class StockMovementViewSet(TenantMixin, viewsets.ModelViewSet):
    """Stock movements: read=all, write=admin+."""
    required_module = 'inventory'
    queryset = StockMovement.objects.select_related('product').order_by('-created_at')
    serializer_class = StockMovementSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]

    def perform_create(self, serializer):
        serializer.save(tenant=self.tenant, created_by=self.request.user)
