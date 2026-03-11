from django.db import models
from core.models import TenantModel
from django.conf import settings


class TicketCategory(TenantModel):
    """
    Admin-defined category for grouping tickets (e.g. Hardware, Software, Network).
    Each tenant manages their own categories.
    """

    name = models.CharField(max_length=128)
    slug = models.SlugField(max_length=128, blank=True)
    description = models.TextField(blank=True)
    color = models.CharField(max_length=16, blank=True, help_text='Hex color code e.g. #FF5733')
    icon = models.CharField(max_length=64, blank=True, help_text='Icon name from lucide-react')
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']
        unique_together = ('tenant', 'name')

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            from django.utils.text import slugify
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)


class TicketSubCategory(TenantModel):
    """
    Admin-defined sub-category nested under a TicketCategory
    (e.g. Category: Hardware → SubCategory: Printer, Monitor).
    """

    category = models.ForeignKey(
        TicketCategory,
        on_delete=models.CASCADE,
        related_name='subcategories',
    )
    name = models.CharField(max_length=128)
    slug = models.SlugField(max_length=128, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']
        unique_together = ('category', 'name')

    def __str__(self):
        return f"{self.category.name} → {self.name}"

    def save(self, *args, **kwargs):
        if not self.slug:
            from django.utils.text import slugify
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)


class TicketType(TenantModel):
    """Ticket kind — drives the creation wizard flow (e.g. Support, Maintenance, Project)."""

    name = models.CharField(max_length=128)
    slug = models.SlugField(max_length=128, blank=True)
    default_sla_hours = models.PositiveIntegerField(default=24)
    color = models.CharField(max_length=16, blank=True, help_text='Hex color code e.g. #FF5733')
    icon = models.CharField(max_length=64, blank=True, help_text='Icon name from lucide-react')
    requires_product = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    # ── Billing configuration per ticket type ───────────────────────────────
    is_free_service = models.BooleanField(
        default=False,
        help_text='When true, no invoice is generated. Coins still awarded at service rate.',
    )
    coin_service_rate = models.DecimalField(
        max_digits=5, decimal_places=2, default=25,
        help_text='% of service charge value awarded as coins (e.g. 25 = 25%).',
    )
    coin_product_rate = models.DecimalField(
        max_digits=5, decimal_places=2, default=1,
        help_text='% of product sale value awarded as coins (e.g. 1 = 1%).',
    )

    class Meta:
        ordering = ['name']
        unique_together = ('tenant', 'name')

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            from django.utils.text import slugify
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)


class Ticket(TenantModel):
    STATUS_OPEN = 'open'
    STATUS_IN_PROGRESS = 'in_progress'
    STATUS_PENDING_CUSTOMER = 'pending_customer'
    STATUS_RESOLVED = 'resolved'
    STATUS_CLOSED = 'closed'
    STATUS_CANCELLED = 'cancelled'

    STATUS_CHOICES = [
        (STATUS_OPEN, 'Open'),
        (STATUS_IN_PROGRESS, 'In Progress'),
        (STATUS_PENDING_CUSTOMER, 'Pending Customer'),
        (STATUS_RESOLVED, 'Resolved'),
        (STATUS_CLOSED, 'Closed'),
        (STATUS_CANCELLED, 'Cancelled'),
    ]

    PRIORITY_LOW = 'low'
    PRIORITY_MEDIUM = 'medium'
    PRIORITY_HIGH = 'high'
    PRIORITY_CRITICAL = 'critical'

    PRIORITY_CHOICES = [
        (PRIORITY_LOW, 'Low'),
        (PRIORITY_MEDIUM, 'Medium'),
        (PRIORITY_HIGH, 'High'),
        (PRIORITY_CRITICAL, 'Critical'),
    ]

    # Auto-generated human-readable number per tenant, e.g. TKT-0001
    ticket_number = models.CharField(max_length=32, blank=True, db_index=True)

    ticket_type = models.ForeignKey(
        TicketType,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='tickets',
    )
    customer = models.ForeignKey(
        'customers.Customer',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='tickets',
    )
    department = models.ForeignKey(
        'departments.Department',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='tickets',
    )

    # Category / sub-category (admin-defined per tenant)
    category = models.ForeignKey(
        TicketCategory,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='tickets',
    )
    subcategory = models.ForeignKey(
        TicketSubCategory,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='tickets',
    )

    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    # Optional phone number to reach the contact person for this ticket
    contact_phone = models.CharField(max_length=32, blank=True, help_text='Phone number to contact for this ticket')
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default=STATUS_OPEN)
    priority = models.CharField(max_length=16, choices=PRIORITY_CHOICES, default=PRIORITY_MEDIUM)

    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='assigned_tickets',
    )

    # Multiple staff members who are working on this ticket
    team_members = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name='team_tickets',
    )

    # Vehicles dispatched for this ticket (can be multiple)
    vehicles = models.ManyToManyField(
        'tickets.Vehicle',
        blank=True,
        related_name='tickets',
    )

    # Linked to a parent ticket for sub-tasks / escalations
    parent_ticket = models.ForeignKey(
        'self',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='sub_tickets',
    )

    sla_deadline = models.DateTimeField(null=True, blank=True)
    resolved_at  = models.DateTimeField(null=True, blank=True)
    closed_at    = models.DateTimeField(null=True, blank=True)

    # ── Billing ──────────────────────────────────────────────────────────────
    # Service charge is the labour/visit fee, separate from product costs.
    # Product costs come from TicketProduct.unit_price * quantity.
    service_charge = models.DecimalField(
        max_digits=12, decimal_places=2, default=0,
        help_text='Service/labour fee for this ticket (separate from product costs).',
    )

    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'status'],      name='ticket_tenant_status_idx'),
            models.Index(fields=['tenant', 'assigned_to'], name='ticket_tenant_assigned_idx'),
            models.Index(fields=['tenant', 'is_deleted'],  name='ticket_tenant_deleted_idx'),
        ]

    def __str__(self):
        return f"[{self.ticket_number or self.pk}] {self.title}"

    def save(self, *args, **kwargs):
        if not self.ticket_number and self.tenant_id:
            from core.models import next_seq
            self.ticket_number = f"TKT-{next_seq(self.tenant_id, 'ticket', Ticket, 'ticket_number'):04d}"
        super().save(*args, **kwargs)


class TicketSLA(TenantModel):
    """Tracks SLA status for a ticket."""

    ticket = models.OneToOneField(Ticket, on_delete=models.CASCADE, related_name='sla')
    sla_hours = models.PositiveIntegerField()
    breach_at = models.DateTimeField(null=True, blank=True)
    warning_sent_at = models.DateTimeField(null=True, blank=True)
    breached = models.BooleanField(default=False)
    breached_at = models.DateTimeField(null=True, blank=True)
    notified = models.BooleanField(default=False)

    class Meta:
        ordering = ['breach_at']

    def __str__(self):
        return f"SLA {self.ticket} — breach_at={self.breach_at}"


class TicketComment(TenantModel):
    """Public or internal comment on a ticket."""

    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='ticket_comments',
    )
    # Optional display-name override — used for migrated data where the original
    # author is not a NEXUS user (e.g. old CRM staff / customer names).
    author_override = models.CharField(max_length=128, blank=True, default='')
    body = models.TextField()
    is_internal = models.BooleanField(default=False)  # internal notes hidden from customer
    attachment_files = models.JSONField(default=list, blank=True)  # [{file_url, file_name, file_size}]

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"Comment by {self.author_id} on {self.ticket_id}"


class TicketAttachment(TenantModel):
    """File attached to a ticket or a specific comment."""

    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name='attachments')
    comment = models.ForeignKey(
        TicketComment, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='file_attachments',
    )
    # Actual uploaded file (preferred)
    file = models.FileField(upload_to='attachments/tickets/%Y/%m/', null=True, blank=True)
    # Legacy / external URL fallback
    file_url = models.URLField(blank=True)
    file_name = models.CharField(max_length=255, blank=True)
    file_size = models.PositiveIntegerField(default=0, help_text='Size in bytes')
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, on_delete=models.SET_NULL,
        related_name='ticket_attachments',
    )

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.file_name} on Ticket {self.ticket_id}"


class TicketTransfer(TenantModel):
    """Audit trail of department transfers on a ticket."""

    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name='transfers')
    from_department = models.ForeignKey(
        'departments.Department',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='outgoing_transfers',
    )
    to_department = models.ForeignKey(
        'departments.Department',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='incoming_transfers',
    )
    transferred_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name='ticket_transfers',
    )
    reason = models.TextField(blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Transfer {self.ticket_id}: {self.from_department_id} → {self.to_department_id}"


class TicketTimeline(TenantModel):
    """Chronological event log for a ticket — status changes, assignments, transfers, comments."""

    EVENT_STATUS_CHANGE = 'status_change'
    EVENT_ASSIGNED = 'assigned'
    EVENT_TRANSFERRED = 'transferred'
    EVENT_COMMENTED = 'commented'
    EVENT_PRODUCT_ADDED = 'product_added'
    EVENT_CREATED = 'created'

    EVENT_TYPES = [
        (EVENT_STATUS_CHANGE, 'Status Change'),
        (EVENT_ASSIGNED, 'Assigned'),
        (EVENT_TRANSFERRED, 'Transferred'),
        (EVENT_COMMENTED, 'Commented'),
        (EVENT_PRODUCT_ADDED, 'Product Added'),
        (EVENT_CREATED, 'Created'),
    ]

    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name='timeline')
    event_type = models.CharField(max_length=32, choices=EVENT_TYPES)
    description = models.TextField()
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='ticket_timeline_events',
    )
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"[{self.event_type}] Ticket {self.ticket_id} at {self.created_at}"


class TicketProduct(TenantModel):
    """
    Product / part used while resolving a ticket.

    Saving triggers a StockMovement(type=out) via signal in inventory.signals.
    Cancelling the parent ticket reverses the movement via signal.
    """

    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name='products')
    product = models.ForeignKey(
        'inventory.Product',
        on_delete=models.PROTECT,
        related_name='ticket_usages',
    )
    quantity   = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    discount   = models.DecimalField(
        max_digits=5, decimal_places=2, default=0,
        help_text="Discount percentage (0–100). e.g. 10 = 10% off unit_price.",
    )

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"{self.quantity}x {self.product_id} on Ticket {self.ticket_id}"



# ── Vehicle Registry ──────────────────────────────────────────────────────────

class Vehicle(TenantModel):
    """
    Tenant-owned vehicle used for field visits attached to tickets.
    Admins maintain the fleet here; rate_per_km drives billing in VehicleLog.
    """

    TYPE_CAR       = 'car'
    TYPE_MOTORBIKE = 'motorbike'
    TYPE_VAN       = 'van'
    TYPE_TRUCK     = 'truck'
    TYPE_OTHER     = 'other'
    TYPE_CHOICES = [
        (TYPE_CAR,       'Car'),
        (TYPE_MOTORBIKE, 'Motorbike'),
        (TYPE_VAN,       'Van'),
        (TYPE_TRUCK,     'Truck'),
        (TYPE_OTHER,     'Other'),
    ]

    FUEL_PETROL   = 'petrol'
    FUEL_DIESEL   = 'diesel'
    FUEL_ELECTRIC = 'electric'
    FUEL_HYBRID   = 'hybrid'
    FUEL_CHOICES = [
        (FUEL_PETROL,   'Petrol'),
        (FUEL_DIESEL,   'Diesel'),
        (FUEL_ELECTRIC, 'Electric'),
        (FUEL_HYBRID,   'Hybrid'),
    ]

    name         = models.CharField(max_length=128, help_text='e.g. Company Hilux')
    plate_number = models.CharField(max_length=32, blank=True, help_text='License plate')
    type         = models.CharField(max_length=16, choices=TYPE_CHOICES, default=TYPE_CAR)
    fuel_type    = models.CharField(max_length=16, choices=FUEL_CHOICES, default=FUEL_PETROL)
    rate_per_km  = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
        help_text='Billing rate per km in tenant currency',
    )
    notes     = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.plate_number})" if self.plate_number else self.name


class VehicleLog(TenantModel):
    """
    One record per vehicle trip, optionally linked to a ticket.
    billing_amount = distance_km x vehicle.rate_per_km
    """

    vehicle = models.ForeignKey(
        Vehicle, on_delete=models.PROTECT, related_name='logs',
    )
    ticket = models.ForeignKey(
        Ticket, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='vehicle_logs',
    )
    driven_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='vehicle_logs',
    )
    date           = models.DateField()
    odometer_start = models.DecimalField(max_digits=10, decimal_places=1)
    odometer_end   = models.DecimalField(max_digits=10, decimal_places=1)
    fuel_liters    = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    fuel_cost      = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True,
        help_text='Actual fuel money spent',
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-date', '-created_at']

    @property
    def distance_km(self):
        return float(max(self.odometer_end - self.odometer_start, 0))

    @property
    def billing_amount(self):
        return round(self.distance_km * float(self.vehicle.rate_per_km), 2)

    def __str__(self):
        return f"{self.vehicle} on {self.date} ({self.distance_km} km)"
