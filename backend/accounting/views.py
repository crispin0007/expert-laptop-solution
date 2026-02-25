"""
accounting/views.py — Full accounting module viewsets.
"""
from decimal import Decimal
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django.http import HttpResponse
from core.mixins import TenantMixin
from core.permissions import (
    make_role_permission, ALL_ROLES, STAFF_ROLES, MANAGER_ROLES, ADMIN_ROLES,
)
from .models import (
    CoinTransaction, Payslip, Invoice,
    Account, JournalEntry, BankAccount,
    Bill, Payment, CreditNote,
)
from .serializers import (
    CoinTransactionSerializer, PayslipSerializer, InvoiceSerializer,
    AccountSerializer, JournalEntrySerializer, JournalEntryWriteSerializer,
    BankAccountSerializer, BillSerializer, PaymentSerializer, CreditNoteSerializer,
)


# ─────────────────────────────────────────────────────────────────────────────
# Chart of Accounts
# ─────────────────────────────────────────────────────────────────────────────

class AccountViewSet(TenantMixin, viewsets.ModelViewSet):
    """CRUD for Chart of Accounts. GET /accounts/trial-balance/ for trial balance."""

    queryset         = Account.objects.all()
    serializer_class = AccountSerializer
    required_module  = 'accounting'

    def get_permissions(self):
        if self.action in ('list', 'retrieve', 'trial_balance'):
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]

    def get_queryset(self):
        self.ensure_tenant()
        qs = Account.objects.filter(tenant=self.tenant).select_related('parent').order_by('code')
        if acct_type := self.request.query_params.get('type'):
            qs = qs.filter(type=acct_type)
        return qs

    def destroy(self, request, *args, **kwargs):
        account = self.get_object()
        if account.is_system:
            return Response({'detail': 'System accounts cannot be deleted.'}, status=400)
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['get'], url_path='trial-balance')
    def trial_balance(self, request):
        from .services.report_service import trial_balance as tb
        from datetime import date
        df_raw = request.query_params.get('date_from', str(date.today().replace(day=1)))
        dt_raw = request.query_params.get('date_to', str(date.today()))
        try:
            df = date.fromisoformat(df_raw)
            dt = date.fromisoformat(dt_raw)
        except ValueError as e:
            return Response({'detail': str(e)}, status=400)
        self.ensure_tenant()
        return Response(tb(self.tenant, df, dt))


# ─────────────────────────────────────────────────────────────────────────────
# Bank Accounts
# ─────────────────────────────────────────────────────────────────────────────

class BankAccountViewSet(TenantMixin, viewsets.ModelViewSet):
    """Bank account CRUD. read=manager+, write=admin+."""

    queryset         = BankAccount.objects.all()
    serializer_class = BankAccountSerializer
    required_module  = 'accounting'

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]

    def get_queryset(self):
        self.ensure_tenant()
        return BankAccount.objects.filter(tenant=self.tenant).select_related('linked_account')


# ─────────────────────────────────────────────────────────────────────────────
# Journal Entries
# ─────────────────────────────────────────────────────────────────────────────

class JournalEntryViewSet(TenantMixin, viewsets.ModelViewSet):
    """
    Journal entries are auto-created by signals on model state changes.
    Manual entries can be created for adjustments.
    Posted entries cannot be edited or deleted.

    POST /journals/{id}/post/  — lock and post a draft entry
    """

    queryset         = JournalEntry.objects.all()
    serializer_class = JournalEntrySerializer
    required_module  = 'accounting'

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]

    def get_serializer_class(self):
        if self.action == 'create':
            return JournalEntryWriteSerializer
        return JournalEntrySerializer

    def get_queryset(self):
        self.ensure_tenant()
        qs = JournalEntry.objects.filter(
            tenant=self.tenant
        ).prefetch_related('lines__account').order_by('-date', '-created_at')
        if ref := self.request.query_params.get('reference_type'):
            qs = qs.filter(reference_type=ref)
        return qs

    def perform_create(self, serializer):
        serializer.save(
            tenant=self.tenant,
            created_by=self.request.user,
            reference_type=JournalEntry.REF_MANUAL,
        )

    def update(self, request, *args, **kwargs):
        if self.get_object().is_posted:
            return Response({'detail': 'Posted entries cannot be edited.'}, status=400)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if self.get_object().is_posted:
            return Response({'detail': 'Posted entries cannot be deleted.'}, status=400)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'], url_path='post')
    def post_entry(self, request, pk=None):
        """POST /journals/{id}/post/ — validate balance and lock the entry."""
        entry = self.get_object()
        if entry.is_posted:
            return Response({'detail': 'Already posted.'}, status=400)
        try:
            entry.post()
        except ValueError as e:
            return Response({'detail': str(e)}, status=400)
        return Response(JournalEntrySerializer(entry).data)


# ─────────────────────────────────────────────────────────────────────────────
# Bills
# ─────────────────────────────────────────────────────────────────────────────

class BillViewSet(TenantMixin, viewsets.ModelViewSet):
    """
    Supplier bills / expenses.
    approve action triggers journal entry via signal.

    POST /bills/{id}/approve/   — approve draft
    POST /bills/{id}/void/      — void
    POST /bills/{id}/mark-paid/ — mark as paid
    """

    queryset         = Bill.objects.all()
    serializer_class = BillSerializer
    required_module  = 'accounting'

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]

    def get_queryset(self):
        self.ensure_tenant()
        qs = Bill.objects.filter(tenant=self.tenant).select_related('supplier')
        if s := self.request.query_params.get('status'):
            qs = qs.filter(status=s)
        return qs.order_by('-created_at')

    def _compute_and_save(self, serializer):
        from .services.invoice_service import compute_invoice_totals
        t = self.tenant
        line_items = serializer.validated_data.get('line_items', [])
        discount   = serializer.validated_data.get('discount', Decimal('0'))
        vat_rate   = t.vat_rate if t.vat_enabled else Decimal('0')
        subtotal, vat_amount, total = compute_invoice_totals(line_items, discount, vat_rate)
        serializer.save(
            tenant=t, created_by=self.request.user,
            subtotal=subtotal, vat_rate=vat_rate, vat_amount=vat_amount, total=total,
        )

    def perform_create(self, serializer):
        self._compute_and_save(serializer)

    def perform_update(self, serializer):
        bill = self.get_object()
        if bill.status != Bill.STATUS_DRAFT:
            raise Exception('Only draft bills can be edited.')
        self._compute_and_save(serializer)

    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        bill = self.get_object()
        if bill.status != Bill.STATUS_DRAFT:
            return Response({'detail': 'Only draft bills can be approved.'}, status=400)
        bill.status = Bill.STATUS_APPROVED
        bill.approved_at = timezone.now()
        bill.save(update_fields=['status', 'approved_at'])
        return Response(BillSerializer(bill).data)

    @action(detail=True, methods=['post'], url_path='void')
    def void(self, request, pk=None):
        bill = self.get_object()
        if bill.status == Bill.STATUS_VOID:
            return Response({'detail': 'Already voided.'}, status=400)
        bill.status = Bill.STATUS_VOID
        bill.save(update_fields=['status'])
        return Response(BillSerializer(bill).data)

    @action(detail=True, methods=['post'], url_path='mark-paid')
    def mark_paid(self, request, pk=None):
        bill = self.get_object()
        if bill.status != Bill.STATUS_APPROVED:
            return Response({'detail': 'Only approved bills can be marked as paid.'}, status=400)
        bill.status = Bill.STATUS_PAID
        bill.paid_at = timezone.now()
        bill.save(update_fields=['status', 'paid_at'])
        return Response(BillSerializer(bill).data)


# ─────────────────────────────────────────────────────────────────────────────
# Payments
# ─────────────────────────────────────────────────────────────────────────────

class PaymentViewSet(TenantMixin, viewsets.ModelViewSet):
    """
    Payments are immutable once created — no edit or delete.
    Journal entry auto-created by signal on post_save.
    """

    queryset         = Payment.objects.all()
    serializer_class = PaymentSerializer
    required_module  = 'accounting'

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]

    def get_queryset(self):
        self.ensure_tenant()
        qs = Payment.objects.filter(tenant=self.tenant).select_related(
            'invoice', 'bill', 'bank_account',
        )
        if t := self.request.query_params.get('type'):
            qs = qs.filter(type=t)
        if inv := self.request.query_params.get('invoice'):
            qs = qs.filter(invoice_id=inv)
        if bill := self.request.query_params.get('bill'):
            qs = qs.filter(bill_id=bill)
        return qs.order_by('-date', '-created_at')

    def perform_create(self, serializer):
        from .services.payment_service import record_payment
        v = serializer.validated_data
        payment = record_payment(
            tenant=self.tenant,
            created_by=self.request.user,
            payment_type=v['type'],
            method=v.get('method', Payment.METHOD_CASH),
            amount=v['amount'],
            date=v.get('date', timezone.localdate()),
            invoice=v.get('invoice'),
            bill=v.get('bill'),
            bank_account=v.get('bank_account'),
            reference=v.get('reference', ''),
            notes=v.get('notes', ''),
        )
        serializer.instance = payment

    def update(self, request, *args, **kwargs):
        return Response({'detail': 'Payments cannot be edited.'}, status=400)

    def destroy(self, request, *args, **kwargs):
        return Response({'detail': 'Payments cannot be deleted.'}, status=400)


# ─────────────────────────────────────────────────────────────────────────────
# Credit Notes
# ─────────────────────────────────────────────────────────────────────────────

class CreditNoteViewSet(TenantMixin, viewsets.ModelViewSet):
    """
    POST /credit-notes/{id}/issue/    — issue a draft credit note
    POST /credit-notes/{id}/apply/    — apply to an invoice (body: {invoice: id})
    POST /credit-notes/{id}/void/     — void
    """

    queryset         = CreditNote.objects.all()
    serializer_class = CreditNoteSerializer
    required_module  = 'accounting'

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]

    def get_queryset(self):
        self.ensure_tenant()
        return CreditNote.objects.filter(
            tenant=self.tenant
        ).select_related('invoice', 'applied_to').order_by('-created_at')

    def perform_create(self, serializer):
        from .services.invoice_service import compute_invoice_totals
        line_items = serializer.validated_data.get('line_items', [])
        vat_rate   = self.tenant.vat_rate if self.tenant.vat_enabled else Decimal('0')
        subtotal, vat_amount, total = compute_invoice_totals(line_items, Decimal('0'), vat_rate)
        serializer.save(
            tenant=self.tenant, created_by=self.request.user,
            subtotal=subtotal, vat_amount=vat_amount, total=total,
        )

    @action(detail=True, methods=['post'], url_path='issue')
    def issue(self, request, pk=None):
        cn = self.get_object()
        if cn.status != CreditNote.STATUS_DRAFT:
            return Response({'detail': 'Only draft credit notes can be issued.'}, status=400)
        cn.status = CreditNote.STATUS_ISSUED
        cn.issued_at = timezone.now()
        cn.save(update_fields=['status', 'issued_at'])
        return Response(CreditNoteSerializer(cn).data)

    @action(detail=True, methods=['post'], url_path='apply')
    def apply_to_invoice(self, request, pk=None):
        cn = self.get_object()
        invoice_id = request.data.get('invoice')
        if not invoice_id:
            return Response({'detail': 'invoice field is required.'}, status=400)
        try:
            target = Invoice.objects.get(pk=invoice_id, tenant=self.tenant)
        except Invoice.DoesNotExist:
            return Response({'detail': 'Invoice not found.'}, status=404)
        from .services.invoice_service import apply_credit_note
        try:
            apply_credit_note(cn, target, created_by=request.user)
        except ValueError as e:
            return Response({'detail': str(e)}, status=400)
        return Response(CreditNoteSerializer(cn).data)

    @action(detail=True, methods=['post'], url_path='void')
    def void(self, request, pk=None):
        cn = self.get_object()
        if cn.status == CreditNote.STATUS_VOID:
            return Response({'detail': 'Already voided.'}, status=400)
        cn.status = CreditNote.STATUS_VOID
        cn.save(update_fields=['status'])
        return Response(CreditNoteSerializer(cn).data)


# ─────────────────────────────────────────────────────────────────────────────
# Reports  (read-only ViewSet, no model)
# ─────────────────────────────────────────────────────────────────────────────

class ReportViewSet(TenantMixin, viewsets.ViewSet):
    """
    GET /reports/profit-loss/?date_from=&date_to=
    GET /reports/balance-sheet/?as_of_date=
    GET /reports/trial-balance/?date_from=&date_to=
    GET /reports/aged-receivables/?as_of_date=
    GET /reports/aged-payables/?as_of_date=
    GET /reports/vat-report/?period_start=&period_end=
    GET /reports/cash-flow/?date_from=&date_to=
    """

    required_module = 'accounting'

    def get_permissions(self):
        return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES)()]

    def _parse_dates(self, request, *names):
        from datetime import date
        result = []
        for name in names:
            raw = request.query_params.get(name, str(date.today()))
            result.append(date.fromisoformat(raw))
        return result

    @action(detail=False, methods=['get'], url_path='profit-loss')
    def profit_loss(self, request):
        from .services.report_service import profit_and_loss
        self.ensure_tenant()
        try:
            df, dt = self._parse_dates(request, 'date_from', 'date_to')
        except ValueError as e:
            return Response({'detail': str(e)}, status=400)
        return Response(profit_and_loss(self.tenant, df, dt))

    @action(detail=False, methods=['get'], url_path='balance-sheet')
    def balance_sheet(self, request):
        from .services.report_service import balance_sheet
        self.ensure_tenant()
        try:
            (as_of,) = self._parse_dates(request, 'as_of_date')
        except ValueError as e:
            return Response({'detail': str(e)}, status=400)
        return Response(balance_sheet(self.tenant, as_of))

    @action(detail=False, methods=['get'], url_path='trial-balance')
    def trial_balance(self, request):
        from .services.report_service import trial_balance
        self.ensure_tenant()
        try:
            df, dt = self._parse_dates(request, 'date_from', 'date_to')
        except ValueError as e:
            return Response({'detail': str(e)}, status=400)
        return Response(trial_balance(self.tenant, df, dt))

    @action(detail=False, methods=['get'], url_path='aged-receivables')
    def aged_receivables(self, request):
        from .services.report_service import aged_receivables
        self.ensure_tenant()
        try:
            (as_of,) = self._parse_dates(request, 'as_of_date')
        except ValueError as e:
            return Response({'detail': str(e)}, status=400)
        return Response(aged_receivables(self.tenant, as_of))

    @action(detail=False, methods=['get'], url_path='aged-payables')
    def aged_payables(self, request):
        from .services.report_service import aged_payables
        self.ensure_tenant()
        try:
            (as_of,) = self._parse_dates(request, 'as_of_date')
        except ValueError as e:
            return Response({'detail': str(e)}, status=400)
        return Response(aged_payables(self.tenant, as_of))

    @action(detail=False, methods=['get'], url_path='vat-report')
    def vat_report(self, request):
        from .services.report_service import vat_report
        self.ensure_tenant()
        try:
            ps, pe = self._parse_dates(request, 'period_start', 'period_end')
        except ValueError as e:
            return Response({'detail': str(e)}, status=400)
        return Response(vat_report(self.tenant, ps, pe))

    @action(detail=False, methods=['get'], url_path='cash-flow')
    def cash_flow(self, request):
        from .services.report_service import cash_flow
        self.ensure_tenant()
        try:
            df, dt = self._parse_dates(request, 'date_from', 'date_to')
        except ValueError as e:
            return Response({'detail': str(e)}, status=400)
        return Response(cash_flow(self.tenant, df, dt))


# ─────────────────────────────────────────────────────────────────────────────
# Coins
# ─────────────────────────────────────────────────────────────────────────────

class CoinTransactionViewSet(TenantMixin, viewsets.ModelViewSet):
    """
    ?status=pending|approved|rejected  ?staff=<id>
    POST /coins/{id}/approve/  POST /coins/{id}/reject/
    GET  /coins/pending/        POST /coins/award/
    GET  /coins/staff/{staff_id}/
    """

    queryset         = CoinTransaction.objects.select_related('staff', 'approved_by')
    serializer_class = CoinTransactionSerializer
    required_module  = 'accounting'

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES)()]
        if self.action in ('approve', 'reject', 'pending', 'award', 'staff_history'):
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES)()]
        if self.action == 'destroy':
            return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*STAFF_ROLES)()]

    def get_queryset(self):
        self.ensure_tenant()
        qs = CoinTransaction.objects.filter(tenant=self.tenant).select_related('staff', 'approved_by')
        if s := self.request.query_params.get('status'):
            qs = qs.filter(status=s)
        if staff_id := self.request.query_params.get('staff'):
            qs = qs.filter(staff_id=staff_id)
        elif not self.is_manager_role():
            qs = qs.filter(staff=self.request.user)
        return qs.order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save(tenant=self.tenant, created_by=self.request.user)

    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        ct = self.get_object()
        if ct.status != CoinTransaction.STATUS_PENDING:
            return Response({'detail': 'Only pending transactions can be approved.'}, status=400)
        ct.status = CoinTransaction.STATUS_APPROVED
        ct.approved_by = request.user
        ct.save(update_fields=['status', 'approved_by'])
        return Response(CoinTransactionSerializer(ct).data)

    @action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request, pk=None):
        ct = self.get_object()
        if ct.status != CoinTransaction.STATUS_PENDING:
            return Response({'detail': 'Only pending transactions can be rejected.'}, status=400)
        ct.status = CoinTransaction.STATUS_REJECTED
        ct.approved_by = request.user
        ct.note = request.data.get('note', ct.note)
        ct.save(update_fields=['status', 'approved_by', 'note'])
        return Response(CoinTransactionSerializer(ct).data)

    @action(detail=False, methods=['get'], url_path='pending')
    def pending(self, request):
        self.ensure_tenant()
        qs = CoinTransaction.objects.filter(
            tenant=self.tenant, status=CoinTransaction.STATUS_PENDING,
        ).select_related('staff', 'approved_by').order_by('-created_at')
        return Response(CoinTransactionSerializer(qs, many=True).data)

    @action(detail=False, methods=['post'], url_path='award')
    def award(self, request):
        self.ensure_tenant()
        from django.contrib.auth import get_user_model
        User = get_user_model()
        staff_id = request.data.get('staff')
        raw = request.data.get('amount')
        if not staff_id or raw is None:
            return Response({'detail': 'staff and amount are required.'}, status=400)
        try:
            amount = Decimal(str(raw))
            if amount <= 0:
                raise ValueError
        except (ValueError, TypeError):
            return Response({'detail': 'amount must be a positive number.'}, status=400)
        try:
            staff = User.objects.get(pk=staff_id)
        except User.DoesNotExist:
            return Response({'detail': 'Staff not found.'}, status=404)
        source_type = request.data.get('source_type', CoinTransaction.SOURCE_MANUAL)
        if source_type not in dict(CoinTransaction.SOURCE_TYPES):
            source_type = CoinTransaction.SOURCE_MANUAL
        ct = CoinTransaction.objects.create(
            tenant=self.tenant, created_by=request.user,
            staff=staff, amount=amount, source_type=source_type,
            source_id=request.data.get('source_id'),
            status=CoinTransaction.STATUS_APPROVED, approved_by=request.user,
            note=request.data.get('note', ''),
        )
        return Response(CoinTransactionSerializer(ct).data, status=201)

    @action(detail=False, methods=['get'], url_path=r'staff/(?P<staff_id>[^/.]+)')
    def staff_history(self, request, staff_id=None):
        self.ensure_tenant()
        from django.db.models import Sum
        qs = CoinTransaction.objects.filter(
            tenant=self.tenant, staff_id=staff_id,
        ).select_related('staff', 'approved_by').order_by('-created_at')
        approved = qs.filter(status=CoinTransaction.STATUS_APPROVED).aggregate(t=Sum('amount'))['t'] or Decimal('0')
        pending  = qs.filter(status=CoinTransaction.STATUS_PENDING).aggregate(t=Sum('amount'))['t']  or Decimal('0')
        rate = self.tenant.coin_to_money_rate if self.tenant else Decimal('1')
        return Response({
            'staff_id': staff_id, 'coin_rate': str(rate),
            'total_approved_coins': str(approved),
            'total_approved_value': str((approved * rate).quantize(Decimal('0.01'))),
            'total_pending_coins': str(pending),
            'transactions': CoinTransactionSerializer(qs, many=True).data,
        })


# ─────────────────────────────────────────────────────────────────────────────
# Payslips
# ─────────────────────────────────────────────────────────────────────────────

class PayslipViewSet(TenantMixin, viewsets.ModelViewSet):
    """
    POST /payslips/generate/         auto-generate from approved coins
    POST /payslips/{id}/issue/        mark as issued
    POST /payslips/{id}/mark-paid/    mark as paid (triggers journal entry via signal)
    """

    required_module  = 'accounting'
    queryset         = Payslip.objects.select_related('staff')
    serializer_class = PayslipSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]

    def get_queryset(self):
        self.ensure_tenant()
        qs = Payslip.objects.filter(tenant=self.tenant).select_related('staff')
        if staff := self.request.query_params.get('staff'):
            qs = qs.filter(staff_id=staff)
        return qs.order_by('-period_end')

    def perform_create(self, serializer):
        serializer.save(tenant=self.tenant, created_by=self.request.user)

    @action(detail=False, methods=['post'], url_path='generate')
    def generate(self, request):
        """Aggregate approved coins into a payslip for a staff member."""
        from django.contrib.auth import get_user_model
        from django.db.models import Sum
        from datetime import date as dt
        User = get_user_model()
        self.ensure_tenant()
        staff_id     = request.data.get('staff')
        period_start = request.data.get('period_start')
        period_end   = request.data.get('period_end')
        if not all([staff_id, period_start, period_end]):
            return Response({'detail': 'staff, period_start, period_end required.'}, status=400)
        try:
            staff = User.objects.get(pk=staff_id)
        except User.DoesNotExist:
            return Response({'detail': 'Staff not found.'}, status=404)
        try:
            ps = dt.fromisoformat(period_start)
            pe = dt.fromisoformat(period_end)
        except ValueError:
            return Response({'detail': 'Invalid date format. Use YYYY-MM-DD.'}, status=400)
        coins = CoinTransaction.objects.filter(
            tenant=self.tenant, staff=staff, status=CoinTransaction.STATUS_APPROVED,
            created_at__date__gte=ps, created_at__date__lte=pe,
        ).aggregate(t=Sum('amount'))['t'] or Decimal('0')
        rate  = self.tenant.coin_to_money_rate or Decimal('1')
        gross = (coins * rate).quantize(Decimal('0.01'))
        base  = Decimal(str(request.data.get('base_salary', 0)))
        bonus = Decimal(str(request.data.get('bonus', 0)))
        deducs = Decimal(str(request.data.get('deductions', 0)))
        net   = base + bonus + gross - deducs
        payslip, created = Payslip.objects.get_or_create(
            tenant=self.tenant, staff=staff, period_start=ps, period_end=pe,
            defaults={
                'total_coins': coins, 'coin_to_money_rate': rate, 'gross_amount': gross,
                'base_salary': base, 'bonus': bonus, 'deductions': deducs, 'net_pay': net,
                'created_by': request.user,
            },
        )
        if not created:
            payslip.total_coins = coins
            payslip.coin_to_money_rate = rate
            payslip.gross_amount = gross
            payslip.base_salary = base
            payslip.bonus = bonus
            payslip.deductions = deducs
            payslip.net_pay = net
            payslip.save()
        return Response(PayslipSerializer(payslip).data, status=201 if created else 200)

    @action(detail=True, methods=['post'], url_path='issue')
    def issue(self, request, pk=None):
        p = self.get_object()
        if p.status != Payslip.STATUS_DRAFT:
            return Response({'detail': 'Only draft payslips can be issued.'}, status=400)
        p.status = Payslip.STATUS_ISSUED
        p.issued_at = timezone.now()
        p.save(update_fields=['status', 'issued_at'])
        return Response(PayslipSerializer(p).data)

    @action(detail=True, methods=['post'], url_path='mark-paid')
    def mark_paid(self, request, pk=None):
        p = self.get_object()
        if p.status != Payslip.STATUS_ISSUED:
            return Response({'detail': 'Only issued payslips can be marked as paid.'}, status=400)
        p.status = Payslip.STATUS_PAID
        p.paid_at = timezone.now()
        p.save(update_fields=['status', 'paid_at'])
        return Response(PayslipSerializer(p).data)


# ─────────────────────────────────────────────────────────────────────────────
# Invoices  (enhanced)
# ─────────────────────────────────────────────────────────────────────────────

class InvoiceViewSet(TenantMixin, viewsets.ModelViewSet):
    """
    POST /invoices/generate/                  create + immediately issue
    POST /invoices/generate-from-ticket/      build from ticket products
    POST /invoices/{id}/mark-paid/            mark paid
    POST /invoices/{id}/void/                 void
    GET  /invoices/{id}/pdf/                  download PDF
    POST /invoices/{id}/send/                 email PDF to customer
    """

    queryset         = Invoice.objects.select_related('customer', 'ticket', 'project')
    serializer_class = InvoiceSerializer
    required_module  = 'accounting'

    def get_permissions(self):
        if self.action in ('list', 'retrieve', 'pdf'):
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]

    def get_queryset(self):
        self.ensure_tenant()
        qs = Invoice.objects.filter(tenant=self.tenant).select_related(
            'customer', 'ticket', 'project', 'created_by',
        ).prefetch_related('payments').order_by('-created_at')
        if s := self.request.query_params.get('status'):
            qs = qs.filter(status=s)
        if c := self.request.query_params.get('customer'):
            qs = qs.filter(customer_id=c)
        return qs

    def _apply_vat_and_totals(self, serializer, *, issue=False):
        from .services.invoice_service import compute_invoice_totals
        t = self.tenant
        line_items = serializer.validated_data.get('line_items', [])
        discount   = serializer.validated_data.get('discount', Decimal('0'))
        vat_rate   = t.vat_rate if t and t.vat_enabled else Decimal('0')
        subtotal, vat_amount, total = compute_invoice_totals(line_items, discount, vat_rate)
        extra = {'status': Invoice.STATUS_ISSUED} if issue else {}
        serializer.save(
            tenant=t, created_by=self.request.user,
            subtotal=subtotal, vat_rate=vat_rate, vat_amount=vat_amount, total=total,
            **extra,
        )

    def perform_create(self, serializer):
        self._apply_vat_and_totals(serializer)

    @action(detail=False, methods=['post'], url_path='generate')
    def generate(self, request):
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        self._apply_vat_and_totals(s, issue=True)
        return Response(InvoiceSerializer(s.instance).data, status=201)

    @action(detail=False, methods=['post'], url_path='generate-from-ticket')
    def generate_from_ticket(self, request):
        from .services.invoice_service import generate_from_ticket as _gen
        from tickets.models import Ticket
        ticket_id = request.data.get('ticket')
        if not ticket_id:
            return Response({'detail': 'ticket field is required.'}, status=400)
        try:
            ticket = Ticket.objects.get(pk=ticket_id, tenant=self.tenant)
        except Ticket.DoesNotExist:
            return Response({'detail': 'Ticket not found.'}, status=404)
        try:
            invoice = _gen(
                ticket, self.tenant,
                due_date=request.data.get('due_date'),
                notes=request.data.get('notes', ''),
                created_by=request.user,
            )
        except ValueError as e:
            return Response({'detail': str(e)}, status=400)
        return Response(InvoiceSerializer(invoice).data, status=201)

    @action(detail=True, methods=['post'], url_path='mark-paid')
    def mark_paid(self, request, pk=None):
        inv = self.get_object()
        if inv.status not in (Invoice.STATUS_ISSUED, Invoice.STATUS_DRAFT):
            return Response({'detail': 'Only draft or issued invoices can be marked as paid.'}, status=400)
        inv.status = Invoice.STATUS_PAID
        inv.paid_at = timezone.now()
        inv.save(update_fields=['status', 'paid_at'])
        return Response(InvoiceSerializer(inv).data)

    @action(detail=True, methods=['post'], url_path='void')
    def void_invoice(self, request, pk=None):
        inv = self.get_object()
        if inv.status == Invoice.STATUS_VOID:
            return Response({'detail': 'Already voided.'}, status=400)
        inv.status = Invoice.STATUS_VOID
        inv.save(update_fields=['status'])
        return Response(InvoiceSerializer(inv).data)

    @action(detail=True, methods=['get'], url_path='pdf')
    def pdf(self, request, pk=None):
        """Download invoice as PDF."""
        inv = self.get_object()
        from .services.invoice_service import generate_pdf_bytes
        pdf_bytes = generate_pdf_bytes(inv)
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = (
            f'attachment; filename="Invoice-{inv.invoice_number}.pdf"'
        )
        return response

    @action(detail=True, methods=['post'], url_path='send')
    def send_invoice(self, request, pk=None):
        """Email PDF invoice to customer."""
        inv = self.get_object()
        if not inv.customer or not inv.customer.email:
            return Response({'detail': 'Customer has no email address.'}, status=400)
        try:
            from notifications.service import send_invoice_email
            send_invoice_email(inv)
        except Exception as e:
            return Response({'detail': f'Email failed: {e}'}, status=500)
        return Response({'detail': 'Invoice sent successfully.'})
