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
    description     = models.TextField(blank=True)
    is_system       = models.BooleanField(default=False)   # seeded accounts, not deletable
    is_active       = models.BooleanField(default=True)
    opening_balance = models.DecimalField(
        max_digits=14, decimal_places=2, default=0,
        help_text='Opening balance for migration from another system.',
    )

    class Meta:
        ordering = ['code']
        unique_together = ('tenant', 'code')

    def __str__(self):
        return f"{self.code} – {self.name}"

    @property
    def balance(self):
        """
        Net balance including opening_balance.

        opening_balance is treated as:
          - a debit  for asset / expense accounts
          - a credit for liability / equity / revenue accounts

        Without this, migrated tenants with non-zero opening balances would
        show incorrect Trial Balance, Balance Sheet, and P&L from day 1.
        """
        from django.db.models import Sum
        lines   = self.journal_lines.filter(entry__is_posted=True)
        debits  = lines.aggregate(t=Sum('debit'))['t']  or Decimal('0')
        credits = lines.aggregate(t=Sum('credit'))['t'] or Decimal('0')
        ob = self.opening_balance or Decimal('0')
        if self.type in (self.TYPE_ASSET, self.TYPE_EXPENSE):
            return ob + debits - credits
        return ob + credits - debits


# ─────────────────────────────────────────────────────────────────────────────
# Bank Accounts
# ─────────────────────────────────────────────────────────────────────────────

class BankAccount(TenantModel):
    """A tenant's real-world bank account, linked to an asset Account in the CoA."""

    name            = models.CharField(max_length=120)
    bank_name       = models.CharField(max_length=120, blank=True)
    account_number  = models.CharField(max_length=64, blank=True)
    branch          = models.CharField(max_length=120, blank=True, help_text='Bank branch name')
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

    REF_INVOICE      = 'invoice'
    REF_BILL         = 'bill'
    REF_PAYMENT      = 'payment'
    REF_CREDIT_NOTE  = 'credit_note'
    REF_DEBIT_NOTE   = 'debit_note'
    REF_PAYSLIP      = 'payslip'
    REF_MANUAL       = 'manual'
    REF_COGS         = 'cogs'
    REF_VAT_REM      = 'vat_remittance'
    REF_TDS_REM      = 'tds_remittance'

    REF_CHOICES = [
        (REF_INVOICE,     'Invoice'),
        (REF_BILL,        'Bill'),
        (REF_PAYMENT,     'Payment'),
        (REF_CREDIT_NOTE, 'Credit Note'),
        (REF_DEBIT_NOTE,  'Debit Note'),
        (REF_PAYSLIP,     'Payslip'),
        (REF_MANUAL,      'Manual'),
        (REF_COGS,        'COGS'),
        (REF_VAT_REM,     'VAT Remittance'),
        (REF_TDS_REM,     'TDS Remittance'),
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
            from core.models import next_seq
            self.entry_number = f"JE-{next_seq(self.tenant_id, 'journal_entry', JournalEntry, 'entry_number'):05d}"
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


class StaffSalaryProfile(TenantModel):
    """
    Stores the configured salary for a staff member in a tenant.
    Used by the auto-generate payslip task and the Generate Payslip action
    to pre-fill base_salary and tds_rate without requiring manual entry each month.

    tds_rate: Nepal default is 0.10 (10% on salaries above exemption threshold).
    tds_deduction is computed as base_salary * tds_rate and stored on the Payslip.
    """
    staff = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='salary_profiles',
    )
    base_salary     = models.DecimalField(max_digits=14, decimal_places=2, default=0,
                        help_text='Monthly base salary in tenant currency')
    tds_rate        = models.DecimalField(max_digits=6, decimal_places=4, default='0.1000',
                        help_text='TDS rate e.g. 0.10 = 10%. Applied to base_salary.')
    bonus_default   = models.DecimalField(max_digits=14, decimal_places=2, default=0,
                        help_text='Default monthly bonus (can be overridden per payslip)')
    effective_from  = models.DateField(help_text='Salary effective from this date')
    notes           = models.TextField(blank=True)

    class Meta:
        verbose_name = 'Staff Salary Profile'
        unique_together = ('tenant', 'staff')

    def __str__(self):
        return f"{self.staff} — {self.base_salary} (TDS {self.tds_rate})"


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
    allowances   = models.JSONField(
                     default=list,
                     help_text='List of {"label": str, "amount": str} allowance line items',
                   )
    tds_amount   = models.DecimalField(max_digits=14, decimal_places=2, default=0,
                     help_text='Tax Deducted at Source computed from salary profile tds_rate')
    deductions   = models.DecimalField(max_digits=14, decimal_places=2, default=0,
                     help_text='Other deductions (advances, damages, etc.)')
    net_pay      = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    status       = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    approved_by  = models.ForeignKey(
                     settings.AUTH_USER_MODEL,
                     null=True, blank=True,
                     on_delete=models.SET_NULL,
                     related_name='approved_payslips',
                     help_text='Manager/Admin who approved this payslip',
                   )
    approved_at  = models.DateTimeField(null=True, blank=True)
    issued_at    = models.DateTimeField(null=True, blank=True)
    paid_at      = models.DateTimeField(null=True, blank=True)
    # Payment info snapshotted when mark_paid is called
    payment_method  = models.CharField(max_length=32, blank=True,
                        help_text='cash | bank_transfer | cheque')
    bank_account    = models.ForeignKey(
                        'accounting.BankAccount',
                        null=True, blank=True,
                        on_delete=models.SET_NULL,
                        related_name='payslip_payments',
                        help_text='Bank account used when payment_method=bank_transfer',
                      )

    class Meta:
        ordering = ['-period_end']
        unique_together = ('tenant', 'staff', 'period_start', 'period_end')

    def __str__(self):
        return f"Payslip {self.staff} {self.period_start}–{self.period_end}"


class Invoice(TenantModel):
    """
    Issued to a customer for ticket work, project work, or ad-hoc items.
    VAT is never hardcoded — always read from tenant.vat_rate.

    Finance workflow (ticket invoices):
      draft → submitted → approved → issued/paid
                         └ rejected → back to staff
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

    # Finance approval workflow (used when invoice is generated from a ticket)
    FINANCE_DRAFT     = 'draft'
    FINANCE_SUBMITTED = 'submitted'   # Staff collected payment, submitted for review
    FINANCE_APPROVED  = 'approved'    # Finance approved → ticket closes, coins awarded
    FINANCE_REJECTED  = 'rejected'    # Finance rejected → staff must correct

    FINANCE_STATUS_CHOICES = [
        (FINANCE_DRAFT,     'Draft'),
        (FINANCE_SUBMITTED, 'Submitted for Finance Review'),
        (FINANCE_APPROVED,  'Finance Approved'),
        (FINANCE_REJECTED,  'Finance Rejected'),
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

    # ── Finance workflow ─────────────────────────────────────────────────────
    finance_status = models.CharField(
        max_length=16, choices=FINANCE_STATUS_CHOICES, default=FINANCE_DRAFT,
        help_text='Approval state for ticket-linked invoices.',
    )
    payment_received    = models.BooleanField(default=False)
    payment_method      = models.CharField(max_length=20, blank=True,
        help_text='Method used when staff collected payment (cash/bank_transfer/esewa/…)')
    payment_received_at = models.DateTimeField(null=True, blank=True)
    payment_received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='payments_collected_invoices',
    )
    finance_reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='finance_reviewed_invoices',
    )
    finance_reviewed_at = models.DateTimeField(null=True, blank=True)
    finance_notes       = models.TextField(blank=True)

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
            from core.models import next_seq
            self.invoice_number = f"INV-{next_seq(self.tenant_id, 'invoice', Invoice, 'invoice_number'):05d}"
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
            from core.models import next_seq
            self.bill_number = f"BILL-{next_seq(self.tenant_id, 'bill', Bill, 'bill_number'):05d}"
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
            from core.models import next_seq
            self.payment_number = f"PAY-{next_seq(self.tenant_id, 'payment', Payment, 'payment_number'):05d}"
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
            from core.models import next_seq
            self.credit_note_number = f"CN-{next_seq(self.tenant_id, 'credit_note', CreditNote, 'credit_note_number'):05d}"
        super().save(*args, **kwargs)


# ─────────────────────────────────────────────────────────────────────────────
# Quotations / Proforma Invoices
# ─────────────────────────────────────────────────────────────────────────────

class Quotation(TenantModel):
    """
    Pre-sales estimate / proforma invoice sent to a customer before work begins.
    Lifecycle: draft → sent → accepted | declined | expired
    An accepted Quotation can be converted to a full Invoice.
    """

    STATUS_DRAFT    = 'draft'
    STATUS_SENT     = 'sent'
    STATUS_ACCEPTED = 'accepted'
    STATUS_DECLINED = 'declined'
    STATUS_EXPIRED  = 'expired'

    STATUS_CHOICES = [
        (STATUS_DRAFT,    'Draft'),
        (STATUS_SENT,     'Sent'),
        (STATUS_ACCEPTED, 'Accepted'),
        (STATUS_DECLINED, 'Declined'),
        (STATUS_EXPIRED,  'Expired'),
    ]

    quotation_number = models.CharField(max_length=32, blank=True, db_index=True)
    customer = models.ForeignKey(
        'customers.Customer', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='quotations',
    )
    ticket = models.ForeignKey(
        'tickets.Ticket', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='quotations',
    )
    project = models.ForeignKey(
        'projects.Project', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='quotations',
    )
    line_items  = models.JSONField(default=list)
    subtotal    = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    discount    = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    vat_rate    = models.DecimalField(max_digits=5,  decimal_places=4, default=0)
    vat_amount  = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total       = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    status      = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    valid_until = models.DateField(null=True, blank=True)
    notes       = models.TextField(blank=True)
    terms       = models.TextField(blank=True)
    sent_at     = models.DateTimeField(null=True, blank=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    # Populated when accepted quotation is converted to an invoice
    converted_invoice = models.OneToOneField(
        Invoice, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='source_quotation',
    )

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"QUO {self.quotation_number or self.pk}"

    def save(self, *args, **kwargs):
        if not self.quotation_number and self.tenant_id:
            from core.models import next_seq
            self.quotation_number = f"QUO-{next_seq(self.tenant_id, 'quotation', Quotation, 'quotation_number'):05d}"
        super().save(*args, **kwargs)


# ─────────────────────────────────────────────────────────────────────────────
# Debit Notes  (purchase / supplier returns)
# ─────────────────────────────────────────────────────────────────────────────

class DebitNote(TenantModel):
    """
    Raised against an approved Bill when goods/services are returned to supplier.
    Mirrors CreditNote but sits on the purchase (AP) side.
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

    debit_note_number = models.CharField(max_length=32, blank=True, db_index=True)
    bill = models.ForeignKey(
        Bill, on_delete=models.PROTECT, related_name='debit_notes',
    )
    line_items = models.JSONField(default=list)
    subtotal   = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    vat_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total      = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    reason     = models.TextField(blank=True)
    status     = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    issued_at  = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"DN {self.debit_note_number or self.pk}"

    def save(self, *args, **kwargs):
        if not self.debit_note_number and self.tenant_id:
            from core.models import next_seq
            self.debit_note_number = f"DN-{next_seq(self.tenant_id, 'debit_note', DebitNote, 'debit_note_number'):05d}"
        super().save(*args, **kwargs)


# ─────────────────────────────────────────────────────────────────────────────
# TDS — Tax Deducted at Source  (Nepal)
# ─────────────────────────────────────────────────────────────────────────────

class TDSEntry(TenantModel):
    """
    Nepal mandatory: TDS is deducted from supplier payments above NPR 3,000.
    The tenant deducts the tax and deposits it to IRD on the supplier's behalf.
    Common rates: 1.5% goods, 10% professional/service, 15% rent/commission.
    """

    STATUS_PENDING   = 'pending'
    STATUS_DEPOSITED = 'deposited'

    STATUS_CHOICES = [
        (STATUS_PENDING,   'Pending Deposit'),
        (STATUS_DEPOSITED, 'Deposited to IRD'),
    ]

    bill              = models.ForeignKey(
        Bill, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='tds_entries',
    )
    supplier_name     = models.CharField(max_length=200, blank=True)
    supplier_pan      = models.CharField(max_length=20, blank=True, help_text="Supplier PAN number for IRD")
    taxable_amount    = models.DecimalField(max_digits=14, decimal_places=2)
    tds_rate          = models.DecimalField(max_digits=6,  decimal_places=4, help_text="e.g. 0.10 for 10%")
    tds_amount        = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    net_payable       = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    status            = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING)
    period_month      = models.PositiveIntegerField(help_text="Nepali month (1–12)")
    period_year       = models.PositiveIntegerField(help_text="Nepali fiscal year, e.g. 2081")
    deposited_at      = models.DateTimeField(null=True, blank=True)
    deposit_reference = models.CharField(max_length=64, blank=True, help_text="IRD deposit receipt number")

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'TDS Entry'
        verbose_name_plural = 'TDS Entries'

    def __str__(self):
        return f"TDS {self.tds_amount} ({self.supplier_name})"

    def save(self, *args, **kwargs):
        self.tds_amount  = (self.taxable_amount * self.tds_rate).quantize(Decimal('0.01'))
        self.net_payable = self.taxable_amount - self.tds_amount
        super().save(*args, **kwargs)


# ─────────────────────────────────────────────────────────────────────────────
# Bank Reconciliation
# ─────────────────────────────────────────────────────────────────────────────

class BankReconciliation(TenantModel):
    """
    Links system Payment records to a real bank statement for a period.
    Bookkeeper imports statement lines and matches them one-to-one.
    Status: draft → reconciled (locked when balanced).
    """

    STATUS_DRAFT      = 'draft'
    STATUS_RECONCILED = 'reconciled'

    STATUS_CHOICES = [
        (STATUS_DRAFT,      'Draft'),
        (STATUS_RECONCILED, 'Reconciled'),
    ]

    bank_account    = models.ForeignKey(BankAccount, on_delete=models.PROTECT, related_name='reconciliations')
    statement_date  = models.DateField()
    opening_balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    closing_balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    status          = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    notes           = models.TextField(blank=True)
    reconciled_at   = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-statement_date']
        unique_together = ('tenant', 'bank_account', 'statement_date')

    def __str__(self):
        return f"Rec {self.bank_account} {self.statement_date}"

    @property
    def difference(self):
        """Unmatched amount. Zero = fully reconciled."""
        from django.db.models import Sum
        matched = self.lines.filter(is_matched=True).aggregate(t=Sum('amount'))['t'] or Decimal('0')
        return (self.closing_balance - self.opening_balance) - matched


class BankReconciliationLine(models.Model):
    """One row from an imported bank statement, optionally matched to a Payment."""

    reconciliation = models.ForeignKey(BankReconciliation, on_delete=models.CASCADE, related_name='lines')
    date           = models.DateField()
    description    = models.CharField(max_length=255)
    amount         = models.DecimalField(max_digits=14, decimal_places=2)   # positive=inflow, negative=outflow
    is_matched     = models.BooleanField(default=False)
    payment        = models.ForeignKey(
        Payment, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='reconciliation_lines',
    )

    class Meta:
        ordering = ['date']

    def __str__(self):
        return f"{self.date} {self.description} {self.amount}"


# ─────────────────────────────────────────────────────────────────────────────
# Recurring Journal Templates
# ─────────────────────────────────────────────────────────────────────────────

class Expense(TenantModel):
    """
    Internal operating expense (e.g. travel, office supplies, utilities).
    Distinct from Bill (which is a supplier invoice for goods/services purchased).
    Supports receipt_url upload, category tagging, approval workflow, and
    automatic journal posting to the linked expense Account.
    """

    STATUS_DRAFT    = 'draft'
    STATUS_APPROVED = 'approved'
    STATUS_POSTED   = 'posted'
    STATUS_REJECTED = 'rejected'

    STATUS_CHOICES = [
        (STATUS_DRAFT,    'Draft'),
        (STATUS_APPROVED, 'Approved'),
        (STATUS_POSTED,   'Posted to Ledger'),
        (STATUS_REJECTED, 'Rejected'),
    ]

    CATEGORY_TRAVEL       = 'travel'
    CATEGORY_MEALS        = 'meals'
    CATEGORY_OFFICE       = 'office_supplies'
    CATEGORY_UTILITIES    = 'utilities'
    CATEGORY_MAINTENANCE  = 'maintenance'
    CATEGORY_MARKETING    = 'marketing'
    CATEGORY_TRAINING     = 'training'
    CATEGORY_OTHER        = 'other'

    CATEGORY_CHOICES = [
        (CATEGORY_TRAVEL,      'Travel'),
        (CATEGORY_MEALS,       'Meals & Entertainment'),
        (CATEGORY_OFFICE,      'Office Supplies'),
        (CATEGORY_UTILITIES,   'Utilities'),
        (CATEGORY_MAINTENANCE, 'Maintenance & Repairs'),
        (CATEGORY_MARKETING,   'Marketing & Advertising'),
        (CATEGORY_TRAINING,    'Training & Development'),
        (CATEGORY_OTHER,       'Other'),
    ]

    category        = models.CharField(max_length=32, choices=CATEGORY_CHOICES, default=CATEGORY_OTHER, db_index=True)
    description     = models.CharField(max_length=500)
    amount          = models.DecimalField(max_digits=14, decimal_places=2)
    date            = models.DateField()
    account         = models.ForeignKey(
                        Account, null=True, blank=True,
                        on_delete=models.SET_NULL,
                        related_name='expenses',
                        help_text='Expense account in CoA to post this to',
                      )
    receipt_url     = models.CharField(max_length=500, blank=True, help_text='S3/MinIO URL of uploaded receipt')
    notes           = models.TextField(blank=True)
    status          = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_DRAFT, db_index=True)
    submitted_by    = models.ForeignKey(
                        settings.AUTH_USER_MODEL,
                        null=True, blank=True,
                        on_delete=models.SET_NULL,
                        related_name='submitted_expenses',
                      )
    approved_by     = models.ForeignKey(
                        settings.AUTH_USER_MODEL,
                        null=True, blank=True,
                        on_delete=models.SET_NULL,
                        related_name='approved_expenses',
                      )
    approved_at     = models.DateTimeField(null=True, blank=True)
    rejected_by     = models.ForeignKey(
                        settings.AUTH_USER_MODEL,
                        null=True, blank=True,
                        on_delete=models.SET_NULL,
                        related_name='rejected_expenses',
                      )
    rejected_at     = models.DateTimeField(null=True, blank=True)
    rejection_note  = models.TextField(blank=True)
    journal_entry   = models.OneToOneField(
                        JournalEntry, null=True, blank=True,
                        on_delete=models.SET_NULL,
                        related_name='expense',
                        help_text='Set when expense is posted to ledger',
                      )
    # Recurring support
    is_recurring    = models.BooleanField(default=False)
    recur_interval  = models.CharField(
                        max_length=16, blank=True,
                        choices=[('monthly', 'Monthly'), ('weekly', 'Weekly'), ('yearly', 'Yearly')],
                        help_text='Repeat interval for recurring expenses',
                      )
    next_recur_date = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ['-date', '-created_at']
        indexes = [
            models.Index(fields=['tenant', 'status'],   name='acc_expense_tenant_status_idx'),
            models.Index(fields=['tenant', 'date'],     name='acc_expense_tenant_date_idx'),
            models.Index(fields=['tenant', 'category'], name='acc_expense_tenant_cat_idx'),
        ]

    def __str__(self):
        return f"{self.get_category_display()} – {self.amount} ({self.date})"


class RecurringJournal(TenantModel):
    """
    Template for auto-repeating journal entries (rent, subscriptions, etc.).
    A Celery task fires daily, checks next_date, creates a JournalEntry from
    the template_lines, then advances next_date by the chosen frequency.
    """

    FREQ_DAILY   = 'daily'
    FREQ_WEEKLY  = 'weekly'
    FREQ_MONTHLY = 'monthly'
    FREQ_YEARLY  = 'yearly'

    FREQ_CHOICES = [
        (FREQ_DAILY,   'Daily'),
        (FREQ_WEEKLY,  'Weekly'),
        (FREQ_MONTHLY, 'Monthly'),
        (FREQ_YEARLY,  'Yearly'),
    ]

    name        = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    frequency   = models.CharField(max_length=16, choices=FREQ_CHOICES, default=FREQ_MONTHLY)
    start_date  = models.DateField()
    end_date    = models.DateField(null=True, blank=True)
    next_date   = models.DateField()
    is_active   = models.BooleanField(default=True)
    # Each dict: {"account_code": str, "debit": "0.00", "credit": "0.00", "description": str}
    template_lines = models.JSONField(default=list)
    last_run_at    = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['next_date']

    def __str__(self):
        return f"{self.name} ({self.frequency})"

