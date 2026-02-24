from rest_framework import serializers
from .models import CoinTransaction, Payslip, Invoice


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


class PayslipSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source='staff.full_name', read_only=True, default='')

    class Meta:
        model = Payslip
        fields = (
            'id', 'staff', 'staff_name', 'period_start', 'period_end',
            'total_coins', 'coin_to_money_rate', 'gross_amount',
            'status', 'issued_at', 'paid_at', 'created_at',
        )
        read_only_fields = (
            'total_coins', 'coin_to_money_rate', 'gross_amount',
            'issued_at', 'paid_at', 'created_at',
        )


class InvoiceSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.name', read_only=True, default='')
    ticket_number = serializers.CharField(source='ticket.ticket_number', read_only=True, default='')
    project_name  = serializers.CharField(source='project.name', read_only=True, default='')

    class Meta:
        model = Invoice
        fields = (
            'id', 'invoice_number',
            'customer', 'customer_name',
            'ticket', 'ticket_number',
            'project', 'project_name',
            'line_items', 'subtotal', 'discount', 'vat_rate',
            'vat_amount', 'total', 'status', 'due_date', 'paid_at',
            'notes', 'created_at', 'updated_at',
        )
        read_only_fields = (
            'invoice_number', 'vat_rate', 'vat_amount', 'subtotal',
            'total', 'paid_at', 'created_at', 'updated_at',
        )

