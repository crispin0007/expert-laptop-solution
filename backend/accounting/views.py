from decimal import Decimal
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from core.mixins import TenantMixin
from core.permissions import make_role_permission, ALL_ROLES, STAFF_ROLES, MANAGER_ROLES, ADMIN_ROLES
from .models import CoinTransaction, Payslip, Invoice
from .serializers import CoinTransactionSerializer, PayslipSerializer, InvoiceSerializer


class CoinTransactionViewSet(TenantMixin, viewsets.ModelViewSet):
    """
    Coin transactions for staff.

    Filtering
    ---------
    ?status=pending|approved|rejected   — filter by approval status
    ?staff=<user_id>                    — coin history for a specific staff member

    Extra actions
    -------------
    POST /coins/{id}/approve/           — approve a pending transaction (manager+)
    POST /coins/{id}/reject/            — reject a pending transaction (manager+)
    GET  /coins/pending/                — shorthand: all pending transactions
    POST /coins/award/                  — manually award coins to a staff member (manager+)
    GET  /coins/staff/{staff_id}/       — coin history for a staff member (alias for ?staff=)

    Permissions
    -----------
    - list/retrieve: all members (auto-filtered to own coins for non-managers)
    - create: staff+
    - approve/reject/award/pending: manager+
    - destroy: admin+
    """

    queryset = CoinTransaction.objects.select_related('staff', 'approved_by')
    serializer_class = CoinTransactionSerializer
    required_module = 'accounting'

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES)()]
        if self.action in ('approve', 'reject', 'pending', 'award', 'staff_coins'):
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES)()]
        if self.action == 'destroy':
            return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*STAFF_ROLES)()]

    def get_queryset(self):
        self.ensure_tenant()
        qs = CoinTransaction.objects.filter(tenant=self.tenant).select_related('staff', 'approved_by')
        params = self.request.query_params
        if s := params.get('status'):
            qs = qs.filter(status=s)
        if staff_id := params.get('staff'):
            qs = qs.filter(staff_id=staff_id)
        # Non-managers (staff/viewer) can only see their own coin transactions
        elif not self.is_manager_role():
            qs = qs.filter(staff=self.request.user)
        return qs.order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save(tenant=self.tenant, created_by=self.request.user)

    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        """Approve a pending coin transaction."""
        if not self.is_manager_role():
            return Response(
                {'detail': 'Only managers or admins can approve coin transactions.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        coin_txn = self.get_object()
        if coin_txn.status != CoinTransaction.STATUS_PENDING:
            return Response(
                {'detail': 'Only pending transactions can be approved.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        coin_txn.status = CoinTransaction.STATUS_APPROVED
        coin_txn.approved_by = request.user
        coin_txn.save(update_fields=['status', 'approved_by'])
        return Response(CoinTransactionSerializer(coin_txn).data)

    @action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request, pk=None):
        """Reject a pending coin transaction."""
        if not self.is_manager_role():
            return Response(
                {'detail': 'Only managers or admins can reject coin transactions.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        coin_txn = self.get_object()
        if coin_txn.status != CoinTransaction.STATUS_PENDING:
            return Response(
                {'detail': 'Only pending transactions can be rejected.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        coin_txn.status = CoinTransaction.STATUS_REJECTED
        coin_txn.approved_by = request.user
        coin_txn.note = request.data.get('note', coin_txn.note)
        coin_txn.save(update_fields=['status', 'approved_by', 'note'])
        return Response(CoinTransactionSerializer(coin_txn).data)

    @action(detail=False, methods=['get'], url_path='pending')
    def pending(self, request):
        """GET /coins/pending/ — shorthand list of all pending coin transactions."""
        self.ensure_tenant()
        qs = CoinTransaction.objects.filter(
            tenant=self.tenant,
            status=CoinTransaction.STATUS_PENDING,
        ).select_related('staff', 'approved_by').order_by('-created_at')
        return Response(CoinTransactionSerializer(qs, many=True).data)

    @action(detail=False, methods=['post'], url_path='award')
    def award(self, request):
        """
        POST /coins/award/ — manually award coins to a staff member (manager+ only).

        Body
        ----
        staff       : int    — user ID of the staff member
        amount      : number — number of coins to award
        note        : string — reason for manual award
        source_type : string — 'ticket' | 'task' | 'manual' (default='manual')
        source_id   : int    — related ticket/task pk (optional)
        """
        if not self.is_manager_role():
            return Response(
                {'detail': 'Only managers or admins can award coins.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        self.ensure_tenant()
        from django.contrib.auth import get_user_model
        User = get_user_model()

        staff_id = request.data.get('staff')
        raw_amount = request.data.get('amount')

        if not staff_id or raw_amount is None:
            return Response(
                {'detail': 'staff and amount fields are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            amount = Decimal(str(raw_amount))
            if amount <= 0:
                raise ValueError
        except (ValueError, TypeError):
            return Response(
                {'detail': 'amount must be a positive number.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            staff = User.objects.get(pk=staff_id)
        except User.DoesNotExist:
            return Response({'detail': 'Staff user not found.'}, status=status.HTTP_404_NOT_FOUND)

        source_type = request.data.get('source_type', CoinTransaction.SOURCE_MANUAL)
        if source_type not in dict(CoinTransaction.SOURCE_TYPES):
            source_type = CoinTransaction.SOURCE_MANUAL

        coin_txn = CoinTransaction.objects.create(
            tenant=self.tenant,
            created_by=request.user,
            staff=staff,
            amount=amount,
            source_type=source_type,
            source_id=request.data.get('source_id'),
            status=CoinTransaction.STATUS_APPROVED,
            approved_by=request.user,
            note=request.data.get('note', ''),
        )
        return Response(CoinTransactionSerializer(coin_txn).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path=r'staff/(?P<staff_id>[^/.]+)')
    def staff_history(self, request, staff_id=None):
        """GET /coins/staff/{staff_id}/ — coin transaction history for a staff member."""
        self.ensure_tenant()
        qs = CoinTransaction.objects.filter(
            tenant=self.tenant,
            staff_id=staff_id,
        ).select_related('staff', 'approved_by').order_by('-created_at')

        # Aggregate summary
        from django.db.models import Sum, Q
        total_approved = qs.filter(status=CoinTransaction.STATUS_APPROVED).aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0')
        total_pending = qs.filter(status=CoinTransaction.STATUS_PENDING).aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0')

        # Coin value in currency
        coin_rate = self.tenant.coin_to_money_rate if self.tenant else Decimal('1')

        return Response({
            'staff_id': staff_id,
            'coin_rate': str(coin_rate),
            'total_approved_coins': str(total_approved),
            'total_approved_value': str((total_approved * coin_rate).quantize(Decimal('0.01'))),
            'total_pending_coins': str(total_pending),
            'transactions': CoinTransactionSerializer(qs, many=True).data,
        })


class PayslipViewSet(TenantMixin, viewsets.ModelViewSet):
    """Payslips: read=manager+, write=admin+."""

    required_module = 'accounting'
    queryset = Payslip.objects.select_related('staff')
    serializer_class = PayslipSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]

    def get_queryset(self):
        self.ensure_tenant()
        return Payslip.objects.filter(tenant=self.tenant).select_related('staff').order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save(tenant=self.tenant, created_by=self.request.user)


class InvoiceViewSet(TenantMixin, viewsets.ModelViewSet):
    """
    Invoice CRUD + generate actions.

    POST /api/v1/accounting/invoices/generate/            — create and immediately issue
    POST /api/v1/accounting/invoices/generate-from-ticket/ — build from ticket products
    POST /api/v1/accounting/invoices/<id>/mark-paid/      — mark invoice as paid
    Supports ?status=draft|issued|paid|void filtering.

    Permissions: read=manager+, write=admin+.
    """

    queryset = Invoice.objects.select_related('customer', 'ticket', 'project')
    serializer_class = InvoiceSerializer
    required_module = 'accounting'

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]

    def get_queryset(self):
        self.ensure_tenant()
        qs = Invoice.objects.filter(tenant=self.tenant).select_related(
            'customer', 'ticket', 'project', 'created_by'
        ).order_by('-created_at')
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs

    def perform_create(self, serializer):
        self._apply_vat_and_totals(serializer)

    def _apply_vat_and_totals(self, serializer, *, issue=False):
        """Compute subtotal, VAT, and total then save."""
        tenant = self.tenant
        line_items = serializer.validated_data.get('line_items', [])
        discount = serializer.validated_data.get('discount', Decimal('0'))

        subtotal = sum(
            Decimal(str(item.get('unit_price', 0))) * int(item.get('qty', 1))
            - Decimal(str(item.get('discount', 0)))
            for item in line_items
        )
        subtotal = max(subtotal - discount, Decimal('0'))

        vat_rate = tenant.vat_rate if tenant and tenant.vat_enabled else Decimal('0')
        vat_amount = (subtotal * vat_rate).quantize(Decimal('0.01'))
        total = subtotal + vat_amount

        extra = {'status': Invoice.STATUS_ISSUED} if issue else {}
        serializer.save(
            tenant=tenant,
            created_by=self.request.user,
            subtotal=subtotal,
            vat_rate=vat_rate,
            vat_amount=vat_amount,
            total=total,
            **extra,
        )

    @action(detail=False, methods=['post'], url_path='generate')
    def generate(self, request):
        """Shorthand: create and immediately issue an invoice."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self._apply_vat_and_totals(serializer, issue=True)
        return Response(InvoiceSerializer(serializer.instance).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='generate-from-ticket')
    def generate_from_ticket(self, request):
        """
        Build an invoice automatically from a ticket's products.

        Required body field: ticket (int)
        Optional: due_date, notes
        """
        from tickets.models import Ticket, TicketProduct

        ticket_id = request.data.get('ticket')
        if not ticket_id:
            return Response({'detail': 'ticket field is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            ticket = Ticket.objects.get(pk=ticket_id, tenant=self.tenant)
        except Ticket.DoesNotExist:
            return Response({'detail': 'Ticket not found.'}, status=status.HTTP_404_NOT_FOUND)

        ticket_products = TicketProduct.objects.filter(ticket=ticket).select_related('product')
        if not ticket_products.exists():
            return Response({'detail': 'Ticket has no products. Add products first.'}, status=status.HTTP_400_BAD_REQUEST)

        line_items = [
            {
                'product_id': tp.product_id,
                'name': tp.product.name,
                'qty': tp.quantity,
                'unit_price': str(tp.unit_price),
                'discount': str(tp.discount),
            }
            for tp in ticket_products
        ]

        data = {
            'customer': ticket.customer_id,
            'ticket': ticket.pk,
            'line_items': line_items,
            'discount': '0',
            'notes': request.data.get('notes', f'Auto-generated from Ticket #{ticket.pk}'),
            'due_date': request.data.get('due_date'),
        }

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self._apply_vat_and_totals(serializer, issue=True)
        return Response(InvoiceSerializer(serializer.instance).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='mark-paid')
    def mark_paid(self, request, pk=None):
        """Mark an issued invoice as paid."""
        from django.utils import timezone
        invoice = self.get_object()
        if invoice.status not in (Invoice.STATUS_ISSUED, Invoice.STATUS_DRAFT):
            return Response(
                {'detail': 'Only draft or issued invoices can be marked as paid.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        invoice.status = Invoice.STATUS_PAID
        invoice.paid_at = timezone.now()
        invoice.save(update_fields=['status', 'paid_at'])
        return Response(InvoiceSerializer(invoice).data)

    @action(detail=True, methods=['post'], url_path='void')
    def void_invoice(self, request, pk=None):
        """Void an invoice."""
        invoice = self.get_object()
        if invoice.status == Invoice.STATUS_VOID:
            return Response({'detail': 'Already voided.'}, status=status.HTTP_400_BAD_REQUEST)
        invoice.status = Invoice.STATUS_VOID
        invoice.save(update_fields=['status'])
        return Response(InvoiceSerializer(invoice).data)

