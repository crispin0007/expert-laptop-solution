from rest_framework import serializers
from .models import (
    CoinTransaction, Payslip, Invoice,
    Account, JournalEntry, JournalLine, BankAccount,
    Bill, Payment, CreditNote,
    Quotation, DebitNote, TDSEntry,
    BankReconciliation, BankReconciliationLine, RecurringJournal,
)


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

    def create(self, validated_data):
        lines_data   = validated_data.pop('lines')
        entry        = JournalEntry.objects.create(**validated_data)
        for line in lines_data:
            JournalLine.objects.create(entry=entry, **line)
        return entry


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

class BillSerializer(serializers.ModelSerializer):
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


# ─── Payments ────────────────────────────────────────────────────────────────

class PaymentSerializer(serializers.ModelSerializer):
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


# ─── Payslips ────────────────────────────────────────────────────────────────

class PayslipSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source='staff.full_name', read_only=True, default='')

    class Meta:
        model  = Payslip
        fields = (
            'id', 'staff', 'staff_name', 'period_start', 'period_end',
            'total_coins', 'coin_to_money_rate', 'gross_amount',
            'base_salary', 'bonus', 'deductions', 'net_pay',
            'status', 'issued_at', 'paid_at', 'created_at',
        )
        read_only_fields = (
            'total_coins', 'coin_to_money_rate', 'gross_amount', 'net_pay',
            'issued_at', 'paid_at', 'created_at',
        )


# ─── Invoices ────────────────────────────────────────────────────────────────

class CoinTransactionSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source='staff.full_name', read_only=True, default='')
    approved_by_name = serializers.CharField(source='approved_by.full_name', read_only=True, default='')

    class Meta:
        model = CoinTransaction
        fields = (
            'id', 'staff', 'staff_name', 'amount', 'source_type', 'source_id',
            'status', 'approved_by', 'approved_by_name', 'note', 'created_at',
        )
        read_only_fields = ('status', 'approved_by', 'approved_by_name', 'created_at')


class InvoiceSerializer(serializers.ModelSerializer):
    customer_name             = serializers.CharField(source='customer.name',        read_only=True, default='')
    ticket_number             = serializers.CharField(source='ticket.ticket_number', read_only=True, default='')
    project_name              = serializers.CharField(source='project.name',         read_only=True, default='')
    amount_paid               = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    amount_due                = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    payment_received_by_name  = serializers.SerializerMethodField()
    finance_reviewed_by_name  = serializers.SerializerMethodField()

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


# ─── Quotations ──────────────────────────────────────────────────────────────

class QuotationSerializer(serializers.ModelSerializer):
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

