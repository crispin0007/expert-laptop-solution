from rest_framework import serializers
from .models import Category, Product, ProductImage, StockLevel, StockMovement


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


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True, default=None)
    category_parent_name = serializers.CharField(source='category.parent.name', read_only=True, default=None)
    images = ProductImageSerializer(many=True, read_only=True)
    primary_image_url = serializers.ReadOnlyField()
    stock_on_hand = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = (
            'id', 'category', 'category_name', 'category_parent_name',
            'name', 'sku', 'barcode', 'brand', 'description',
            'unit_price', 'cost_price', 'weight',
            'reorder_level', 'track_stock',
            'is_service', 'is_published', 'is_active',
            'images', 'primary_image_url', 'stock_on_hand',
            'created_at', 'updated_at',
        )
        read_only_fields = ('created_at', 'updated_at', 'category_name',
                            'category_parent_name', 'images', 'primary_image_url', 'stock_on_hand')

    def get_stock_on_hand(self, obj):
        try:
            return obj.stock_level.quantity_on_hand
        except Exception:
            return 0


class StockLevelSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)

    class Meta:
        model = StockLevel
        fields = ('id', 'product', 'product_name', 'quantity_on_hand', 'last_updated')
        read_only_fields = fields


class StockMovementSerializer(serializers.ModelSerializer):
    class Meta:
        model = StockMovement
        fields = (
            'id', 'product', 'movement_type', 'quantity',
            'reference_type', 'reference_id', 'notes', 'created_at',
        )
        read_only_fields = ('created_at',)
