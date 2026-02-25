import uuid
from decimal import Decimal
from django.db import models
from core.models import TenantModel
from django.conf import settings


# ─────────────────────────────────────────────────────────────────────────────
# Chart of Accounts
# ─────────────────────────────────────────────────────────────────────────────

class Account(TenantModel):
    """
    Chart of Accounts entry.  Supports parent/child hierarchy for sub-accounts.
    System accounts (is_system=True) are seeded automatically and cannot be deleted.

    Account type drives which side of the balance increases it:
      asset / expense      → debit increases
      liability / equity / revenue → credit increases
    """

    TYPE_ASSET     = 'asset'
    TYPE_LIABILITY = 'liability'
    TYPE_EQUITY    = 'equity'
    TYPE_REVENUE   = 'revenue'
    TYPE_EXPENSE   = 'expense'

    TYPE_CHOICES = [
        (TYPE_ASSET,     'Asset'),
        (TYPE_LIABILITY, 'Liability'),
        (TYPE_EQUITY,    'Equity'),
        (TYPE_REVENUE,   'Revenue'),
        (TYPE_EXPENSE,   'Expense'),
    ]

    code        = models.CharField(max_length=20, db_index=True)
    name        = models.CharField(max_length=120)
    type        = models.CharField(max_length=16, choices=TYPE_CHOICES)
    parent      = models.ForeignKey(
        'self', null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='children',
    )
    description = models.TextField(blank=True)
    is_system   = models.BooleanField(default=False)   # seeded accounts, not deletable
    is_active   = models.BooleanField(default=True)

    class Meta:
        ordering = ['code']
        unique_together = ('tenant', 'code')

    def __str__(self):
        return f"{self.code} – {self.name}"

    @property
    def balance(self):
        """Net balance: sum(debits) - sum(credits) for asset/expense; reversed otherwise."""
        from django.db.models import Sum
        lines = self.journal_lines.filter(entry__is_posted=True)
        debits  = lines.aggregate(t=Sum('debit'))['t']  or Decimal('0')
        credits = lines.aggregate(t=Sum('credit'))['t'] or Decimal('0')
        if self.type in (self.TYPE_ASSET, self.TYPE_EXPENSE):
            return debits - credits
        return credits - debits


# ─────────────────────────────────────────────────────────────────────────────
# Bank Accounts
# ─────────────────────────────────────────────────────────────────────────────

class BankAccount(TenantModel):
    """A tenant's real-world bank account, linked to an asset Account in the CoA."""

    name            = models.CharField(max_length=120)
    bank_name       = models.CharField(max_length=120, blank=True)
    account_number  = models.CharField(max_length=64, blank=True)
    currency        = models.CharField(max_length=8, default='NPR')
    opening_balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    # Link to the Cash/Bank asset account in Chart of Accounts
    linked_account  = models.OneToOneField(
        Account, null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='bank_account',
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.currency})"

    @property
    def current_balance(self):
        """opening_balance + incoming payments - outgoing payments."""
        from django.db.models import Sum
        incoming = self.payments.filter(type='incoming').aggregate(t=Sum('amount'))['t'] or Decimal('0')
        outgoing = self.payments.filter(type='outgoing').aggregate(t=Sum('amount'))['t'] or Decimal('0')
        return self.opening_balance + incoming - outgoing


# ─────────────────────────────────────────────────────────────────────────────
# Journal Entries — double-entry core
# ─────────────────────────────────────────────────────────────────────────────

class JournalEntry(TenantModel):
    """
    Immutable double-entry journal entry.
    Posted entries are locked: total_debit must equal total_credit.

    Entries are auto-created by signals when:
      - Invoice status → issued  (debit AR, credit Revenue + VAT Payable)
      - Payment recorded         (debit Cash/Bank, credit AR or AP)
      - Bill status → approved   (debit Expense, credit AP + VAT Payable)
      - CreditNote issued        (reversal of Invoice entry)
      - Payslip paid             (debit Salary Expense, credit Cash/Bank)
    """

    REF_INVOICE     = 'invoice'
    REF_BILL        = 'bill'
    REF_PAYMENT     = 'payment'
    REF_CREDIT_NOTE = 'credit_note'
    REF_PAYSLIP     = 'payslip'
    REF_MANUAL      = 'manual'

    REF_CHOICES = [
        (REF_INVOICE,     'Invoice'),
        (REF_BILL,        'Bill'),
        (REF_PAYMENT,     'Payment'),
        (REF_CREDIT_NOTE, 'Credit Note'),
        (REF_PAYSLIP,     'Payslip'),
        (REF_MANUAL,      'Manual'),
    ]

    entry_number   = models.CharField(max_length=32, blank=True, db_index=True)
    date           = models.DateField()
    description    = models.TextField(blank=True)
    reference_type = models.CharField(max_length=20, choices=REF_CHOICES, default=REF_MANUAL)
    reference_id   = models.PositiveIntegerField(null=True, blank=True)
    is_posted      = models.BooleanField(default=False)  # posted = locked
    total_debit    = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_credit   = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    class Meta:
        ordering = ['-date', '-created_at']
        verbose_name_plural = 'journal entries'

    def __str__(self):
        return f"{self.entry_number or self.pk} – {self.date}"

    def save(self, *args, **kwargs):
        if not self.entry_number and self.tenant_id:
            last = (
                JournalEntry.objects.filter(tenant_id=self.tenant_id)
                .order_by('-created_at')
                .values_list('entry_number', flat=True)
                .first()
            )
            try:
                seq = int(str(last).split('-')[-1]) + 1 if last else 1
            except (ValueError, IndexError):
                seq = 1
            self.entry_number = f"JE-{seq:05d}"
        super().save(*args, **kwargs)

    def post(self):
        """Validate balance and mark as posted (locked)."""
        from django.db.models import Sum
        lines   = self.lines.all()
        debits  = lines.aggregate(t=Sum('debit'))['t']  or Decimal('0')
        credits = lines.aggregate(t=Sum('credit'))['t'] or Decimal('0')
        if debits != credits:
            raise ValueError(f"Journal entry unbalanced: debit={debits} credit={credits}")
        self.total_debit  = debits
        self.total_credit = credits
        self.is_posted    = True
        self.save(update_fields=['total_debit', 'total_credit', 'is_posted'])


class JournalLine(models.Model):
    """A single debit or credit line within a JournalEntry."""

    entry       = models.ForeignKey(JournalEntry, on_delete=models.CASCADE, related_name='lines')
    account     = models.ForeignKey(Account, on_delete=models.PROTECT, related_name='journal_lines')
    debit       = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    credit      = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    description = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ['id']

    def __str__(self):
        side = f"Dr {self.debit}" if self.debit else f"Cr {self.credit}"
        return f"{self.account} | {side}"


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
    base_salary  = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    bonus        = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    deductions   = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    net_pay      = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    status    = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    issued_at = models.DateTimeField(null=True, blank=True)
    paid_at   = models.DateTimeField(null=True, blank=True)

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

    status        = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    due_date      = models.DateField(null=True, blank=True)
    paid_at       = models.DateTimeField(null=True, blank=True)
    notes         = models.TextField(blank=True)
    bill_address  = models.TextField(blank=True)
    payment_terms = models.PositiveIntegerField(default=30)   # days net
    reference     = models.CharField(max_length=64, blank=True)  # PO ref

    @property
    def amount_paid(self):
        from django.db.models import Sum
        return self.payments.aggregate(t=Sum('amount'))['t'] or Decimal('0')

    @property
    def amount_due(self):
        return max(self.total - self.amount_paid, Decimal('0'))

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


# ─────────────────────────────────────────────────────────────────────────────
# Bills  (supplier expenses)
# ─────────────────────────────────────────────────────────────────────────────

class Bill(TenantModel):
    """
    A supplier bill / expense document.
    Journal entry auto-created on status → approved via signal.
    Lifecycle: draft → approved → paid | void
    """

    STATUS_DRAFT    = 'draft'
    STATUS_APPROVED = 'approved'
    STATUS_PAID     = 'paid'
    STATUS_VOID     = 'void'

    STATUS_CHOICES = [
        (STATUS_DRAFT,    'Draft'),
        (STATUS_APPROVED, 'Approved'),
        (STATUS_PAID,     'Paid'),
        (STATUS_VOID,     'Void'),
    ]

    bill_number   = models.CharField(max_length=32, blank=True, db_index=True)
    supplier      = models.ForeignKey(
        'inventory.Supplier',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='bills',
    )
    supplier_name = models.CharField(max_length=200, blank=True)
    line_items    = models.JSONField(default=list)
    subtotal      = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    discount      = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    vat_rate      = models.DecimalField(max_digits=5,  decimal_places=4, default=0)
    vat_amount    = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total         = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    status        = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    due_date      = models.DateField(null=True, blank=True)
    reference     = models.CharField(max_length=64, blank=True)
    notes         = models.TextField(blank=True)
    approved_at   = models.DateTimeField(null=True, blank=True)
    paid_at       = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Bill {self.bill_number or self.pk}"

    def save(self, *args, **kwargs):
        if not self.bill_number and self.tenant_id:
            last = (
                Bill.objects.filter(tenant_id=self.tenant_id)
                .order_by('-created_at')
                .values_list('bill_number', flat=True)
                .first()
            )
            try:
                seq = int(str(last).split('-')[-1]) + 1 if last else 1
            except (ValueError, IndexError):
                seq = 1
            self.bill_number = f"BILL-{seq:05d}"
        super().save(*args, **kwargs)

    @property
    def amount_paid(self):
        from django.db.models import Sum
        return self.payments.aggregate(t=Sum('amount'))['t'] or Decimal('0')

    @property
    def amount_due(self):
        return max(self.total - self.amount_paid, Decimal('0'))


# ─────────────────────────────────────────────────────────────────────────────
# Payments
# ─────────────────────────────────────────────────────────────────────────────

class Payment(TenantModel):
    """
    Records cash movement: incoming from customer (linked to Invoice) or
    outgoing to supplier (linked to Bill).
    Journal entry auto-created by signal on post_save.
    """

    TYPE_INCOMING = 'incoming'
    TYPE_OUTGOING = 'outgoing'

    TYPE_CHOICES = [
        (TYPE_INCOMING, 'Incoming (Customer)'),
        (TYPE_OUTGOING, 'Outgoing (Supplier)'),
    ]

    METHOD_CASH        = 'cash'
    METHOD_BANK        = 'bank_transfer'
    METHOD_CHEQUE      = 'cheque'
    METHOD_ESEWA       = 'esewa'
    METHOD_KHALTI      = 'khalti'
    METHOD_CREDIT_NOTE = 'credit_note'

    METHOD_CHOICES = [
        (METHOD_CASH,        'Cash'),
        (METHOD_BANK,        'Bank Transfer'),
        (METHOD_CHEQUE,      'Cheque'),
        (METHOD_ESEWA,       'eSewa'),
        (METHOD_KHALTI,      'Khalti'),
        (METHOD_CREDIT_NOTE, 'Credit Note'),
    ]

    payment_number = models.CharField(max_length=32, blank=True, db_index=True)
    date           = models.DateField()
    type           = models.CharField(max_length=16, choices=TYPE_CHOICES)
    method         = models.CharField(max_length=20, choices=METHOD_CHOICES, default=METHOD_CASH)
    amount         = models.DecimalField(max_digits=14, decimal_places=2)
    bank_account   = models.ForeignKey(
        BankAccount, null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='payments',
    )
    invoice = models.ForeignKey(
        Invoice, null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='payments',
    )
    bill = models.ForeignKey(
        'Bill', null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='payments',
    )
    reference = models.CharField(max_length=64, blank=True)
    notes     = models.TextField(blank=True)

    class Meta:
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.payment_number or self.pk} – {self.type} {self.amount}"

    def save(self, *args, **kwargs):
        if not self.payment_number and self.tenant_id:
            last = (
                Payment.objects.filter(tenant_id=self.tenant_id)
                .order_by('-created_at')
                .values_list('payment_number', flat=True)
                .first()
            )
            try:
                seq = int(str(last).split('-')[-1]) + 1 if last else 1
            except (ValueError, IndexError):
                seq = 1
            self.payment_number = f"PAY-{seq:05d}"
        super().save(*args, **kwargs)


# ─────────────────────────────────────────────────────────────────────────────
# Credit Notes
# ─────────────────────────────────────────────────────────────────────────────

class CreditNote(TenantModel):
    """
    Raised against an issued invoice to partially / fully cancel it.
    Reversal journal entry auto-created on status → issued via signal.
    Lifecycle: draft → issued → applied | void
    """

    STATUS_DRAFT   = 'draft'
    STATUS_ISSUED  = 'issued'
    STATUS_APPLIED = 'applied'
    STATUS_VOID    = 'void'

    STATUS_CHOICES = [
        (STATUS_DRAFT,   'Draft'),
        (STATUS_ISSUED,  'Issued'),
        (STATUS_APPLIED, 'Applied'),
        (STATUS_VOID,    'Void'),
    ]

    credit_note_number = models.CharField(max_length=32, blank=True, db_index=True)
    invoice  = models.ForeignKey(
        Invoice, on_delete=models.PROTECT,
        related_name='credit_notes',
    )
    line_items = models.JSONField(default=list)
    subtotal   = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    vat_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total      = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    reason     = models.TextField(blank=True)
    status     = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    applied_to = models.ForeignKey(
        Invoice, null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='applied_credit_notes',
    )
    issued_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"CN {self.credit_note_number or self.pk}"

    def save(self, *args, **kwargs):
        if not self.credit_note_number and self.tenant_id:
            last = (
                CreditNote.objects.filter(tenant_id=self.tenant_id)
                .order_by('-created_at')
                .values_list('credit_note_number', flat=True)
                .first()
            )
            try:
                seq = int(str(last).split('-')[-1]) + 1 if last else 1
            except (ValueError, IndexError):                seq = 1
            self.credit_note_number = f"CN-{seq:05d}"
        super().save(*args, **kwargs)
