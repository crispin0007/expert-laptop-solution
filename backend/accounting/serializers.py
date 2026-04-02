from rest_framework import serializers
from core.serializers import NepaliModelSerializer
from .models import (
    CoinTransaction, Payslip, Invoice,
    Account, JournalEntry, JournalLine, BankAccount,
    Bill, Payment, CreditNote,
    Quotation, DebitNote, TDSEntry,
    BankReconciliation, BankReconciliationLine, RecurringJournal,
    StaffSalaryProfile, Expense,
)


def _tenant_from_context(serializer) -> object:
    request = serializer.context.get('request')
    return getattr(request, 'tenant', None) if request is not None else None


def _ensure_same_tenant(obj, tenant, label: str):
    if obj is None or tenant is None:
        return
    if getattr(obj, 'tenant_id', None) != tenant.id:
        raise serializers.ValidationError({
            label: f'{label.replace("_", " ").capitalize()} does not belong to this workspace.'
        })


def _ensure_staff_in_tenant(staff, tenant, label: str = 'staff'):
    if staff is None or tenant is None:
        return
    from accounts.models import TenantMembership

    is_member = TenantMembership.objects.filter(
        tenant=tenant,
        user=staff,
        is_active=True,
    ).exists()
    if not is_member:
        raise serializers.ValidationError({
            label: 'Staff member is not part of this workspace.'
        })


# ─── Chart of Accounts ───────────────────────────────────────────────────────

class AccountSerializer(serializers.ModelSerializer):
    parent_name = serializers.CharField(source='parent.name', read_only=True, default='')
    balance     = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model  = Account
        fields = (
            'id', 'code', 'name', 'type', 'parent', 'parent_name',
            'description', 'is_system', 'is_active', 'balance', 'created_at',
        )
        read_only_fields = ('is_system', 'balance', 'created_at')


# ─── Journal Entries ─────────────────────────────────────────────────────────

class JournalLineSerializer(serializers.ModelSerializer):
    account_code = serializers.CharField(source='account.code', read_only=True)
    account_name = serializers.CharField(source='account.name', read_only=True)

    class Meta:
        model  = JournalLine
        fields = ('id', 'account', 'account_code', 'account_name', 'debit', 'credit', 'description')


class JournalEntrySerializer(serializers.ModelSerializer):
    lines        = JournalLineSerializer(many=True, read_only=True)
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True, default='')

    class Meta:
        model  = JournalEntry
        fields = (
            'id', 'entry_number', 'date', 'description',
            'reference_type', 'reference_id',
            'is_posted', 'total_debit', 'total_credit',
            'lines', 'created_by_name', 'created_at',
        )
        read_only_fields = ('entry_number', 'is_posted', 'total_debit', 'total_credit', 'created_at')


class JournalEntryWriteSerializer(serializers.ModelSerializer):
    """For creating manual journal entries with nested lines."""
    lines = JournalLineSerializer(many=True)

    class Meta:
        model  = JournalEntry
        fields = ('date', 'description', 'lines')

    def validate_lines(self, lines):
        """Ensure every referenced account belongs to the requesting tenant."""
        request = self.context.get('request')
        if request and getattr(request, 'tenant', None):
            tenant = request.tenant
            for line in lines:
                account = line.get('account')
                if account and getattr(account, 'tenant_id', None) != tenant.pk:
                    raise serializers.ValidationError(
                        f"Account '{getattr(account, 'code', account)}' does not belong to this workspace."
                    )
        return lines

    def create(self, validated_data):
        lines_data   = validated_data.pop('lines')
        entry        = JournalEntry.objects.create(**validated_data)
        for line in lines_data:
            JournalLine.objects.create(entry=entry, **line)
        return entry

    def update(self, instance, validated_data):
        lines_data = validated_data.pop('lines', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save(update_fields=list(validated_data.keys()) or ['date', 'description'])
        if lines_data is not None:
            instance.lines.all().delete()
            for line in lines_data:
                JournalLine.objects.create(entry=instance, **line)
        return instance


# ─── Bank Accounts ───────────────────────────────────────────────────────────

class BankAccountSerializer(serializers.ModelSerializer):
    current_balance  = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    linked_account_name = serializers.CharField(source='linked_account.name', read_only=True, default='')

    class Meta:
        model  = BankAccount
        fields = (
            'id', 'name', 'bank_name', 'account_number', 'currency',
            'opening_balance', 'linked_account', 'linked_account_name',
            'is_active', 'current_balance', 'created_at',
        )
        read_only_fields = ('current_balance', 'created_at')


# ─── Bills ───────────────────────────────────────────────────────────────────

class BillSerializer(NepaliModelSerializer):
    supplier_display = serializers.SerializerMethodField()
    amount_paid      = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    amount_due       = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model  = Bill
        fields = (
            'id', 'bill_number', 'supplier', 'supplier_name', 'supplier_display',
            'line_items', 'subtotal', 'discount', 'vat_rate', 'vat_amount', 'total',
            'status', 'due_date', 'reference', 'notes',
            'approved_at', 'paid_at', 'amount_paid', 'amount_due',
            'created_at', 'updated_at',
        )
        read_only_fields = (
            'bill_number', 'vat_rate', 'vat_amount', 'subtotal', 'total',
            'approved_at', 'paid_at', 'amount_paid', 'amount_due',
            'created_at', 'updated_at',
        )

    def get_supplier_display(self, obj):
        if obj.supplier:
            return obj.supplier.name
        return obj.supplier_name

    def validate(self, attrs):
        tenant = _tenant_from_context(self)
        supplier = attrs.get('supplier', getattr(self.instance, 'supplier', None))
        _ensure_same_tenant(supplier, tenant, 'supplier')
        return attrs


# ─── Payments ────────────────────────────────────────────────────────────────

class PaymentSerializer(NepaliModelSerializer):
    invoice_number  = serializers.CharField(source='invoice.invoice_number', read_only=True, default='')
    bill_number     = serializers.CharField(source='bill.bill_number',       read_only=True, default='')
    bank_account_name = serializers.CharField(source='bank_account.name',   read_only=True, default='')
    created_by_name   = serializers.CharField(source='created_by.full_name', read_only=True, default='')

    class Meta:
        model  = Payment
        fields = (
            'id', 'payment_number', 'date', 'type', 'method', 'amount',
            'bank_account', 'bank_account_name',
            'invoice', 'invoice_number',
            'bill', 'bill_number',
            'reference', 'notes',
            'created_by_name', 'created_at',
        )
        read_only_fields = ('payment_number', 'created_at')

    def validate(self, attrs):
        tenant = _tenant_from_context(self)
        invoice = attrs.get('invoice', getattr(self.instance, 'invoice', None))
        bill = attrs.get('bill', getattr(self.instance, 'bill', None))
        bank_account = attrs.get('bank_account', getattr(self.instance, 'bank_account', None))

        _ensure_same_tenant(invoice, tenant, 'invoice')
        _ensure_same_tenant(bill, tenant, 'bill')
        _ensure_same_tenant(bank_account, tenant, 'bank_account')

        if invoice is not None and bill is not None:
            raise serializers.ValidationError({'non_field_errors': ['Payment cannot be linked to both invoice and bill.']})

        return attrs


# ─── Credit Notes ────────────────────────────────────────────────────────────

class CreditNoteSerializer(serializers.ModelSerializer):
    invoice_number    = serializers.CharField(source='invoice.invoice_number',   read_only=True, default='')
    applied_to_number = serializers.CharField(source='applied_to.invoice_number', read_only=True, default='')

    class Meta:
        model  = CreditNote
        fields = (
            'id', 'credit_note_number', 'invoice', 'invoice_number',
            'line_items', 'subtotal', 'vat_amount', 'total',
            'reason', 'status', 'applied_to', 'applied_to_number',
            'issued_at', 'created_at',
        )
        read_only_fields = (
            'credit_note_number', 'issued_at', 'created_at',
        )


# ─── Coins ───────────────────────────────────────────────────────────────────

class CoinTransactionSerializer(serializers.ModelSerializer):
    staff_name       = serializers.CharField(source='staff.full_name',       read_only=True, default='')
    approved_by_name = serializers.CharField(source='approved_by.full_name', read_only=True, default='')

    class Meta:
        model  = CoinTransaction
        fields = (
            'id', 'staff', 'staff_name', 'amount', 'source_type', 'source_id',
            'status', 'approved_by', 'approved_by_name', 'note', 'created_at',
        )
        read_only_fields = ('status', 'approved_by', 'approved_by_name', 'created_at')

    def validate(self, attrs):
        tenant = _tenant_from_context(self)
        staff = attrs.get('staff', getattr(self.instance, 'staff', None))
        _ensure_staff_in_tenant(staff, tenant, 'staff')
        return attrs


class CoinTransactionDetailSerializer(CoinTransactionSerializer):
    """
    Extended serializer for the retrieve endpoint.
    Includes source_context: full ticket/task info with service charge
    and per-product breakdown so the approver has full context.
    """
    source_context = serializers.SerializerMethodField(read_only=True)

    class Meta(CoinTransactionSerializer.Meta):
        fields = CoinTransactionSerializer.Meta.fields + ('source_context',)

    def get_source_context(self, obj):
        """Resolve the linked ticket or task and return relevant billing context."""
        from decimal import Decimal

        if obj.source_type == CoinTransaction.SOURCE_TICKET and obj.source_id:
            try:
                from tickets.models import Ticket, TicketProduct
                ticket = (
                    Ticket.objects
                    .select_related('customer', 'assigned_to', 'ticket_type', 'department')
                    .get(pk=obj.source_id, tenant=obj.tenant)
                )
                products = list(
                    TicketProduct.objects
                    .filter(ticket=ticket)
                    .select_related('product')
                )
                product_total = sum(
                    p.unit_price * p.quantity * (1 - p.discount / Decimal('100'))
                    for p in products
                ) if products else Decimal('0')
                return {
                    'type': 'ticket',
                    'id': ticket.pk,
                    'ticket_number': ticket.ticket_number,
                    'title': ticket.title,
                    'customer_name': ticket.customer.name if ticket.customer else None,
                    'department_name': ticket.department.name if ticket.department else None,
                    'ticket_type_name': ticket.ticket_type.name if ticket.ticket_type else None,
                    'status': ticket.status,
                    'priority': ticket.priority,
                    'service_charge': str(ticket.service_charge),
                    'product_total': str(product_total.quantize(Decimal('0.01'))),
                    'billing_total': str((ticket.service_charge + product_total).quantize(Decimal('0.01'))),
                    'product_count': len(products),
                    'products': [
                        {
                            'name': p.product.name,
                            'quantity': p.quantity,
                            'unit_price': str(p.unit_price),
                            'discount': str(p.discount),
                            'line_total': str(
                                (p.unit_price * p.quantity * (1 - p.discount / Decimal('100')))
                                .quantize(Decimal('0.01'))
                            ),
                        }
                        for p in products
                    ],
                    'closed_at': ticket.closed_at.isoformat() if ticket.closed_at else None,
                    'assigned_to_name': ticket.assigned_to.full_name if ticket.assigned_to else None,
                }
            except Exception:
                return None

        if obj.source_type == CoinTransaction.SOURCE_TASK and obj.source_id:
            try:
                from projects.models import Task
                task = (
                    Task.objects
                    .select_related('project')
                    .get(pk=obj.source_id, tenant=obj.tenant)
                )
                return {
                    'type': 'task',
                    'id': task.pk,
                    'title': task.title,
                    'project_name': task.project.name if task.project else None,
                    'status': task.status,
                }
            except Exception:
                return None

        return None


# ─── Payslips ────────────────────────────────────────────────────────────────

class StaffSalaryProfileSerializer(serializers.ModelSerializer):
    staff_name  = serializers.SerializerMethodField()
    staff_email = serializers.CharField(source='staff.email', read_only=True, default='')

    def get_staff_name(self, obj):
        if not obj.staff:
            return ''
        return obj.staff.full_name or obj.staff.email or ''

    class Meta:
        model  = StaffSalaryProfile
        fields = (
            'id', 'staff', 'staff_name', 'staff_email',
            'base_salary', 'tds_rate', 'bonus_default',
            'effective_from', 'notes', 'created_at', 'updated_at',
        )
        read_only_fields = ('created_at', 'updated_at')

    def validate(self, attrs):
        tenant = _tenant_from_context(self)
        staff = attrs.get('staff', getattr(self.instance, 'staff', None))
        _ensure_staff_in_tenant(staff, tenant, 'staff')
        return attrs


class PayslipSerializer(NepaliModelSerializer):
    staff_name        = serializers.SerializerMethodField()
    bank_account_name = serializers.CharField(source='bank_account.name', read_only=True, default='')

    def get_staff_name(self, obj):
        if not obj.staff:
            return ''
        return obj.staff.full_name or obj.staff.email or ''

    class Meta:
        model  = Payslip
        fields = (
            'id', 'staff', 'staff_name', 'period_start', 'period_end',
            'total_coins', 'coin_to_money_rate', 'gross_amount',
            'base_salary', 'bonus', 'tds_amount', 'deductions', 'net_pay',
            'status', 'issued_at', 'paid_at',
            'payment_method', 'bank_account', 'bank_account_name',
            'created_at',
        )
        read_only_fields = (
            'total_coins', 'coin_to_money_rate', 'gross_amount', 'net_pay',
            'tds_amount',
            'issued_at', 'paid_at', 'payment_method', 'bank_account',
            'bank_account_name', 'created_at',
        )

    def validate(self, attrs):
        tenant = _tenant_from_context(self)
        staff = attrs.get('staff', getattr(self.instance, 'staff', None))
        bank_account = attrs.get('bank_account', getattr(self.instance, 'bank_account', None))
        _ensure_staff_in_tenant(staff, tenant, 'staff')
        _ensure_same_tenant(bank_account, tenant, 'bank_account')
        return attrs


# ─── Invoices ────────────────────────────────────────────────────────────────


class InvoiceSerializer(NepaliModelSerializer):
    customer_name             = serializers.CharField(source='customer.name',        read_only=True, default='')
    ticket_number             = serializers.CharField(source='ticket.ticket_number', read_only=True, default='')
    project_name              = serializers.CharField(source='project.name',         read_only=True, default='')
    amount_paid               = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    amount_due                = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    payment_received_by_name  = serializers.SerializerMethodField()
    finance_reviewed_by_name  = serializers.SerializerMethodField()
    apply_vat                 = serializers.BooleanField(default=True, write_only=True, required=False)

    class Meta:
        model = Invoice
        fields = (
            'id', 'invoice_number',
            'customer', 'customer_name',
            'ticket', 'ticket_number',
            'project', 'project_name',
            'line_items', 'subtotal', 'discount', 'vat_rate',
            'vat_amount', 'total', 'amount_paid', 'amount_due',
            'status', 'due_date', 'paid_at',
            'bill_address', 'payment_terms', 'reference',
            'notes', 'created_at', 'updated_at',
            'apply_vat',
            # Billing workflow fields
            'finance_status',
            'payment_received', 'payment_method',
            'payment_received_at', 'payment_received_by', 'payment_received_by_name',
            'finance_reviewed_by', 'finance_reviewed_by_name',
            'finance_reviewed_at', 'finance_notes',
        )
        read_only_fields = (
            'invoice_number', 'vat_rate', 'vat_amount', 'subtotal',
            'total', 'amount_paid', 'amount_due', 'paid_at',
            'created_at', 'updated_at',
            'payment_received_at', 'payment_received_by',
            'finance_reviewed_by', 'finance_reviewed_at',
        )

    def get_payment_received_by_name(self, obj):
        if obj.payment_received_by:
            return obj.payment_received_by.get_full_name() or obj.payment_received_by.email
        return ''

    def get_finance_reviewed_by_name(self, obj):
        if obj.finance_reviewed_by:
            return obj.finance_reviewed_by.get_full_name() or obj.finance_reviewed_by.email
        return ''

    def validate(self, attrs):
        tenant = _tenant_from_context(self)
        customer = attrs.get('customer', getattr(self.instance, 'customer', None))
        ticket = attrs.get('ticket', getattr(self.instance, 'ticket', None))
        project = attrs.get('project', getattr(self.instance, 'project', None))
        _ensure_same_tenant(customer, tenant, 'customer')
        _ensure_same_tenant(ticket, tenant, 'ticket')
        _ensure_same_tenant(project, tenant, 'project')
        return attrs


# ─── Quotations ──────────────────────────────────────────────────────────────

class QuotationSerializer(NepaliModelSerializer):
    customer_name     = serializers.CharField(source='customer.name', read_only=True, default='')
    ticket_number     = serializers.CharField(source='ticket.ticket_number', read_only=True, default='')
    project_name      = serializers.CharField(source='project.name', read_only=True, default='')
    converted_invoice_number = serializers.CharField(
        source='converted_invoice.invoice_number', read_only=True, default=''
    )

    class Meta:
        model  = Quotation
        fields = (
            'id', 'quotation_number',
            'customer', 'customer_name',
            'ticket', 'ticket_number',
            'project', 'project_name',
            'line_items', 'subtotal', 'discount', 'vat_rate', 'vat_amount', 'total',
            'status', 'valid_until', 'notes', 'terms',
            'sent_at', 'accepted_at',
            'converted_invoice', 'converted_invoice_number',
            'created_at', 'updated_at',
        )
        read_only_fields = (
            'quotation_number', 'vat_rate', 'vat_amount', 'subtotal', 'total',
            'sent_at', 'accepted_at', 'converted_invoice', 'created_at', 'updated_at',
        )


# ─── Debit Notes ─────────────────────────────────────────────────────────────

class DebitNoteSerializer(serializers.ModelSerializer):
    bill_number = serializers.CharField(source='bill.bill_number', read_only=True)

    class Meta:
        model  = DebitNote
        fields = (
            'id', 'debit_note_number',
            'bill', 'bill_number',
            'line_items', 'subtotal', 'vat_amount', 'total',
            'reason', 'status', 'issued_at',
            'created_at', 'updated_at',
        )
        read_only_fields = (
            'debit_note_number', 'subtotal', 'vat_amount', 'total',
            'issued_at', 'created_at', 'updated_at',
        )


# ─── TDS ─────────────────────────────────────────────────────────────────────

class TDSEntrySerializer(serializers.ModelSerializer):
    bill_number = serializers.CharField(source='bill.bill_number', read_only=True, default='')

    class Meta:
        model  = TDSEntry
        fields = (
            'id',
            'bill', 'bill_number',
            'supplier_name', 'supplier_pan',
            'taxable_amount', 'tds_rate', 'tds_amount', 'net_payable',
            'status', 'period_month', 'period_year',
            'deposited_at', 'deposit_reference',
            'created_at',
        )
        read_only_fields = ('tds_amount', 'net_payable', 'deposited_at', 'created_at')


# ─── Bank Reconciliation ─────────────────────────────────────────────────────

class BankReconciliationLineSerializer(serializers.ModelSerializer):
    class Meta:
        model  = BankReconciliationLine
        fields = ('id', 'date', 'description', 'amount', 'is_matched', 'payment')
        # payment is set exclusively via the match-line action, which validates
        # tenant=self.tenant. Making it read-only here prevents cross-tenant
        # payment linkage through the add-line endpoint.
        read_only_fields = ('is_matched', 'payment')


class BankReconciliationSerializer(serializers.ModelSerializer):
    bank_account_name = serializers.CharField(source='bank_account.name', read_only=True)
    lines             = BankReconciliationLineSerializer(many=True, read_only=True)
    difference        = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model  = BankReconciliation
        fields = (
            'id', 'bank_account', 'bank_account_name',
            'statement_date', 'opening_balance', 'closing_balance',
            'status', 'notes', 'reconciled_at', 'difference',
            'lines', 'created_at',
        )
        read_only_fields = ('reconciled_at', 'created_at')


# ─── Recurring Journals ───────────────────────────────────────────────────────

class RecurringJournalSerializer(serializers.ModelSerializer):
    class Meta:
        model  = RecurringJournal
        fields = (
            'id', 'name', 'description',
            'frequency', 'start_date', 'end_date', 'next_date',
            'is_active', 'template_lines', 'last_run_at',
            'created_at', 'updated_at',
        )
        read_only_fields = ('last_run_at', 'created_at', 'updated_at')


# ─── Expenses ─────────────────────────────────────────────────────────────────

class ExpenseSerializer(serializers.ModelSerializer):
    """Read serializer — full detail."""
    submitted_by_name = serializers.CharField(source='submitted_by.get_full_name', default='', read_only=True)
    approved_by_name  = serializers.CharField(source='approved_by.get_full_name',  default='', read_only=True)
    rejected_by_name  = serializers.CharField(source='rejected_by.get_full_name',  default='', read_only=True)
    account_name      = serializers.CharField(source='account.name', default='',   read_only=True)
    category_display  = serializers.CharField(source='get_category_display',        read_only=True)
    status_display    = serializers.CharField(source='get_status_display',          read_only=True)

    class Meta:
        model  = Expense
        fields = (
            'id', 'category', 'category_display', 'description',
            'amount', 'date', 'account', 'account_name',
            'receipt_url', 'notes', 'status', 'status_display',
            'submitted_by', 'submitted_by_name',
            'approved_by', 'approved_by_name', 'approved_at',
            'rejected_by', 'rejected_by_name', 'rejected_at', 'rejection_note',
            'is_recurring', 'recur_interval', 'next_recur_date',
            'journal_entry', 'created_at', 'updated_at',
        )
        read_only_fields = (
            'submitted_by', 'approved_by', 'approved_at',
            'rejected_by', 'rejected_at',
            'journal_entry', 'created_at', 'updated_at',
        )


class ExpenseListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views and mobile."""
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    status_display   = serializers.CharField(source='get_status_display',   read_only=True)

    class Meta:
        model  = Expense
        fields = (
            'id', 'category', 'category_display', 'description',
            'amount', 'date', 'status', 'status_display', 'receipt_url',
            'created_at',
        )


class ExpenseWriteSerializer(serializers.ModelSerializer):
    """Write serializer — create and update."""
    class Meta:
        model  = Expense
        fields = (
            'category', 'description', 'amount', 'date',
            'account', 'receipt_url', 'notes',
            'is_recurring', 'recur_interval', 'next_recur_date',
        )

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError('Amount must be greater than zero.')
        return value

    def validate(self, attrs):
        if attrs.get('is_recurring') and not attrs.get('recur_interval'):
            raise serializers.ValidationError(
                {'recur_interval': 'recur_interval is required when is_recurring is True.'}
            )
        if attrs.get('is_recurring') and not attrs.get('next_recur_date'):
            raise serializers.ValidationError(
                {'next_recur_date': 'next_recur_date is required when is_recurring is True.'}
            )
        return attrs

