from django.db import models
from django.conf import settings
from core.models import TenantModel


class Category(TenantModel):
    name = models.CharField(max_length=128)
    slug = models.SlugField(max_length=128, blank=True)
    description = models.TextField(blank=True)
    parent = models.ForeignKey(
        'self',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='children',
    )

    class Meta:
        ordering = ['name']
        unique_together = ('tenant', 'name')
        verbose_name_plural = 'categories'

    def __str__(self):
        if self.parent:
            return f"{self.parent.name} › {self.name}"
        return self.name


class Product(TenantModel):
    """Sellable/serviceable item tracked in inventory."""

    category = models.ForeignKey(
        Category,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='products',
    )
    name = models.CharField(max_length=255)
    sku = models.CharField(max_length=64, blank=True)
    barcode = models.CharField(max_length=64, blank=True)
    brand = models.CharField(max_length=128, blank=True)
    description = models.TextField(blank=True)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                     help_text='Purchase/cost price for margin tracking')
    weight = models.DecimalField(max_digits=8, decimal_places=3, null=True, blank=True,
                                  help_text='Weight in kg')
    reorder_level = models.PositiveIntegerField(default=0,
                                                 help_text='Alert when stock falls below this')
    track_stock = models.BooleanField(default=True, help_text='Disable for unlimited-stock items')
    is_service = models.BooleanField(default=False)  # services have no stock
    is_published = models.BooleanField(default=False, help_text='Show on website CMS (Phase 3)')
    is_active = models.BooleanField(default=True)
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='created_products',
    )

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name

    @property
    def primary_image_url(self):
        img = self.images.filter(is_primary=True).first() or self.images.first()
        return img.image_url if img else None


class ProductImage(TenantModel):
    """Multiple images per product. One marked as primary."""
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='images')
    image = models.ImageField(upload_to='products/%Y/%m/', blank=True, null=True)
    image_url = models.URLField(max_length=500, blank=True,
                                 help_text='External URL alternative to uploaded file')
    caption = models.CharField(max_length=255, blank=True)
    is_primary = models.BooleanField(default=False)
    display_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['display_order', 'id']

    def __str__(self):
        return f"Image for {self.product.name}"

    def get_url(self):
        if self.image:
            return self.image.url
        return self.image_url or ''


class StockMovement(TenantModel):
    """
    Every change to stock is recorded here.
    StockLevel is always COMPUTED from aggregation — never written directly.
    """

    MOVEMENT_IN = 'in'
    MOVEMENT_OUT = 'out'
    MOVEMENT_ADJUSTMENT = 'adjustment'
    MOVEMENT_RETURN = 'return'

    MOVEMENT_TYPES = [
        (MOVEMENT_IN, 'Stock In'),
        (MOVEMENT_OUT, 'Stock Out'),
        (MOVEMENT_ADJUSTMENT, 'Adjustment'),
        (MOVEMENT_RETURN, 'Return'),
    ]

    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='movements',
    )
    movement_type = models.CharField(max_length=20, choices=MOVEMENT_TYPES)
    quantity = models.PositiveIntegerField()
    reference_type = models.CharField(max_length=64, blank=True)  # e.g. 'ticket'
    reference_id = models.PositiveIntegerField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.movement_type} {self.quantity}x {self.product_id}"


class StockLevel(TenantModel):
    """
    Read-only view of current stock.
    Updated via signal after every StockMovement save.
    Never write to this directly from views.
    """

    product = models.OneToOneField(
        Product,
        on_delete=models.CASCADE,
        related_name='stock_level',
    )
    quantity_on_hand = models.IntegerField(default=0)
    last_updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['product']

    def __str__(self):
        return f"{self.product} — {self.quantity_on_hand} on hand"
