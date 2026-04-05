from django.db import models
from django.conf import settings
from core.models import TenantModel


# ── Unit of Measure ───────────────────────────────────────────────────────────

class UnitOfMeasure(TenantModel):
    """Units like pieces, kg, litres, boxes, etc."""

    TYPE_UNIT   = 'unit'
    TYPE_WEIGHT = 'weight'
    TYPE_VOLUME = 'volume'
    TYPE_LENGTH = 'length'
    TYPE_CHOICES = [
        (TYPE_UNIT,   'Unit'),
        (TYPE_WEIGHT, 'Weight'),
        (TYPE_VOLUME, 'Volume'),
        (TYPE_LENGTH, 'Length'),
    ]

    name         = models.CharField(max_length=64)
    abbreviation = models.CharField(max_length=16)
    unit_type    = models.CharField(max_length=16, choices=TYPE_CHOICES, default=TYPE_UNIT)

    class Meta:
        ordering = ['name']
        unique_together = ('tenant', 'name')

    def __str__(self):
        return f"{self.name} ({self.abbreviation})"


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
    uom = models.ForeignKey(
        'UnitOfMeasure',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='products',
        help_text='Unit of measure for this product',
    )
    track_stock = models.BooleanField(default=True, help_text='Disable for unlimited-stock items')
    has_variants = models.BooleanField(default=False, help_text='Product has size/color/spec variants')
    has_warranty = models.BooleanField(default=False, help_text='Requires serial number tracking when used/sold')
    warranty_months = models.PositiveIntegerField(
        null=True, blank=True,
        help_text='Default warranty duration in months (e.g. 12 = 1 year)',
    )
    warranty_description = models.TextField(
        blank=True,
        help_text='Warranty terms, conditions, or coverage details',
    )
    is_service = models.BooleanField(default=False)  # services have no stock
    is_bundle = models.BooleanField(default=False, help_text='Bundle product — composed of component products')
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


class SerialNumber(TenantModel):
    """
    Serial number tracking for warranty products.
    Created when a product with has_warranty=True is used/sold in tickets/projects.
    Status: available → used | damaged | returned
    """

    STATUS_AVAILABLE = 'available'
    STATUS_USED      = 'used'
    STATUS_DAMAGED   = 'damaged'
    STATUS_RETURNED  = 'returned'

    STATUS_CHOICES = [
        (STATUS_AVAILABLE, 'Available'),
        (STATUS_USED,      'Used / Sold'),
        (STATUS_DAMAGED,   'Damaged'),
        (STATUS_RETURNED,  'Returned'),
    ]

    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='serial_numbers',
        limit_choices_to={'has_warranty': True},
    )
    serial_number = models.CharField(max_length=255, help_text='Unique serial/IMEI number')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_AVAILABLE)
    # Reference to where this serial was used
    reference_type = models.CharField(max_length=64, blank=True,  # e.g. 'ticket', 'project', 'invoice'
                                        help_text='Model name where used')
    reference_id = models.PositiveIntegerField(null=True, blank=True,
                                                 help_text='ID of ticket/project/invoice')
    notes = models.TextField(blank=True)
    used_at = models.DateTimeField(null=True, blank=True, help_text='When marked as used')
    warranty_expires = models.DateField(null=True, blank=True, help_text='Warranty expiry date')

    class Meta:
        ordering = ['-created_at']
        unique_together = ('tenant', 'product', 'serial_number')
        indexes = [
            models.Index(fields=['tenant', 'product', 'status']),
            models.Index(fields=['serial_number']),
        ]

    def __str__(self):
        return f"{self.product.name} — {self.serial_number} ({self.status})"


class StockMovement(TenantModel):
    """
    Every change to stock is recorded here.
    StockLevel is always COMPUTED from aggregation — never written directly.
    """

    MOVEMENT_IN              = 'in'
    MOVEMENT_OUT             = 'out'
    MOVEMENT_ADJUSTMENT      = 'adjustment'
    MOVEMENT_RETURN          = 'return'
    MOVEMENT_RETURN_SUPPLIER = 'return_supplier'

    MOVEMENT_TYPES = [
        (MOVEMENT_IN,              'Stock In'),
        (MOVEMENT_OUT,             'Stock Out'),
        (MOVEMENT_ADJUSTMENT,      'Adjustment'),
        (MOVEMENT_RETURN,          'Return from Customer'),
        (MOVEMENT_RETURN_SUPPLIER, 'Return to Supplier'),
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
        indexes = [
            # Accelerates per-tenant stock movement queries filtered by product+type
            # (e.g. aggregate IN quantities for a product within a tenant).
            models.Index(
                fields=['tenant', 'product', 'movement_type'],
                name='stkmov_tenant_prod_type_idx',
            ),
            # Accelerates the most recent movements lookup per product
            # (used both by signals that update StockLevel and admin timelines).
            models.Index(
                fields=['product', '-created_at'],
                name='stockmov_product_recent_idx',
            ),
        ]

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


# ── Supplier ──────────────────────────────────────────────────────────────────

class Supplier(TenantModel):
    """Vendor/supplier that products are purchased from."""

    name           = models.CharField(max_length=255)
    party          = models.OneToOneField(
        'parties.Party',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='supplier_profile',
    )
    contact_person = models.CharField(max_length=128, blank=True)
    email          = models.EmailField(blank=True)
    phone          = models.CharField(max_length=32, blank=True)
    address        = models.TextField(blank=True)
    city           = models.CharField(max_length=128, blank=True)
    country        = models.CharField(max_length=64, blank=True, default='Nepal')
    website        = models.URLField(max_length=300, blank=True)
    payment_terms  = models.CharField(max_length=128, blank=True,
                                       help_text='e.g. Net 30, COD')
    notes          = models.TextField(blank=True)
    is_active      = models.BooleanField(default=True)
    pan_number     = models.CharField(max_length=20, blank=True, help_text='Nepal PAN / VAT number (9-digit)')

    class Meta:
        ordering = ['name']
        unique_together = ('tenant', 'name')

    def __str__(self):
        return self.name


# ── Purchase Order ────────────────────────────────────────────────────────────

class PurchaseOrder(TenantModel):
    """
    A purchase order sent to a supplier.
    Status flow: draft → sent → partial | received | cancelled
    Stock is updated when items are marked as received.
    """

    STATUS_DRAFT     = 'draft'
    STATUS_SENT      = 'sent'
    STATUS_PARTIAL   = 'partial'
    STATUS_RECEIVED  = 'received'
    STATUS_CANCELLED = 'cancelled'

    STATUS_CHOICES = [
        (STATUS_DRAFT,     'Draft'),
        (STATUS_SENT,      'Sent'),
        (STATUS_PARTIAL,   'Partially Received'),
        (STATUS_RECEIVED,  'Fully Received'),
        (STATUS_CANCELLED, 'Cancelled'),
    ]

    po_number         = models.CharField(max_length=64, blank=True,
                                          help_text='Auto-generated if blank')
    supplier          = models.ForeignKey(
        Supplier,
        on_delete=models.PROTECT,
        related_name='purchase_orders',
    )
    status            = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    expected_delivery = models.DateField(null=True, blank=True)
    notes             = models.TextField(blank=True)
    received_by       = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='received_purchase_orders',
    )
    received_at       = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.po_number or f"PO#{self.pk}"

    def save(self, *args, **kwargs):
        """Auto-generate PO number on first save."""
        super().save(*args, **kwargs)
        if not self.po_number:
            self.po_number = f"PO-{self.pk:05d}"
            PurchaseOrder.objects.filter(pk=self.pk).update(po_number=self.po_number)

    @property
    def total_amount(self):
        return sum(
            (item.quantity_ordered * item.unit_cost)
            for item in self.items.all()
        )

    @property
    def total_received(self):
        return sum(item.quantity_received for item in self.items.all())

    @property
    def total_ordered(self):
        return sum(item.quantity_ordered for item in self.items.all())


class PurchaseOrderItem(TenantModel):
    """A single line in a purchase order."""

    po              = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.CASCADE,
        related_name='items',
    )
    product         = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name='po_items',
    )
    quantity_ordered  = models.PositiveIntegerField(default=1)
    quantity_received = models.PositiveIntegerField(default=0)
    unit_cost         = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                             help_text='Cost per unit at time of PO creation')

    class Meta:
        ordering = ['id']
        unique_together = ('po', 'product')

    def __str__(self):
        return f"{self.product.name} x{self.quantity_ordered}"

    @property
    def line_total(self):
        return self.quantity_ordered * self.unit_cost

    @property
    def pending_quantity(self):
        return self.quantity_ordered - self.quantity_received


# ── Product Variants ──────────────────────────────────────────────────────────

class ProductVariant(TenantModel):
    """
    A specific variation of a product (e.g. iPhone 15 / 128GB / Black).
    Attributes stored as JSON: {'Color': 'Black', 'Storage': '128GB'}
    Stock is tracked per variant via VariantStockLevel (computed from movements).
    """

    product           = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='variants',
    )
    sku               = models.CharField(max_length=64, blank=True)
    barcode           = models.CharField(max_length=64, blank=True)
    attributes        = models.JSONField(default=dict,
                                          help_text='e.g. {"Color": "Black", "Storage": "128GB"}')
    price_adjustment  = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                             help_text='Added to/subtracted from parent product price')
    cost_price        = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    reorder_level     = models.PositiveIntegerField(default=0)
    is_active         = models.BooleanField(default=True)

    class Meta:
        ordering = ['id']
        unique_together = ('product', 'sku')

    def __str__(self):
        attrs = ', '.join(f"{k}: {v}" for k, v in self.attributes.items())
        return f"{self.product.name} [{attrs}]"

    @property
    def effective_price(self):
        return float(self.product.unit_price) + float(self.price_adjustment)

    @property
    def stock_on_hand(self):
        try:
            return self.stock_level.quantity_on_hand
        except Exception:
            return 0


class VariantStockLevel(TenantModel):
    """Computed stock level per product variant. Never write directly — use StockMovement."""

    variant           = models.OneToOneField(
        ProductVariant,
        on_delete=models.CASCADE,
        related_name='stock_level',
    )
    quantity_on_hand  = models.IntegerField(default=0)
    last_updated      = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['variant']

    def __str__(self):
        return f"{self.variant} — {self.quantity_on_hand} on hand"


# ── Return to Supplier ────────────────────────────────────────────────────────

class ReturnOrder(TenantModel):
    """
    Items returned to a supplier (defective, wrong item, overstock).
    Status: draft → sent → accepted | cancelled
    When sent, a StockMovement(return_supplier) is created to decrement stock.
    """

    STATUS_DRAFT     = 'draft'
    STATUS_SENT      = 'sent'
    STATUS_ACCEPTED  = 'accepted'
    STATUS_CANCELLED = 'cancelled'

    STATUS_CHOICES = [
        (STATUS_DRAFT,     'Draft'),
        (STATUS_SENT,      'Sent to Supplier'),
        (STATUS_ACCEPTED,  'Accepted by Supplier'),
        (STATUS_CANCELLED, 'Cancelled'),
    ]

    REASON_DEFECTIVE  = 'defective'
    REASON_WRONG_ITEM = 'wrong_item'
    REASON_OVERSTOCK  = 'overstock'
    REASON_EXPIRED    = 'expired'
    REASON_OTHER      = 'other'

    REASON_CHOICES = [
        (REASON_DEFECTIVE,  'Defective / Damaged'),
        (REASON_WRONG_ITEM, 'Wrong Item Received'),
        (REASON_OVERSTOCK,  'Overstock'),
        (REASON_EXPIRED,    'Expired'),
        (REASON_OTHER,      'Other'),
    ]

    return_number  = models.CharField(max_length=64, blank=True)
    supplier       = models.ForeignKey(
        Supplier,
        on_delete=models.PROTECT,
        related_name='return_orders',
    )
    purchase_order = models.ForeignKey(
        PurchaseOrder,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='return_orders',
        help_text='Original PO this return relates to (optional)',
    )
    status         = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    reason         = models.CharField(max_length=20, choices=REASON_CHOICES, default=REASON_DEFECTIVE)
    notes          = models.TextField(blank=True)
    sent_at        = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.return_number or f"RET#{self.pk}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if not self.return_number:
            self.return_number = f"RET-{self.pk:05d}"
            ReturnOrder.objects.filter(pk=self.pk).update(return_number=self.return_number)

    @property
    def total_items(self):
        return sum(item.quantity for item in self.items.all())

    @property
    def total_value(self):
        return sum(item.quantity * item.unit_cost for item in self.items.all())


class ReturnOrderItem(TenantModel):
    """A single product line in a supplier return."""

    return_order = models.ForeignKey(
        ReturnOrder,
        on_delete=models.CASCADE,
        related_name='items',
    )
    product      = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name='return_items',
    )
    quantity     = models.PositiveIntegerField(default=1)
    unit_cost    = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        ordering = ['id']
        unique_together = ('return_order', 'product')

    def __str__(self):
        return f"{self.product.name} x{self.quantity}"

    @property
    def line_total(self):
        return self.quantity * self.unit_cost


# ── Supplier–Product Catalog ──────────────────────────────────────────────────

class SupplierProduct(TenantModel):
    """
    Maps a product to a supplier with supplier-specific pricing and metadata.
    A product may have multiple suppliers; exactly one per product should be
    marked is_preferred=True (enforced at the view level).
    """

    supplier       = models.ForeignKey(
        Supplier,
        on_delete=models.CASCADE,
        related_name='supplier_products',
    )
    product        = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='supplier_products',
    )
    supplier_sku   = models.CharField(max_length=128, blank=True,
                                       help_text="Supplier's own product code")
    unit_cost      = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    lead_time_days = models.PositiveIntegerField(default=0,
                                                  help_text='Average delivery lead time in days')
    min_order_qty  = models.PositiveIntegerField(default=1)
    is_preferred   = models.BooleanField(default=False,
                                          help_text='Use this supplier for auto-reorder')
    notes          = models.TextField(blank=True)

    class Meta:
        ordering = ['-is_preferred', 'supplier__name']
        unique_together = ('supplier', 'product')

    def __str__(self):
        return f"{self.supplier.name} → {self.product.name}"


# ── Stock Count (Stocktake) ───────────────────────────────────────────────────

class StockCount(TenantModel):
    """
    A physical inventory counting session.
    Status flow: draft → counting → completed | cancelled
    On completion, adjustment StockMovements are auto-created for all discrepancies.
    """

    STATUS_DRAFT     = 'draft'
    STATUS_COUNTING  = 'counting'
    STATUS_COMPLETED = 'completed'
    STATUS_CANCELLED = 'cancelled'
    STATUS_CHOICES = [
        (STATUS_DRAFT,     'Draft'),
        (STATUS_COUNTING,  'Counting'),
        (STATUS_COMPLETED, 'Completed'),
        (STATUS_CANCELLED, 'Cancelled'),
    ]

    count_number  = models.CharField(max_length=32, blank=True, editable=False)
    description   = models.CharField(max_length=255, blank=True)
    status        = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    # Snapshot: category filter used when count was started (optional)
    category      = models.ForeignKey(
        Category,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='stock_counts',
        help_text='Limit this count to one category (optional)',
    )
    completed_at  = models.DateTimeField(null=True, blank=True)
    completed_by  = models.ForeignKey(
        'accounts.User',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='completed_stock_counts',
    )

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.count_number or f"SC#{self.pk}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if not self.count_number:
            self.count_number = f"SC-{self.pk:05d}"
            StockCount.objects.filter(pk=self.pk).update(count_number=self.count_number)

    @property
    def total_items(self):
        return self.items.count()

    @property
    def discrepancy_count(self):
        return self.items.exclude(discrepancy=0).count()


class StockCountItem(TenantModel):
    """
    One product line in a stock count.
    expected_qty is snapshot from StockLevel at session start.
    counted_qty is what the user physically found.
    discrepancy = counted_qty - expected_qty (negative = shrinkage).
    """

    stock_count   = models.ForeignKey(
        StockCount,
        on_delete=models.CASCADE,
        related_name='items',
    )
    product       = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name='count_items',
    )
    expected_qty  = models.IntegerField(default=0,
                                         help_text='System quantity at session start')
    counted_qty   = models.IntegerField(null=True, blank=True,
                                         help_text='Physically counted quantity (null = not yet counted)')
    notes         = models.TextField(blank=True)

    class Meta:
        ordering = ['product__name']
        unique_together = ('stock_count', 'product')

    def __str__(self):
        return f"{self.product.name} — expected {self.expected_qty}, counted {self.counted_qty}"

    @property
    def discrepancy(self):
        if self.counted_qty is None:
            return 0
        return self.counted_qty - self.expected_qty


# ── Product Bundle ────────────────────────────────────────────────────────────

class ProductBundle(TenantModel):
    """
    Bundle composition — defines which products make up a bundle product.
    The parent product must have is_bundle=True.
    Example: "Laptop Repair Kit" bundle = [Screen x1, Battery x1, Keyboard x1].
    """

    bundle = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='bundle_components',
        limit_choices_to={'is_bundle': True},
        help_text='The parent bundle product',
    )
    component = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name='included_in_bundles',
        help_text='Component product included in this bundle',
    )
    quantity = models.PositiveIntegerField(
        default=1,
        help_text='Quantity of this component per bundle unit',
    )

    class Meta(TenantModel.Meta):
        ordering = ['component__name']
        unique_together = ('tenant', 'bundle', 'component')
        indexes = [
            models.Index(fields=['tenant', 'bundle']),
        ]

    def __str__(self):
        return f"{self.bundle.name} → {self.component.name} ×{self.quantity}"


# ── Supplier Payment ──────────────────────────────────────────────────────────

class SupplierPayment(TenantModel):
    """
    Record of a payment made to a supplier.
    Tracks how much has been paid per PO so the outstanding balance is visible.
    """

    PAYMENT_CASH         = 'cash'
    PAYMENT_BANK         = 'bank_transfer'
    PAYMENT_CHEQUE       = 'cheque'
    PAYMENT_MOBILE       = 'mobile_banking'
    PAYMENT_OTHER        = 'other'

    PAYMENT_METHOD_CHOICES = [
        (PAYMENT_CASH,   'Cash'),
        (PAYMENT_BANK,   'Bank Transfer'),
        (PAYMENT_CHEQUE, 'Cheque'),
        (PAYMENT_MOBILE, 'Mobile Banking'),
        (PAYMENT_OTHER,  'Other'),
    ]

    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.PROTECT,
        related_name='payments',
    )
    purchase_order = models.ForeignKey(
        PurchaseOrder,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='payments',
        help_text='Leave blank for a general supplier payment not tied to a PO',
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    payment_date = models.DateField()
    payment_method = models.CharField(
        max_length=20,
        choices=PAYMENT_METHOD_CHOICES,
        default=PAYMENT_BANK,
    )
    reference = models.CharField(
        max_length=128,
        blank=True,
        help_text='Cheque number, transaction ID, or other reference',
    )
    notes = models.TextField(blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='recorded_supplier_payments',
    )

    class Meta(TenantModel.Meta):
        ordering = ['-payment_date', '-created_at']
        indexes = [
            models.Index(fields=['tenant', 'supplier']),
            models.Index(fields=['tenant', 'purchase_order']),
            models.Index(fields=['tenant', 'payment_date']),
        ]

    def __str__(self):
        return f"Payment {self.amount} to {self.supplier.name} on {self.payment_date}"
