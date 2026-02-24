import uuid
from django.db import models
from core.models import TenantModel
from django.conf import settings


class CoinTransaction(TenantModel):
    """
    Awarded to staff when a ticket is closed.
    Created with status=pending by signal; admin approves/rejects.
    Approved coins accumulate in Payslip for the current period.
    """

    STATUS_PENDING = 'pending'
    STATUS_APPROVED = 'approved'
    STATUS_REJECTED = 'rejected'

    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_APPROVED, 'Approved'),
        (STATUS_REJECTED, 'Rejected'),
    ]

    SOURCE_TICKET = 'ticket'
    SOURCE_TASK = 'task'
    SOURCE_MANUAL = 'manual'

    SOURCE_TYPES = [
        (SOURCE_TICKET, 'Ticket'),
        (SOURCE_TASK, 'Task'),
        (SOURCE_MANUAL, 'Manual'),
    ]

    staff = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='coin_transactions',
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    source_type = models.CharField(max_length=32, choices=SOURCE_TYPES, default=SOURCE_TICKET)
    source_id = models.PositiveIntegerField(null=True, blank=True)  # ticket.pk
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='approved_coin_transactions',
    )
    note = models.TextField(blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.staff} +{self.amount} coins [{self.status}]"


class Payslip(TenantModel):
    """
    Aggregates approved coins for a staff member within a pay period.
    coin_to_money_rate is snapshotted from Tenant at payslip creation time.
    """

    STATUS_DRAFT = 'draft'
    STATUS_ISSUED = 'issued'
    STATUS_PAID = 'paid'

    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Draft'),
        (STATUS_ISSUED, 'Issued'),
        (STATUS_PAID, 'Paid'),
    ]

    staff = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='payslips',
    )
    period_start = models.DateField()
    period_end = models.DateField()
    total_coins = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    coin_to_money_rate = models.DecimalField(max_digits=10, decimal_places=4, default=1)
    gross_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    issued_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-period_end']
        unique_together = ('tenant', 'staff', 'period_start', 'period_end')

    def __str__(self):
        return f"Payslip {self.staff} {self.period_start}–{self.period_end}"


class Invoice(TenantModel):
    """
    Issued to a customer for ticket work, project work, or ad-hoc items.
    VAT is never hardcoded — always read from tenant.vat_rate.
    """

    STATUS_DRAFT = 'draft'
    STATUS_ISSUED = 'issued'
    STATUS_PAID = 'paid'
    STATUS_VOID = 'void'

    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Draft'),
        (STATUS_ISSUED, 'Issued'),
        (STATUS_PAID, 'Paid'),
        (STATUS_VOID, 'Void'),
    ]

    invoice_number = models.CharField(max_length=32, blank=True, db_index=True)
    customer = models.ForeignKey(
        'customers.Customer',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='invoices',
    )
    ticket = models.ForeignKey(
        'tickets.Ticket',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='invoices',
    )
    project = models.ForeignKey(
        'projects.Project',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='invoices',
    )

    # Line items: [{"description": str, "qty": int, "unit_price": str, "discount": str}]
    line_items = models.JSONField(default=list)

    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    discount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    vat_rate = models.DecimalField(max_digits=5, decimal_places=4, default=0)
    vat_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    due_date = models.DateField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Invoice {self.invoice_number or self.pk}"

    def save(self, *args, **kwargs):
        if not self.invoice_number and self.tenant_id:
            last = (
                Invoice.objects.filter(tenant_id=self.tenant_id)
                .order_by('-created_at')
                .values_list('invoice_number', flat=True)
                .first()
            )
            if last:
                try:
                    seq = int(last.split('-')[-1]) + 1
                except (ValueError, IndexError):
                    seq = 1
            else:
                seq = 1
            self.invoice_number = f"INV-{seq:05d}"
        super().save(*args, **kwargs)
