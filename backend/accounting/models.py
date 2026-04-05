import uuid
from decimal import Decimal
from django.db import models
from core.models import TenantModel
from django.conf import settings

PARTY_MODEL = 'parties.Party'


# ─────────────────────────────────────────────────────────────────────────────
# Account Groups  (Tally-style primary groups)
# ─────────────────────────────────────────────────────────────────────────────

class AccountGroup(TenantModel):
    """
    Tally-style primary group for Chart of Accounts.

    Every Account belongs to one AccountGroup.  Groups drive:
      - Automated journal routing (_get_account_by_group)
      - Financial statement sectioning (BS: Fixed Assets vs Current Assets,
        P&L: Gross Profit line split)
      - Normal balance direction for UI hints

    System groups (is_system=True) are seeded per tenant on creation and
    cannot be deleted.  Tenants may add custom sub-groups.
    """

    # Account types — mirrors Account.type choices
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

    # Where this group appears in financial statements
    SECTION_BS_FIXED        = 'bs_fixed_assets'
    SECTION_BS_INVESTMENTS  = 'bs_investments'
    SECTION_BS_CURRENT      = 'bs_current_assets'
    SECTION_BS_CAPITAL      = 'bs_capital'
    SECTION_BS_LOANS        = 'bs_loans'
    SECTION_BS_CL           = 'bs_current_liabilities'
    SECTION_PNL_GROSS       = 'pnl_gross'       # affects gross profit calculation
    SECTION_PNL_NET         = 'pnl_net'         # below-the-line (indirect)

    SECTION_CHOICES = [
        (SECTION_BS_FIXED,       'BS: Fixed Assets'),
        (SECTION_BS_INVESTMENTS, 'BS: Investments'),
        (SECTION_BS_CURRENT,     'BS: Current Assets'),
        (SECTION_BS_CAPITAL,     'BS: Capital & Equity'),
        (SECTION_BS_LOANS,       'BS: Loans & Borrowings'),
        (SECTION_BS_CL,          'BS: Current Liabilities'),
        (SECTION_PNL_GROSS,      'P&L: Gross Profit Section'),
        (SECTION_PNL_NET,        'P&L: Net Profit Section'),
    ]

    NORMAL_DEBIT  = 'debit'
    NORMAL_CREDIT = 'credit'

    NORMAL_BALANCE_CHOICES = [
        (NORMAL_DEBIT,  'Debit'),
        (NORMAL_CREDIT, 'Credit'),
    ]

    slug           = models.CharField(max_length=60, db_index=True)
    name           = models.CharField(max_length=120)
    description    = models.TextField(blank=True)
    type           = models.CharField(max_length=16, choices=TYPE_CHOICES)
    report_section = models.CharField(max_length=32, choices=SECTION_CHOICES, blank=True)
    normal_balance = models.CharField(max_length=8, choices=NORMAL_BALANCE_CHOICES, default=NORMAL_DEBIT)
    affects_gross_profit = models.BooleanField(
        default=False,
        help_text='True for Sales, COGS, and Direct Expense groups — used to compute Gross Profit.',
    )
    parent    = models.ForeignKey(
        'self', null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='sub_groups',
    )
    order      = models.PositiveSmallIntegerField(default=0, help_text='Display order within report section.')
    is_system  = models.BooleanField(default=False)
    is_active  = models.BooleanField(default=True)

    class Meta(TenantModel.Meta):
        ordering = ['order', 'name']
        unique_together = ('tenant', 'slug')

    def __str__(self):
        return f"{self.name} ({self.type})"


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

    Every account should belong to an AccountGroup which determines its role in
    automated journal routing and financial statement grouping.
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
    group       = models.ForeignKey(
        AccountGroup, null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='accounts',
        help_text='Account group (Tally-style primary group). Required for new accounts.',
    )
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

        B10 — Uses pre-computed queryset annotations (_annotated_debit /
        _annotated_credit) when available (set by AccountViewSet.get_queryset)
        so that listing N accounts fires exactly 1 SQL query instead of 2N.
        Falls back to a per-row aggregate for single-object access.
        """
        ob = self.opening_balance or Decimal('0')
        if hasattr(self, '_annotated_debit') and hasattr(self, '_annotated_credit'):
            debits  = getattr(self, '_annotated_debit')  or Decimal('0')
            credits = getattr(self, '_annotated_credit') or Decimal('0')
        else:
            from django.db.models import Sum
            totals  = self.journal_lines.filter(entry__is_posted=True).aggregate(
                d=Sum('debit'), c=Sum('credit')
            )
            debits  = totals['d'] or Decimal('0')
            credits = totals['c'] or Decimal('0')
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
        """opening_balance + incoming payments - outgoing payments.

        Uses a single conditional aggregate to avoid two DB roundtrips per
        BankAccount on list views.
        """
        from django.db.models import Sum, Case, When, Value, DecimalField
        from django.db.models.functions import Coalesce
        result = self.payments.aggregate(
            incoming=Coalesce(
                Sum('amount', filter=models.Q(type='incoming')),
                Value(Decimal('0')),
            ),
            outgoing=Coalesce(
                Sum('amount', filter=models.Q(type='outgoing')),
                Value(Decimal('0')),
            ),
        )
        return self.opening_balance + result['incoming'] - result['outgoing']


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
    REF_EXPENSE      = 'expense'       # standalone expense (non-bill) journals
    REF_MANUAL       = 'manual'
    REF_COGS         = 'cogs'
    REF_VAT_REM      = 'vat_remittance'
    REF_TDS_REM      = 'tds_remittance'
    REF_FY_CLOSE     = 'fiscal_year_close'   # B8 fix: fiscal year closing entry
    REF_DEPRECIATION = 'depreciation'        # B21: asset depreciation journal
    REF_FX_GAIN_LOSS = 'fx_gain_loss'        # B20: FX realized gain/loss
    REF_RECURRING    = 'recurring'           # N1: idempotent recurring journal

    REF_CHOICES = [
        (REF_INVOICE,      'Invoice'),
        (REF_BILL,         'Bill'),
        (REF_PAYMENT,      'Payment'),
        (REF_CREDIT_NOTE,  'Credit Note'),
        (REF_DEBIT_NOTE,   'Debit Note'),
        (REF_PAYSLIP,      'Payslip'),
        (REF_EXPENSE,      'Expense'),
        (REF_MANUAL,       'Manual'),
        (REF_COGS,         'COGS'),
        (REF_VAT_REM,      'VAT Remittance'),
        (REF_TDS_REM,      'TDS Remittance'),
        (REF_FY_CLOSE,     'Fiscal Year Close'),  # B8 fix
        (REF_DEPRECIATION, 'Depreciation'),
        (REF_FX_GAIN_LOSS, 'FX Gain/Loss'),
        (REF_RECURRING,    'Recurring Journal'),  # N1 fix
    ]

    # B3 — Purpose codes categorise why a journal was created.
    # Included in the idempotency constraint so an invoice can have both a
    # 'revenue' entry and a 'cogs' entry without violating the unique constraint.
    PURPOSE_REVENUE      = 'revenue'
    PURPOSE_COGS         = 'cogs'
    PURPOSE_PAYSLIP      = 'payslip'
    PURPOSE_VAT          = 'vat'
    PURPOSE_TDS          = 'tds'
    PURPOSE_PAYMENT      = 'payment'
    PURPOSE_REVERSAL     = 'reversal'
    PURPOSE_RECURRING    = 'recurring'
    PURPOSE_DEPRECIATION = 'depreciation'
    PURPOSE_FX           = 'fx_gain_loss'
    PURPOSE_ADJUSTMENT   = 'adjustment'

    PURPOSE_CHOICES = [
        (PURPOSE_REVENUE,      'Revenue'),
        (PURPOSE_COGS,         'COGS'),
        (PURPOSE_PAYSLIP,      'Payslip'),
        (PURPOSE_VAT,          'VAT Remittance'),
        (PURPOSE_TDS,          'TDS Remittance'),
        (PURPOSE_PAYMENT,      'Payment'),
        (PURPOSE_REVERSAL,     'Reversal'),
        (PURPOSE_RECURRING,    'Recurring'),
        (PURPOSE_DEPRECIATION, 'Depreciation'),
        (PURPOSE_FX,           'FX Gain/Loss'),
        (PURPOSE_ADJUSTMENT,   'Adjustment'),
    ]

    entry_number   = models.CharField(max_length=32, blank=True, db_index=True)
    date           = models.DateField()
    description    = models.TextField(blank=True)
    reference_type = models.CharField(max_length=20, choices=REF_CHOICES, default=REF_MANUAL)
    reference_id   = models.PositiveIntegerField(null=True, blank=True)
    # B3 — purpose distinguishes multiple journals for the same document
    # (e.g. 'revenue' + 'cogs' on the same invoice reference_id).
    purpose        = models.CharField(
        max_length=20, choices=PURPOSE_CHOICES, default='', blank=True,
        db_index=True,
        help_text='Type of journal (revenue, cogs, payslip, …). Part of idempotency key.',
    )
    is_posted      = models.BooleanField(default=False)  # posted = locked
    total_debit    = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_credit   = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    # ── Reversing journal support ─────────────────────────────────────────────
    reversal_date = models.DateField(
        null=True, blank=True,
        help_text='If set, a reversing entry is auto-created on this date.',
    )
    is_reversal   = models.BooleanField(
        default=False,
        help_text='True when this entry was auto-generated as a reversal.',
    )
    reversed_by   = models.OneToOneField(
        'self', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='reversal_of',
        help_text='The reversing entry once created (set by the reversal task).',
    )
    # B5 — Reversal audit trail: who voided it, why, and when.
    reversal_reason    = models.TextField(
        blank=True, default='',
        help_text='Reason provided when this entry was reversed/voided.',
    )
    reversed_by_user   = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='reversals_created',
        help_text='User who triggered the reversal.',
    )
    reversal_timestamp = models.DateTimeField(
        null=True, blank=True,
        help_text='UTC timestamp when the reversal was executed.',
    )

    class Meta:
        ordering = ['-date', '-created_at']
        verbose_name_plural = 'journal entries'
        constraints = [
            # B3 fix: Prevent duplicate posted journals for the same document+purpose.
            # `purpose` is included so a single invoice can have both a 'revenue'
            # entry and a 'cogs' entry without colliding.
            # Excludes 'manual' and 'fiscal_year_close' (can have multiple entries),
            # remittance types, and entries with reference_id=None (standalone entries).
            models.UniqueConstraint(
                fields=['tenant', 'reference_type', 'reference_id', 'purpose'],
                condition=(
                    models.Q(is_posted=True)
                    & ~models.Q(reference_type='manual')
                    & ~models.Q(reference_type='fiscal_year_close')
                    & ~models.Q(reference_type='vat_remittance')
                    & ~models.Q(reference_type='tds_remittance')
                    & ~models.Q(reference_type='recurring')  # N1: recurring uses date-scoped constraint below
                    & models.Q(reference_id__isnull=False)
                ),
                name='acc_journal_one_per_doc_purpose',
            ),
            # N1 fix: one recurring journal entry per template per date, preventing
            # duplicate entries if the Celery task retries or runs twice in one day.
            models.UniqueConstraint(
                fields=['tenant', 'reference_type', 'reference_id', 'date'],
                condition=(
                    models.Q(is_posted=True)
                    & models.Q(reference_type='recurring')
                    & models.Q(reference_id__isnull=False)
                ),
                name='acc_journal_one_recurring_per_date',
            ),
        ]

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
        lines  = self.lines.all()
        totals = lines.aggregate(d=Sum('debit'), c=Sum('credit'))
        debits  = totals['d'] or Decimal('0')
        credits = totals['c'] or Decimal('0')
        # Quantize before comparison to absorb single-cent rounding from
        # multi-line entries that accumulate sub-cent decimal differences.
        if (debits - credits).quantize(Decimal('0.01')) != Decimal('0'):
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
    cost_centre = models.ForeignKey(
        'CostCentre', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='journal_lines',
        help_text='Optional cost centre for management P&L reporting.',
    )

    class Meta:
        ordering = ['id']

    def __str__(self):
        side = f"Dr {self.debit}" if self.debit else f"Cr {self.credit}"
        return f"{self.account} | {side}"

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.debit and self.credit and self.debit > Decimal('0') and self.credit > Decimal('0'):
            raise ValidationError(
                'A journal line cannot carry both a debit and a credit amount. '
                'Set one side to zero — each line must be either Dr or Cr.'
            )

    def save(self, *args, **kwargs):
        from django.core.exceptions import ValidationError as DjangoValidationError
        self.clean()
        super().save(*args, **kwargs)


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
                     help_text='Aggregate of all non-TDS deductions (sum of deduction_breakdown).')
    deduction_breakdown = models.JSONField(
                     default=list,
                     help_text=(
                         'Per-line deduction items: '
                         '[{"label": "PF", "amount": "500.00", "account_code": "2310"}, ...]. '
                         'account_code is optional; omit to default to Loans & Advances (1400). '
                         'sum(amounts) should equal the deductions field.'
                     ),
                   )
    net_pay      = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    # HRM integration: unpaid leave deduction computed from hrm.LeaveRequest
    unpaid_leave_days = models.DecimalField(
                          max_digits=5, decimal_places=1, default=0,
                          help_text='Number of unpaid leave days in this pay period.',
                        )
    leave_deduction   = models.DecimalField(
                          max_digits=14, decimal_places=2, default=0,
                          help_text='Amount deducted for unpaid leave (unpaid_days × daily_rate).',
                        )
    attendance_deduction = models.DecimalField(
                             max_digits=14, decimal_places=2, default=0,
                             help_text='Amount deducted for absent/late days per AttendancePolicy.',
                           )
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

    # Voucher date — the actual date of the invoice (not created_at which is the DB save timestamp).
    # Used as the GL posting date.  Defaults to today when created; user can back-date if needed.
    date = models.DateField(
        null=True, blank=True,
        help_text='Invoice / voucher date used for GL posting.  Defaults to creation date.',
    )

    # IRD Nepal compliance — buyer PAN for B2B tax invoices
    buyer_pan = models.CharField(
        max_length=9, blank=True,
        help_text='Buyer PAN number (9 digits) for B2B tax invoices — required by IRD for CBMS reporting.',
    )

    customer = models.ForeignKey(
        'customers.Customer',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='invoices',
    )
    party = models.ForeignKey(
        PARTY_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='invoices',
        help_text='Canonical counterparty for this invoice. Temporary optional during migration.',
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
    # B19 — payment_received boolean removed. Use `amount_due <= 0` (or `status ==
    # STATUS_PAID`) to determine whether an invoice has been fully settled.
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
        # Use pre-computed SQL annotation from InvoiceRepository when available
        # (eliminates N+1 on list views). Falls back to live aggregate for
        # individual instances fetched outside the repository.
        ann = getattr(self, 'amount_paid_sum', None)
        if ann is not None:
            return ann
        from django.db.models import Sum
        return self.payments.aggregate(t=Sum('amount'))['t'] or Decimal('0')

    @property
    def amount_due(self):
        return max(self.total - self.amount_paid, Decimal('0'))

    class Meta:
        ordering = ['-created_at']
        constraints = [
            # Prevent duplicate invoice numbers within a tenant under concurrent load.
            # The condition excludes blank values so draft records without a number yet
            # do not collide with each other.
            models.UniqueConstraint(
                fields=['tenant', 'invoice_number'],
                condition=models.Q(invoice_number__gt=''),
                name='acc_invoice_tenant_number_uniq',
            ),
        ]

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

    # Voucher date — the date on the supplier's physical invoice (not created_at).
    # Used as the GL posting date when the bill is approved.
    date = models.DateField(
        null=True, blank=True,
        help_text="Bill date from the supplier's invoice. Used as GL posting date on approve.",
    )

    supplier      = models.ForeignKey(
        'inventory.Supplier',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='bills',
    )
    party = models.ForeignKey(
        PARTY_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='bills',
        help_text='Canonical counterparty for this bill. Temporary optional during migration.',
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

    # Nepal TDS: rate applied to supplier payment when TDS is required.
    # Common rates: 0.015 (1.5% goods), 0.10 (10% professional), 0.15 (15% rent).
    # When set on approval, handle_bill_tds signal auto-creates a TDSEntry.
    tds_rate = models.DecimalField(
        max_digits=6, decimal_places=4,
        null=True, blank=True,
        help_text='TDS rate applied to this bill (e.g. 0.10 = 10%). '
                  'Leave blank if TDS does not apply.',
    )

    # Link back to the Purchase Order that generated this bill (set when
    # auto-created via inventory.po.received event).  Null for manually created bills.
    purchase_order = models.ForeignKey(
        'inventory.PurchaseOrder',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='bills',
    )

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'bill_number'],
                condition=models.Q(bill_number__gt=''),
                name='acc_bill_tenant_number_uniq',
            ),
        ]

    def __str__(self):
        return f"Bill {self.bill_number or self.pk}"

    def save(self, *args, **kwargs):
        if not self.bill_number and self.tenant_id:
            from core.models import next_seq
            self.bill_number = f"BILL-{next_seq(self.tenant_id, 'bill', Bill, 'bill_number'):05d}"
        super().save(*args, **kwargs)

    @property
    def amount_paid(self):
        # Use pre-computed SQL annotation from repository when available
        # (eliminates N+1 on list views). Falls back to live aggregate for
        # individual instances fetched outside the repository.
        ann = getattr(self, 'amount_paid_sum', None)
        if ann is not None:
            return ann
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
    party = models.ForeignKey(
        PARTY_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='payments',
        help_text='Canonical counterparty for this payment when applicable.',
    )
    reference = models.CharField(max_length=64, blank=True)
    notes     = models.TextField(blank=True)

    # Direct ledger account for standalone receipts/payments (no invoice/bill).
    # When set, the journal posts Dr/Cr against this account instead of AR/AP/Expense.
    # Example receipt: Dr Cash → Cr [account] (e.g. "Other Income 4300")
    # Example payment: Dr [account] (e.g. "Rent Expense 5400") → Cr Cash
    account = models.ForeignKey(
        Account,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='direct_payments',
        help_text='Ledger account for direct Dr/Cr when not linked to an invoice or bill.',
    )

    # Cheque-specific fields (populated only when method=cheque)
    CHEQUE_STATUS_ISSUED    = 'issued'
    CHEQUE_STATUS_PRESENTED = 'presented'
    CHEQUE_STATUS_CLEARED   = 'cleared'
    CHEQUE_STATUS_BOUNCED   = 'bounced'

    CHEQUE_STATUS_CHOICES = [
        (CHEQUE_STATUS_ISSUED,    'Issued'),
        (CHEQUE_STATUS_PRESENTED, 'Presented to Bank'),
        (CHEQUE_STATUS_CLEARED,   'Cleared'),
        (CHEQUE_STATUS_BOUNCED,   'Bounced'),
    ]

    party_name    = models.CharField(
        max_length=200, blank=True,
        help_text='Payee name (outgoing) or payer/drawer name (incoming). Used for cheque tracking.',
    )
    cheque_status = models.CharField(
        max_length=16, blank=True,
        choices=CHEQUE_STATUS_CHOICES,
        help_text='Cheque lifecycle status. Only applicable when method=cheque.',
    )

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
    party = models.ForeignKey(
        PARTY_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='quotations',
        help_text='Canonical counterparty for this quotation. Temporary optional during migration.',
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
        # B12 fix: Only compute derived fields on CREATE. After finalization
        # (status=deposited) any re-save must not mutate the historic tax record.
        if not self.pk:
            self.tds_amount  = (self.taxable_amount * self.tds_rate).quantize(Decimal('0.01'))
            self.net_payable = self.taxable_amount - self.tds_amount
        elif self.status == self.STATUS_DEPOSITED:
            # B12 — Hard-block any mutation of financial fields on a deposited entry.
            # Once deposited with IRD the record is legally fixed — silently reverting
            # is not sufficient because callers would believe the save succeeded.
            try:
                db = TDSEntry.objects.get(pk=self.pk)
                mutated = [
                    fld for fld in ('taxable_amount', 'tds_rate', 'tds_amount', 'net_payable')
                    if getattr(self, fld) != getattr(db, fld)
                ]
            except TDSEntry.DoesNotExist:
                mutated = []
            if mutated:
                raise ValueError(
                    f"TDSEntry {self.pk} is already deposited with IRD and cannot be "
                    f"modified. Attempted to change: {', '.join(mutated)}. "
                    "Create a correction entry instead."
                )
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
    CATEGORY_CUSTOM       = 'custom'

    CATEGORY_CHOICES = [
        (CATEGORY_TRAVEL,      'Travel'),
        (CATEGORY_MEALS,       'Meals & Entertainment'),
        (CATEGORY_OFFICE,      'Office Supplies'),
        (CATEGORY_UTILITIES,   'Utilities'),
        (CATEGORY_MAINTENANCE, 'Maintenance & Repairs'),
        (CATEGORY_MARKETING,   'Marketing & Advertising'),
        (CATEGORY_TRAINING,    'Training & Development'),
        (CATEGORY_OTHER,       'Other'),
        (CATEGORY_CUSTOM,      'Custom'),
    ]

    category        = models.CharField(max_length=32, choices=CATEGORY_CHOICES, default=CATEGORY_OTHER, db_index=True)
    custom_category = models.CharField(max_length=100, blank=True, help_text='Free-text label used when category=custom')
    service         = models.ForeignKey(
                        'inventory.Product',
                        null=True, blank=True,
                        on_delete=models.SET_NULL,
                        related_name='expenses',
                        limit_choices_to={'is_service': True, 'is_deleted': False},
                        help_text='Optional link to a service from the service catalog',
                      )
    description     = models.CharField(max_length=500)
    amount          = models.DecimalField(max_digits=14, decimal_places=2)
    date            = models.DateField()
    account         = models.ForeignKey(
                        Account, null=True, blank=True,
                        on_delete=models.SET_NULL,
                        related_name='expenses',
                        help_text='Expense account in CoA to post this to (Dr side)',
                      )
    payment_account = models.ForeignKey(
                        Account, null=True, blank=True,
                        on_delete=models.SET_NULL,
                        related_name='expenses_paid_via',
                        help_text=(
                            'Credit account used when posting to ledger. '
                            'Cash (1010) = paid from petty cash. '
                            'Bank = paid by bank transfer. '
                            'Staff Payable / liability = employee paid personally, company owes reimbursement.'
                        ),
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


# ─────────────────────────────────────────────────────────────────────────────
# Cost Centres  (Tally-style management reporting)
# ─────────────────────────────────────────────────────────────────────────────

class CostCentre(TenantModel):
    """
    Tally-style Cost Centre for department / project P&L drill-down.
    Assign a CostCentre to JournalLine rows to enable cost-centre-level reporting.
    """
    name        = models.CharField(max_length=120)
    code        = models.CharField(max_length=20, blank=True)
    description = models.TextField(blank=True)
    parent      = models.ForeignKey(
        'self', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='children',
    )
    is_active   = models.BooleanField(default=True)

    class Meta(TenantModel.Meta):
        ordering = ['name']
        # Conditional unique: only enforce uniqueness when code is non-blank.
        # unique_together with blank=True would allow only ONE codeless centre
        # per tenant, which defeats optional codes.
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'code'],
                condition=models.Q(code__gt=''),
                name='acc_costcentre_tenant_code_uniq',
            ),
        ]

    def __str__(self):
        return f"{self.code} – {self.name}" if self.code else self.name


# ─────────────────────────────────────────────────────────────────────────────
# Fiscal Year Close
# ─────────────────────────────────────────────────────────────────────────────

class FiscalYearClose(TenantModel):
    """
    Records a completed year-end closing for a Nepal BS fiscal year.

    The closing process:
      1. Compute net profit for the FY.
      2. Create a closing JournalEntry: DR all P&L accounts, NET to Retained Earnings.
      3. Record this FiscalYearClose so the UI shows the FY as closed.

    After closing, the Balance Sheet shows the retained earnings in equity,
    and the P&L resets to zero for the new fiscal year.
    """
    fy_year       = models.PositiveSmallIntegerField(
        db_index=True,
        help_text='Nepali BS year closed (e.g. 2081 means FY 2081/082).',
    )
    journal_entry = models.OneToOneField(
        JournalEntry, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='fiscal_year_close',
        help_text='The closing journal entry that moved P&L to Retained Earnings.',
    )
    closed_by     = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True,
        on_delete=models.SET_NULL, related_name='+',
    )
    closed_at     = models.DateTimeField(auto_now_add=True)
    retained_earnings_amount = models.DecimalField(
        max_digits=14, decimal_places=2, default=0,
        help_text='Net profit/loss transferred to Retained Earnings.',
    )
    notes = models.TextField(blank=True)

    class Meta(TenantModel.Meta):
        ordering = ['-fy_year']
        unique_together = ('tenant', 'fy_year')

    def __str__(self):
        return f"FY {self.fy_year} Close – {self.tenant_id}"


# ─────────────────────────────────────────────────────────────────────────────
# Payment Allocation  (bill-by-bill settlement)
# ─────────────────────────────────────────────────────────────────────────────

class PaymentAllocation(TenantModel):
    """
    Links a Payment to a specific Invoice or Bill for granular settlement tracking.

    Supports Tally-style bill-by-bill allocation:
      - One payment can be split across multiple invoices.
      - Invoice.amount_paid is derived from both direct Payment.invoice FK
        (legacy) and allocations against this model.
      - sum(allocations) must not exceed payment.amount.
    """
    payment      = models.ForeignKey(
        Payment, on_delete=models.CASCADE, related_name='allocations',
    )
    invoice      = models.ForeignKey(
        Invoice, null=True, blank=True,
        on_delete=models.PROTECT, related_name='allocations',
    )
    bill         = models.ForeignKey(
        Bill, null=True, blank=True,
        on_delete=models.PROTECT, related_name='allocations',
    )
    amount       = models.DecimalField(max_digits=14, decimal_places=2)
    allocated_at = models.DateTimeField(auto_now_add=True)
    note         = models.CharField(max_length=200, blank=True)

    class Meta(TenantModel.Meta):
        ordering = ['-allocated_at']
        indexes = [
            models.Index(fields=['tenant', 'payment'], name='acc_payalloc_pmt_idx'),
            models.Index(fields=['tenant', 'invoice'], name='acc_payalloc_inv_idx'),
            models.Index(fields=['tenant', 'bill'],    name='acc_payalloc_bill_idx'),
        ]

    def __str__(self):
        target = self.invoice or self.bill
        return f"Allocation {self.amount} → {target}"

    def clean(self):
        from django.core.exceptions import ValidationError
        from django.db.models import Sum
        if self.invoice and self.bill:
            raise ValidationError('Allocation cannot link to both invoice and bill.')
        if not self.invoice and not self.bill:
            raise ValidationError('Allocation must link to either invoice or bill.')
        # Guard against allocating more than the payment total.
        existing = (
            self.payment.allocations
            .exclude(pk=self.pk)
            .aggregate(t=Sum('amount'))['t'] or Decimal('0')
        )
        if existing + self.amount > self.payment.amount:
            raise ValidationError(
                f'Allocation of {self.amount} would bring total allocated '
                f'({existing + self.amount}) above payment amount ({self.payment.amount}).'
            )

    def save(self, *args, **kwargs):
        """N4 fix: enforce clean() for all ORM saves, not just ModelForm saves."""
        self.clean()
        super().save(*args, **kwargs)


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


# ─────────────────────────────────────────────────────────────────────────────
# B25 — Journal Entry Audit Trail
# ─────────────────────────────────────────────────────────────────────────────

class JournalEntryAuditLog(models.Model):
    """
    Immutable change log for JournalEntry and JournalLine modifications.

    Every field-level change to a journal record is recorded here before the
    save is committed. Once written, audit log rows are never updated or deleted.

    action: 'create' | 'update' | 'delete'
    field_changes: {field_name: {before: value, after: value}}
    """
    ACTION_CREATE = 'create'
    ACTION_UPDATE = 'update'
    ACTION_DELETE = 'delete'

    ACTION_CHOICES = [
        (ACTION_CREATE, 'Created'),
        (ACTION_UPDATE, 'Updated'),
        (ACTION_DELETE, 'Deleted'),
    ]

    # Not TenantModel — we want audit rows to survive tenant-soft-delete
    tenant        = models.ForeignKey(
        'tenants.Tenant', on_delete=models.CASCADE,
        related_name='journal_audit_logs', db_index=True,
    )
    journal_entry = models.ForeignKey(
        JournalEntry, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='audit_logs',
    )
    entry_number  = models.CharField(max_length=32, blank=True, db_index=True,
        help_text='Snapshot of entry_number at time of change (survives entry deletion).')
    action        = models.CharField(max_length=8, choices=ACTION_CHOICES)
    changed_by    = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True,
        on_delete=models.SET_NULL, related_name='+',
    )
    changed_at    = models.DateTimeField(auto_now_add=True, db_index=True)
    reason        = models.TextField(blank=True, help_text='Optional reason/note for the change.')
    # JSON snapshot: {"field": {"before": val, "after": val}, ...}
    field_changes = models.JSONField(default=dict)
    # Raw snapshot of entry state at time of log
    entry_snapshot = models.JSONField(default=dict)

    class Meta:
        ordering = ['-changed_at']
        indexes = [
            models.Index(fields=['tenant', 'changed_at'], name='acc_jaudit_tenant_date_idx'),
            models.Index(fields=['journal_entry', 'changed_at'], name='acc_jaudit_entry_date_idx'),
        ]

    def __str__(self):
        return f"AuditLog {self.action} {self.entry_number} @ {self.changed_at}"


def capture_entry_snapshot(entry):
    """
    Return a dict of the entry's current auditable field values.

    Pass the return value as ``before_snapshot`` to ``log_journal_change()``
    *before* saving any changes so the diff can be computed correctly.

    Only top-level entry fields are captured here; the full lines list is
    recorded in ``log_journal_change()``'s ``entry_snapshot`` payload.
    """
    return {
        'entry_number':   entry.entry_number or '',
        'date':           str(entry.date),
        'description':    entry.description or '',
        'reference_type': entry.reference_type or '',
        'reference_id':   entry.reference_id,
        'is_posted':      entry.is_posted,
        'total_debit':    str(entry.total_debit),
        'total_credit':   str(entry.total_credit),
    }


def log_journal_change(entry, action, changed_by=None, reason='', before_snapshot=None):
    """
    Create a JournalEntryAuditLog row for a change to *entry*.

    before_snapshot: dict of field values captured BEFORE the change.
    Call before saving when action='update' or 'delete'.
    Call after saving when action='create'.
    """
    snapshot = {
        'entry_number':   entry.entry_number,
        'date':           str(entry.date),
        'description':    entry.description,
        'reference_type': entry.reference_type,
        'reference_id':   entry.reference_id,
        'is_posted':      entry.is_posted,
        'total_debit':    str(entry.total_debit),
        'total_credit':   str(entry.total_credit),
        'lines': [
            {
                'account_code': line.account.code if line.account_id else '',
                'debit':  str(line.debit),
                'credit': str(line.credit),
                'desc':   line.description,
            }
            for line in entry.lines.select_related('account').all()
        ],
    }
    field_changes = {}
    if before_snapshot and action == JournalEntryAuditLog.ACTION_UPDATE:
        for key, before_val in before_snapshot.items():
            after_val = snapshot.get(key)
            if str(before_val) != str(after_val):
                field_changes[key] = {'before': before_val, 'after': after_val}

    JournalEntryAuditLog.objects.create(
        tenant=entry.tenant,
        journal_entry=entry,
        entry_number=entry.entry_number or '',
        action=action,
        changed_by=changed_by,
        reason=reason,
        field_changes=field_changes,
        entry_snapshot=snapshot,
    )


# ─────────────────────────────────────────────────────────────────────────────
# B20 — Multi-Currency
# ─────────────────────────────────────────────────────────────────────────────

class Currency(TenantModel):
    """
    Currency master. The tenant's base currency is flagged is_base=True.
    Only one base currency is allowed per tenant (enforced by UniqueConstraint).
    """
    code        = models.CharField(max_length=3, db_index=True, help_text='ISO 4217 code e.g. NPR, USD, EUR')
    name        = models.CharField(max_length=60)
    symbol      = models.CharField(max_length=6, blank=True)
    is_base     = models.BooleanField(default=False, help_text='True for the tenant base currency.')
    is_active   = models.BooleanField(default=True)
    decimal_places = models.PositiveSmallIntegerField(default=2)

    class Meta(TenantModel.Meta):
        ordering = ['code']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'code'],
                name='acc_currency_tenant_code_uniq',
            ),
            models.UniqueConstraint(
                fields=['tenant'],
                condition=models.Q(is_base=True),
                name='acc_currency_one_base_per_tenant',
            ),
        ]

    def __str__(self):
        return f"{self.code} – {self.name}"


class ExchangeRate(TenantModel):
    """
    Daily exchange rate: 1 unit of *from_currency* = *rate* units of *to_currency*.

    For NPR base: from_currency=USD, to_currency=NPR, rate=134.50 means
    1 USD = 134.50 NPR on that date.

    ExchangeRate.get_rate(tenant, from_code, to_code, date) returns the most
    recent rate on or before the requested date.
    """
    from_currency = models.ForeignKey(
        Currency, on_delete=models.PROTECT, related_name='rates_from',
    )
    to_currency   = models.ForeignKey(
        Currency, on_delete=models.PROTECT, related_name='rates_to',
    )
    rate          = models.DecimalField(max_digits=18, decimal_places=6)
    rate_date     = models.DateField(db_index=True)
    source        = models.CharField(max_length=40, blank=True,
        help_text='Rate source: manual | NRB | ECB etc.')

    class Meta(TenantModel.Meta):
        ordering = ['-rate_date']
        indexes = [
            models.Index(fields=['tenant', 'from_currency', 'to_currency', 'rate_date'],
                         name='acc_exrate_lookup_idx'),
        ]

    def __str__(self):
        return f"{self.from_currency_id}→{self.to_currency_id} {self.rate} @ {self.rate_date}"

    @classmethod
    def get_rate(cls, tenant, from_currency_code, to_currency_code, on_date):
        """
        Return the exchange rate (Decimal) from *from_currency_code* to
        *to_currency_code* on or before *on_date*.
        Raises ValueError if no rate exists.
        """
        row = (
            cls.objects.filter(
                tenant=tenant,
                from_currency__code=from_currency_code,
                to_currency__code=to_currency_code,
                rate_date__lte=on_date,
            )
            .order_by('-rate_date')
            .first()
        )
        if row is None:
            raise ValueError(
                f'No exchange rate found for {from_currency_code}→{to_currency_code} '
                f'on or before {on_date}. Add a rate in Settings → Exchange Rates.'
            )
        return row.rate


# ─────────────────────────────────────────────────────────────────────────────
# B21 — Fixed Asset & Depreciation Engine
# ─────────────────────────────────────────────────────────────────────────────

class FixedAsset(TenantModel):
    """
    Tally-style Fixed Asset register.

    Supports Straight-Line (SLM) and Written-Down Value / Diminishing Balance (WDV)
    depreciation methods. Auto-generates a monthly/yearly depreciation journal:
      Dr  Depreciation Expense     (indirect_expense group)
      Cr  Accumulated Depreciation (fixed_assets group — contra asset)

    Accumulated depreciation is tracked in its own Account (linked via
    accum_depr_account FK) so the balance sheet shows:
      Fixed Asset at cost:               XXX
      Less: Accumulated Depreciation:   (YYY)
      Net Book Value:                    ZZZ
    """
    METHOD_SLM = 'slm'   # Straight-Line
    METHOD_WDV = 'wdv'   # Written-Down Value / Diminishing Balance

    METHOD_CHOICES = [
        (METHOD_SLM, 'Straight-Line (SLM)'),
        (METHOD_WDV, 'Written-Down Value (WDV)'),
    ]

    STATUS_ACTIVE   = 'active'
    STATUS_DISPOSED = 'disposed'
    STATUS_FULLY_DEPRECIATED = 'fully_depreciated'

    STATUS_CHOICES = [
        (STATUS_ACTIVE,            'Active'),
        (STATUS_DISPOSED,          'Disposed'),
        (STATUS_FULLY_DEPRECIATED, 'Fully Depreciated'),
    ]

    name             = models.CharField(max_length=200)
    asset_code       = models.CharField(max_length=20, blank=True, db_index=True)
    # The Balance Sheet asset account (e.g. "Furniture & Fixtures 1700")
    asset_account    = models.ForeignKey(
        Account, on_delete=models.PROTECT,
        related_name='fixed_assets_asset',
        help_text='CoA account for the asset cost (must be in fixed_assets group).',
    )
    # Contra-asset account for accumulated depreciation (e.g. "Acc. Depr – Furniture 1701")
    accum_depr_account = models.ForeignKey(
        Account, null=True, blank=True,
        on_delete=models.PROTECT,
        related_name='fixed_assets_accum',
        help_text='Accumulated Depreciation account. Created if blank.',
    )
    # P&L expense account (indirect_expense group)
    depr_expense_account = models.ForeignKey(
        Account, null=True, blank=True,
        on_delete=models.PROTECT,
        related_name='fixed_assets_depr_exp',
        help_text='Depreciation Expense account. Defaults to group indirect_expense.',
    )
    purchase_date    = models.DateField()
    purchase_cost    = models.DecimalField(max_digits=14, decimal_places=2)
    residual_value   = models.DecimalField(max_digits=14, decimal_places=2, default=0,
        help_text='Estimated salvage value at end of useful life.')
    useful_life_months = models.PositiveIntegerField(default=60,
        help_text='Useful life in months (e.g. 60 = 5 years).')
    depreciation_rate  = models.DecimalField(
        max_digits=6, decimal_places=4, null=True, blank=True,
        help_text='Annual rate for WDV method (e.g. 0.20 = 20%). '
                  'Leave blank for SLM — rate is auto-computed from useful_life_months.',
    )
    method           = models.CharField(max_length=3, choices=METHOD_CHOICES, default=METHOD_SLM)
    status           = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    last_depreciation_date = models.DateField(null=True, blank=True,
        help_text='Date of the most recent depreciation journal.')
    total_depreciated = models.DecimalField(max_digits=14, decimal_places=2, default=0,
        help_text='Running total of all depreciation posted for this asset.')
    notes            = models.TextField(blank=True)

    class Meta(TenantModel.Meta):
        ordering = ['-purchase_date', 'name']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'asset_code'],
                condition=models.Q(asset_code__gt=''),
                name='acc_fixedasset_tenant_code_uniq',
            ),
        ]

    def __str__(self):
        return f"{self.asset_code or self.pk} – {self.name}"

    @property
    def net_book_value(self):
        """Cost minus accumulated depreciation."""
        return self.purchase_cost - self.total_depreciated

    def monthly_slm_charge(self):
        """Monthly straight-line depreciation amount."""
        depreciable = self.purchase_cost - self.residual_value
        if depreciable <= Decimal('0') or not self.useful_life_months:
            return Decimal('0')
        return (depreciable / self.useful_life_months).quantize(Decimal('0.01'))

    def wdv_charge_for_period(self):
        """
        Yearly WDV charge on net book value.
        Caller should divide by 12 for monthly posting.
        """
        if not self.depreciation_rate:
            return Decimal('0')
        nbv = self.net_book_value
        if nbv <= self.residual_value:
            return Decimal('0')
        annual = (nbv * self.depreciation_rate).quantize(Decimal('0.01'))
        return annual

