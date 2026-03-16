from rest_framework import serializers
from .models import (
    Category, Product, ProductImage, SerialNumber, StockLevel, StockMovement,
    Supplier, PurchaseOrder, PurchaseOrderItem,
    UnitOfMeasure, ProductVariant, VariantStockLevel,
    ReturnOrder, ReturnOrderItem,
    SupplierProduct, StockCount, StockCountItem,
)


# ── Unit of Measure ───────────────────────────────────────────────────────────

class UnitOfMeasureSerializer(serializers.ModelSerializer):
    product_count = serializers.SerializerMethodField()

    class Meta:
        model = UnitOfMeasure
        fields = ('id', 'name', 'abbreviation', 'unit_type', 'product_count', 'created_at', 'updated_at')
        read_only_fields = ('created_at', 'updated_at', 'product_count')

    def get_product_count(self, obj):
        return obj.products.count()


class CategorySerializer(serializers.ModelSerializer):
    children_count = serializers.SerializerMethodField()
    parent_name = serializers.CharField(source='parent.name', read_only=True, default=None)

    class Meta:
        model = Category
        fields = ('id', 'name', 'slug', 'description', 'parent', 'parent_name',
                  'children_count', 'created_at', 'updated_at')
        read_only_fields = ('slug', 'created_at', 'updated_at', 'parent_name', 'children_count')

    def get_children_count(self, obj):
        return obj.children.count()


class CategoryTreeSerializer(serializers.ModelSerializer):
    """Recursive category tree (root categories with nested children)."""
    children = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ('id', 'name', 'slug', 'description', 'children')

    def get_children(self, obj):
        return CategoryTreeSerializer(obj.children.all(), many=True).data


class ProductImageSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = ProductImage
        fields = ('id', 'product', 'image', 'image_url', 'url', 'caption',
                  'is_primary', 'display_order', 'created_at')
        read_only_fields = ('created_at', 'url', 'product')

    def get_url(self, obj):
        return obj.get_url()


class SerialNumberSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_sku = serializers.CharField(source='product.sku', read_only=True)

    class Meta:
        model = SerialNumber
        fields = (
            'id', 'product', 'product_name', 'product_sku', 'serial_number',
            'status', 'reference_type', 'reference_id', 'notes',
            'used_at', 'warranty_expires', 'created_at', 'updated_at',
        )
        read_only_fields = ('created_at', 'updated_at', 'product_name', 'product_sku')


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True, default=None)
    category_parent_name = serializers.CharField(source='category.parent.name', read_only=True, default=None)
    uom_name = serializers.CharField(source='uom.name', read_only=True, default=None)
    uom_abbreviation = serializers.CharField(source='uom.abbreviation', read_only=True, default=None)
    images = ProductImageSerializer(many=True, read_only=True)
    primary_image_url = serializers.ReadOnlyField()
    stock_on_hand = serializers.SerializerMethodField()
    variant_count = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = (
            'id', 'category', 'category_name', 'category_parent_name',
            'name', 'sku', 'barcode', 'brand', 'description',
            'unit_price', 'cost_price', 'weight',
            'uom', 'uom_name', 'uom_abbreviation',
            'reorder_level', 'track_stock',
            'has_variants', 'variant_count', 'has_warranty',
            'warranty_months', 'warranty_description',
            'is_service', 'is_published', 'is_active',
            'images', 'primary_image_url', 'stock_on_hand',
            'created_at', 'updated_at',
        )
        read_only_fields = ('created_at', 'updated_at', 'category_name',
                            'category_parent_name', 'uom_name', 'uom_abbreviation',
                            'images', 'primary_image_url', 'stock_on_hand',
                            'variant_count')

    def get_stock_on_hand(self, obj):
        try:
            return obj.stock_level.quantity_on_hand
        except Exception:
            return 0

    def get_variant_count(self, obj):
        if obj.has_variants:
            return obj.variants.filter(is_active=True).count()
        return 0


class StockLevelSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)

    class Meta:
        model = StockLevel
        fields = ('id', 'product', 'product_name', 'quantity_on_hand', 'last_updated')
        read_only_fields = fields


class StockMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = StockMovement
        fields = (
            'id', 'product', 'product_name', 'movement_type', 'quantity',
            'reference_type', 'reference_id', 'notes',
            'created_by_name', 'created_at',
        )
        read_only_fields = ('created_at', 'product_name', 'created_by_name')

    def get_created_by_name(self, obj):
        if obj.created_by_id:
            return obj.created_by.get_full_name() or obj.created_by.email
        return None


# ── Supplier ──────────────────────────────────────────────────────────────────

class SupplierSerializer(serializers.ModelSerializer):
    po_count = serializers.SerializerMethodField()

    class Meta:
        model = Supplier
        fields = (
            'id', 'name', 'contact_person', 'email', 'phone',
            'address', 'city', 'country', 'website',
            'payment_terms', 'notes', 'is_active', 'po_count',
            'created_at', 'updated_at',
        )
        read_only_fields = ('created_at', 'updated_at', 'po_count')

    def get_po_count(self, obj):
        return obj.purchase_orders.count()


# ── Purchase Order ────────────────────────────────────────────────────────────

class PurchaseOrderItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_sku  = serializers.CharField(source='product.sku', read_only=True)
    line_total   = serializers.ReadOnlyField()
    pending_quantity = serializers.ReadOnlyField()

    class Meta:
        model = PurchaseOrderItem
        fields = (
            'id', 'product', 'product_name', 'product_sku',
            'quantity_ordered', 'quantity_received', 'unit_cost',
            'line_total', 'pending_quantity',
        )
        read_only_fields = ('product_name', 'product_sku', 'line_total', 'pending_quantity')


class PurchaseOrderSerializer(serializers.ModelSerializer):
    items         = PurchaseOrderItemSerializer(many=True, read_only=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    received_by_name = serializers.SerializerMethodField()
    total_amount  = serializers.ReadOnlyField()
    total_ordered = serializers.ReadOnlyField()
    total_received = serializers.ReadOnlyField()

    class Meta:
        model = PurchaseOrder
        fields = (
            'id', 'po_number', 'supplier', 'supplier_name', 'status',
            'expected_delivery', 'notes',
            'total_amount', 'total_ordered', 'total_received',
            'received_by', 'received_by_name', 'received_at',
            'created_by_name', 'created_at', 'updated_at',
            'items',
        )
        read_only_fields = (
            'po_number', 'created_at', 'updated_at',
            'supplier_name', 'created_by_name', 'received_by_name',
            'total_amount', 'total_ordered', 'total_received',
            'received_at',
        )

    def get_created_by_name(self, obj):
        if obj.created_by_id:
            return obj.created_by.get_full_name() or obj.created_by.email
        return None

    def get_received_by_name(self, obj):
        if obj.received_by_id:
            return obj.received_by.get_full_name() or obj.received_by.email
        return None


class PurchaseOrderWriteSerializer(serializers.ModelSerializer):
    """Used for create/update — accepts items as nested writable data."""
    items = PurchaseOrderItemSerializer(many=True)

    class Meta:
        model = PurchaseOrder
        fields = ('supplier', 'expected_delivery', 'notes', 'items')

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        po = PurchaseOrder.objects.create(**validated_data)
        for item in items_data:
            PurchaseOrderItem.objects.create(po=po, **item)
        return po

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()
        if items_data is not None:
            instance.items.all().delete()
            for item in items_data:
                PurchaseOrderItem.objects.create(po=instance, **item)
        return instance


class ReceiveItemsSerializer(serializers.Serializer):
    """Payload for the /receive/ action: list of {item_id, quantity_received}."""
    class ReceiveLineSerializer(serializers.Serializer):
        item_id           = serializers.IntegerField()
        quantity_received = serializers.IntegerField(min_value=0)

    lines = ReceiveLineSerializer(many=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')


# ── Product Variants ──────────────────────────────────────────────────────────

class ProductVariantSerializer(serializers.ModelSerializer):
    stock_on_hand  = serializers.ReadOnlyField()
    effective_price = serializers.ReadOnlyField()

    class Meta:
        model = ProductVariant
        fields = (
            'id', 'product', 'sku', 'barcode', 'attributes',
            'price_adjustment', 'effective_price', 'cost_price',
            'reorder_level', 'is_active', 'stock_on_hand',
            'created_at', 'updated_at',
        )
        read_only_fields = ('created_at', 'updated_at', 'stock_on_hand', 'effective_price')


# ── Return to Supplier ────────────────────────────────────────────────────────

class ReturnOrderItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_sku  = serializers.CharField(source='product.sku',  read_only=True)
    line_total   = serializers.ReadOnlyField()

    class Meta:
        model = ReturnOrderItem
        fields = (
            'id', 'product', 'product_name', 'product_sku',
            'quantity', 'unit_cost', 'line_total',
        )
        read_only_fields = ('product_name', 'product_sku', 'line_total')


class ReturnOrderSerializer(serializers.ModelSerializer):
    items              = ReturnOrderItemSerializer(many=True, read_only=True)
    supplier_name      = serializers.CharField(source='supplier.name', read_only=True)
    po_number          = serializers.CharField(source='purchase_order.po_number', read_only=True, default=None)
    created_by_name    = serializers.SerializerMethodField()
    total_items        = serializers.ReadOnlyField()
    total_value        = serializers.ReadOnlyField()

    class Meta:
        model = ReturnOrder
        fields = (
            'id', 'return_number', 'supplier', 'supplier_name',
            'purchase_order', 'po_number', 'status', 'reason', 'notes',
            'total_items', 'total_value',
            'sent_at', 'created_by_name', 'created_at', 'updated_at',
            'items',
        )
        read_only_fields = (
            'return_number', 'created_at', 'updated_at',
            'supplier_name', 'po_number', 'created_by_name',
            'total_items', 'total_value', 'sent_at',
        )

    def get_created_by_name(self, obj):
        if obj.created_by_id:
            return obj.created_by.get_full_name() or obj.created_by.email
        return None


class ReturnOrderWriteSerializer(serializers.ModelSerializer):
    items = ReturnOrderItemSerializer(many=True)

    class Meta:
        model = ReturnOrder
        fields = ('supplier', 'purchase_order', 'reason', 'notes', 'items')

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        ret = ReturnOrder.objects.create(**validated_data)
        for item in items_data:
            ReturnOrderItem.objects.create(return_order=ret, **item)
        return ret

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()
        if items_data is not None and instance.status == ReturnOrder.STATUS_DRAFT:
            instance.items.all().delete()
            for item in items_data:
                ReturnOrderItem.objects.create(return_order=instance, **item)
        return instance


# ── Supplier–Product Catalog ──────────────────────────────────────────────────

class SupplierProductSerializer(serializers.ModelSerializer):
    supplier_name  = serializers.CharField(source='supplier.name', read_only=True)
    product_name   = serializers.CharField(source='product.name',  read_only=True)
    product_sku    = serializers.CharField(source='product.sku',   read_only=True)

    class Meta:
        model  = SupplierProduct
        fields = (
            'id', 'supplier', 'supplier_name', 'product', 'product_name', 'product_sku',
            'supplier_sku', 'unit_cost', 'lead_time_days', 'min_order_qty',
            'is_preferred', 'notes', 'created_at', 'updated_at',
        )
        read_only_fields = ('created_at', 'updated_at', 'supplier_name', 'product_name', 'product_sku')


# ── Stock Count ───────────────────────────────────────────────────────────────

class StockCountItemSerializer(serializers.ModelSerializer):
    product_name  = serializers.CharField(source='product.name', read_only=True)
    product_sku   = serializers.CharField(source='product.sku',  read_only=True)
    discrepancy   = serializers.ReadOnlyField()

    class Meta:
        model  = StockCountItem
        fields = (
            'id', 'product', 'product_name', 'product_sku',
            'expected_qty', 'counted_qty', 'discrepancy', 'notes',
        )
        read_only_fields = ('product_name', 'product_sku', 'discrepancy', 'expected_qty')


class StockCountSerializer(serializers.ModelSerializer):
    items             = StockCountItemSerializer(many=True, read_only=True)
    category_name     = serializers.CharField(source='category.name', read_only=True, default=None)
    created_by_name   = serializers.SerializerMethodField()
    completed_by_name = serializers.SerializerMethodField()
    total_items       = serializers.ReadOnlyField()
    discrepancy_count = serializers.ReadOnlyField()

    class Meta:
        model  = StockCount
        fields = (
            'id', 'count_number', 'description', 'status',
            'category', 'category_name',
            'total_items', 'discrepancy_count',
            'completed_at', 'completed_by', 'completed_by_name',
            'created_by_name', 'created_at', 'updated_at',
            'items',
        )
        read_only_fields = (
            'count_number', 'created_at', 'updated_at',
            'category_name', 'created_by_name', 'completed_by_name',
            'total_items', 'discrepancy_count', 'completed_at', 'completed_by',
        )

    def get_created_by_name(self, obj):
        if obj.created_by_id:
            return obj.created_by.get_full_name() or obj.created_by.email
        return None

    def get_completed_by_name(self, obj):
        if obj.completed_by_id:
            return obj.completed_by.get_full_name() or obj.completed_by.email
        return None


class StockCountWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model  = StockCount
        fields = ('description', 'category')
