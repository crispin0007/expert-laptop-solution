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
    Quotation, DebitNote, TDSEntry,
    BankReconciliation, BankReconciliationLine, RecurringJournal,
    StaffSalaryProfile,
)
from .serializers import (
    CoinTransactionSerializer, PayslipSerializer, InvoiceSerializer,
    AccountSerializer, JournalEntrySerializer, JournalEntryWriteSerializer,
    BankAccountSerializer, BillSerializer, PaymentSerializer, CreditNoteSerializer,
    QuotationSerializer, DebitNoteSerializer, TDSEntrySerializer,
    BankReconciliationSerializer, BankReconciliationLineSerializer,
    RecurringJournalSerializer,
    StaffSalaryProfileSerializer,
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

    def paginate_queryset(self, queryset):
        """Allow callers to bypass pagination with ?no_page=1.
        Used by the Create Account modal which must show the full CoA tree."""
        if self.request.query_params.get('no_page'):
            return None
        return super().paginate_queryset(queryset)

    def destroy(self, request, *args, **kwargs):
        account = self.get_object()
        if account.is_system:
            return Response({'detail': 'System accounts cannot be deleted.'}, status=400)
        if account.children.exists():
            return Response(
                {'detail': 'This account has sub-accounts. Delete or re-parent them first.'},
                status=400,
            )
        if account.journal_lines.filter(entry__is_posted=True).exists():
            return Response(
                {'detail': 'This account has posted journal entries and cannot be deleted.'},
                status=400,
            )
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
        if self.action in ('create', 'update', 'partial_update'):
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

    def create(self, request, *args, **kwargs):
        """Return the full read serializer (with id) after creating a journal entry."""
        write_serializer = JournalEntryWriteSerializer(
            data=request.data,
            context=self.get_serializer_context(),
        )
        write_serializer.is_valid(raise_exception=True)
        entry = write_serializer.save(
            tenant=self.tenant,
            created_by=self.request.user,
            reference_type=JournalEntry.REF_MANUAL,
        )
        return Response(JournalEntrySerializer(entry).data, status=status.HTTP_201_CREATED)

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
        # Staff and managers can edit draft bills; only admins can delete or perform other write actions
        if self.action in ('update', 'partial_update'):
            return [permissions.IsAuthenticated(), make_role_permission(*STAFF_ROLES)()]
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
        existing   = serializer.instance
        line_items = serializer.validated_data.get(
            'line_items',
            existing.line_items if existing else [],
        )
        discount = serializer.validated_data.get(
            'discount',
            existing.discount if existing else Decimal('0'),
        )
        vat_rate   = t.vat_rate if t.vat_enabled else Decimal('0')
        subtotal, vat_amount, total = compute_invoice_totals(line_items, discount, vat_rate)
        serializer.save(
            tenant=t, created_by=self.request.user,
            subtotal=subtotal, vat_rate=vat_rate, vat_amount=vat_amount, total=total,
        )

    def perform_create(self, serializer):
        self._compute_and_save(serializer)

    def perform_update(self, serializer):
        """Staff may only edit draft bills; admins may force-edit any status."""
        if serializer.instance.status != Bill.STATUS_DRAFT and not self._is_admin():
            from rest_framework.exceptions import ValidationError
            raise ValidationError(
                'Only draft bills can be edited. Ask an admin to override.'
            )
        self._compute_and_save(serializer)

    def destroy(self, request, *args, **kwargs):
        """Admin-only. Admins can delete any bill; warning is shown in UI."""
        return super().destroy(request, *args, **kwargs)

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
        # BLOCK: paid bills already have AP-clearing payment journals posted.
        # Voiding without reversing payments would leave AP debited with no matching credit.
        if bill.status == Bill.STATUS_PAID:
            return Response(
                {'detail': 'Paid bills cannot be voided. Create a debit note or reverse the payment instead.'},
                status=400,
            )
        bill.status = Bill.STATUS_VOID
        bill.save(update_fields=['status'])
        return Response(BillSerializer(bill).data)

    @action(detail=True, methods=['post'], url_path='mark-paid')
    def mark_paid(self, request, pk=None):
        """
        Mark a bill as paid.
        Creates an outgoing Payment record for the remaining amount so the journal
        (Dr AP / Cr Cash/Bank) is auto-created by the Payment signal.
        Body: { "method": "cash" | "bank_transfer" | "cheque" | ..., "bank_account": <id> }
        bank_account is required when method != cash.
        """
        bill = self.get_object()
        if bill.status != Bill.STATUS_APPROVED:
            return Response({'detail': 'Only approved bills can be marked as paid.'}, status=400)

        method = request.data.get('method', Payment.METHOD_CASH)
        if method not in dict(Payment.METHOD_CHOICES):
            method = Payment.METHOD_CASH

        bank_account = None
        bank_account_id = request.data.get('bank_account')
        if bank_account_id:
            try:
                bank_account = BankAccount.objects.get(pk=bank_account_id, tenant=self.tenant)
            except BankAccount.DoesNotExist:
                return Response({'detail': 'Bank account not found.'}, status=404)

        if method != Payment.METHOD_CASH and not bank_account:
            return Response({'detail': 'bank_account is required for non-cash payment methods.'}, status=400)

        from .services.payment_service import record_payment
        amount_due = bill.amount_due
        payment = None
        if amount_due > Decimal('0'):
            payment = record_payment(
                tenant=self.tenant,
                created_by=request.user,
                payment_type=Payment.TYPE_OUTGOING,
                method=method,
                amount=amount_due,
                date=timezone.localdate(),
                bill=bill,
                bank_account=bank_account,
                reference=bill.bill_number,
                notes=f'Bill payment via {method}.',
            )
        else:
            bill.status  = Bill.STATUS_PAID
            bill.paid_at = timezone.now()
            bill.save(update_fields=['status', 'paid_at'])

        bill.refresh_from_db()
        return Response({
            'bill': BillSerializer(bill).data,
            'payment': PaymentSerializer(payment).data if payment else None,
        })


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
        if method := self.request.query_params.get('method'):
            qs = qs.filter(method=method)
        if bank := self.request.query_params.get('bank_account'):
            qs = qs.filter(bank_account_id=bank)
        if inv := self.request.query_params.get('invoice'):
            qs = qs.filter(invoice_id=inv)
        if bill := self.request.query_params.get('bill'):
            qs = qs.filter(bill_id=bill)
        ordering = self.request.query_params.get('ordering', '-date')
        # Whitelist safe orderings
        if ordering in ('date', '-date', 'created_at', '-created_at'):
            qs = qs.order_by(ordering, 'id')
        else:
            qs = qs.order_by('-date', '-created_at')
        return qs

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
        """Admin-only hard delete. Note: linked journal entries are NOT auto-reversed.
        Admin should post a manual reversing journal entry if needed."""
        if not self._is_admin():
            return Response({'detail': 'Only admins can delete payments.'}, status=403)
        return super().destroy(request, *args, **kwargs)


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
        # Staff and managers can edit draft credit notes; only admins can delete or issue/void
        if self.action in ('update', 'partial_update'):
            return [permissions.IsAuthenticated(), make_role_permission(*STAFF_ROLES)()]
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

    def perform_update(self, serializer):
        """Recalculate totals on edit. Only draft credit notes may be edited."""
        cn = serializer.instance
        if cn.status != CreditNote.STATUS_DRAFT:
            from rest_framework.exceptions import ValidationError
            raise ValidationError('Only draft credit notes can be edited.')
        from .services.invoice_service import compute_invoice_totals
        line_items = serializer.validated_data.get('line_items', cn.line_items)
        vat_rate   = self.tenant.vat_rate if self.tenant.vat_enabled else Decimal('0')
        subtotal, vat_amount, total = compute_invoice_totals(line_items, Decimal('0'), vat_rate)
        serializer.save(subtotal=subtotal, vat_amount=vat_amount, total=total)

    def destroy(self, request, *args, **kwargs):
        """Admin-only. Only draft credit notes may be deleted."""
        cn = self.get_object()
        if cn.status != CreditNote.STATUS_DRAFT:
            return Response(
                {'detail': 'Only draft credit notes can be deleted. Void instead.'},
                status=400,
            )
        return super().destroy(request, *args, **kwargs)

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

    @action(detail=False, methods=['get'], url_path='ledger')
    def ledger(self, request):
        """GET ?account_code=1001&date_from=YYYY-MM-DD&date_to=YYYY-MM-DD"""
        from .services.report_service import ledger_report
        self.ensure_tenant()
        account_code = request.query_params.get('account_code', '')
        if not account_code:
            return Response({'detail': 'account_code is required.'}, status=400)
        try:
            df, dt = self._parse_dates(request, 'date_from', 'date_to')
        except ValueError as e:
            return Response({'detail': str(e)}, status=400)
        return Response(ledger_report(self.tenant, account_code, df, dt))

    @action(detail=False, methods=['get'], url_path='day-book')
    def day_book(self, request):
        """GET ?date=YYYY-MM-DD (defaults to today)"""
        from .services.report_service import day_book
        from datetime import date
        self.ensure_tenant()
        raw = request.query_params.get('date', str(date.today()))
        try:
            d = date.fromisoformat(raw)
        except ValueError as e:
            return Response({'detail': str(e)}, status=400)
        return Response(day_book(self.tenant, d))


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
        # Verify the staff member belongs to this tenant
        from accounts.models import TenantMembership
        if not TenantMembership.objects.filter(
            user=staff, tenant=self.tenant, is_active=True
        ).exists():
            return Response({'detail': 'Staff member is not part of this workspace.'}, status=403)
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
# Staff Salary Profiles
# ─────────────────────────────────────────────────────────────────────────────

class StaffSalaryProfileViewSet(TenantMixin, viewsets.ModelViewSet):
    """CRUD for per-staff salary configuration used by auto-generate task and payslip generation."""
    required_module  = 'accounting'
    queryset         = StaffSalaryProfile.objects.all()
    serializer_class = StaffSalaryProfileSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]

    def get_queryset(self):
        self.ensure_tenant()
        return StaffSalaryProfile.objects.filter(
            tenant=self.tenant
        ).select_related('staff').order_by('staff__email')

    def perform_create(self, serializer):
        serializer.save(tenant=self.tenant, created_by=self.request.user)


# ─────────────────────────────────────────────────────────────────────────────
# Payslips
# ─────────────────────────────────────────────────────────────────────────────

class PayslipViewSet(TenantMixin, viewsets.ModelViewSet):
    """
    POST /payslips/generate/         auto-generate from approved coins + salary profile
    POST /payslips/{id}/issue/        mark as issued
    POST /payslips/{id}/mark-paid/    mark as paid, record salary payment in cash flow
    """

    required_module  = 'accounting'
    queryset         = Payslip.objects.select_related('staff', 'bank_account')
    serializer_class = PayslipSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]

    def get_queryset(self):
        self.ensure_tenant()
        qs = Payslip.objects.filter(tenant=self.tenant).select_related('staff', 'bank_account')
        if staff := self.request.query_params.get('staff'):
            qs = qs.filter(staff_id=staff)
        return qs.order_by('-period_end')

    def perform_create(self, serializer):
        serializer.save(tenant=self.tenant, created_by=self.request.user)

    def perform_update(self, serializer):
        """Recompute net_pay after admin edits base_salary/bonus/deductions.

        net_pay = base_salary + bonus + gross_amount(coins) − tds_amount − deductions
        tds_amount is stored separately from deductions (which is 'other deductions'
        like advances / damages).  Omitting tds_amount causes net_pay to be overstated
        by the TDS amount whenever an admin edits a draft payslip.
        """
        from rest_framework.exceptions import ValidationError
        p = serializer.instance
        if p.status != Payslip.STATUS_DRAFT:
            raise ValidationError('Only draft payslips can be edited.')
        p = serializer.save()
        p.net_pay = p.base_salary + p.bonus + p.gross_amount - p.tds_amount - p.deductions
        p.save(update_fields=['net_pay'])

    @action(detail=False, methods=['post'], url_path='generate')
    def generate(self, request):
        """Aggregate approved coins + salary profile into a payslip for a staff member."""
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
        # Verify staff belongs to this tenant
        from accounts.models import TenantMembership
        if not TenantMembership.objects.filter(
            user=staff, tenant=self.tenant, is_active=True
        ).exists():
            return Response({'detail': 'Staff member is not part of this workspace.'}, status=403)
        try:
            ps = dt.fromisoformat(period_start)
            pe = dt.fromisoformat(period_end)
        except ValueError:
            return Response({'detail': 'Invalid date format. Use YYYY-MM-DD.'}, status=400)

        # Auto-load salary profile defaults (request data overrides)
        profile = StaffSalaryProfile.objects.filter(tenant=self.tenant, staff=staff).first()
        profile_base  = profile.base_salary if profile else Decimal('0')
        profile_bonus = profile.bonus_default if profile else Decimal('0')
        profile_tds   = profile.tds_rate if profile else Decimal('0')

        base          = Decimal(str(request.data.get('base_salary', profile_base)))
        bonus         = Decimal(str(request.data.get('bonus', profile_bonus)))
        tds_rate_dec  = Decimal(str(request.data.get('tds_rate', profile_tds))).quantize(Decimal('0.0001'))
        employee_pan  = request.data.get('employee_pan', '')
        other_deductions = Decimal(str(request.data.get('deductions', 0)))

        # Coins earned in period
        coins = CoinTransaction.objects.filter(
            tenant=self.tenant, staff=staff, status=CoinTransaction.STATUS_APPROVED,
            created_at__date__gte=ps, created_at__date__lte=pe,
        ).aggregate(t=Sum('amount'))['t'] or Decimal('0')
        rate  = self.tenant.coin_to_money_rate or Decimal('1')
        gross = (coins * rate).quantize(Decimal('0.01'))

        # TDS on salary (base + bonus only; coins are not subject to salary TDS)
        tds_amount = Decimal('0')
        if tds_rate_dec > 0:
            tds_amount = ((base + bonus) * tds_rate_dec).quantize(Decimal('0.01'))

        total_deductions = tds_amount + other_deductions
        net = base + bonus + gross - total_deductions

        payslip, created = Payslip.objects.get_or_create(
            tenant=self.tenant, staff=staff, period_start=ps, period_end=pe,
            defaults={
                'total_coins': coins, 'coin_to_money_rate': rate, 'gross_amount': gross,
                'base_salary': base, 'bonus': bonus,
                'tds_amount': tds_amount, 'deductions': other_deductions,
                'net_pay': net, 'created_by': request.user,
            },
        )
        if not created:
            payslip.total_coins      = coins
            payslip.coin_to_money_rate = rate
            payslip.gross_amount     = gross
            payslip.base_salary      = base
            payslip.bonus            = bonus
            payslip.tds_amount       = tds_amount
            payslip.deductions       = other_deductions
            payslip.net_pay          = net
            payslip.save()

        # Auto-create TDS entry for this salary so it appears in TDS reports
        if tds_rate_dec > 0 and tds_amount > 0:
            nepali_year   = pe.year + 57 if pe.month >= 4 else pe.year + 56
            staff_display = getattr(staff, 'full_name', '') or staff.email
            TDSEntry.objects.filter(
                tenant=self.tenant,
                supplier_name=staff_display,
                period_month=pe.month,
                period_year=nepali_year,
            ).delete()
            TDSEntry.objects.create(
                tenant=self.tenant,
                supplier_name=staff_display,
                supplier_pan=employee_pan,
                taxable_amount=base + bonus,
                tds_rate=tds_rate_dec,
                period_month=pe.month,
                period_year=nepali_year,
                created_by=request.user,
            )

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
        """Mark payslip as paid and record salary outflow in Payments."""
        p = self.get_object()
        if p.status != Payslip.STATUS_ISSUED:
            return Response({'detail': 'Only issued payslips can be marked as paid.'}, status=400)

        payment_method  = request.data.get('payment_method', 'cash')
        bank_account_id = request.data.get('bank_account')

        VALID_METHODS = ('cash', 'bank_transfer', 'cheque')
        if payment_method not in VALID_METHODS:
            return Response({'detail': f'payment_method must be one of: {VALID_METHODS}'}, status=400)
        if payment_method == 'bank_transfer' and not bank_account_id:
            return Response({'detail': 'bank_account is required for bank transfer.'}, status=400)

        bank_account = None
        if bank_account_id:
            try:
                bank_account = BankAccount.objects.get(pk=bank_account_id, tenant=self.tenant)
            except BankAccount.DoesNotExist:
                return Response({'detail': 'Bank account not found.'}, status=404)

        # Record outgoing payment so it appears in cash / bank statement
        # Skip if net_pay <= 0 (e.g. fully TDS-deducted payslip)
        payment = None
        if p.net_pay > Decimal('0'):
            from .services.payment_service import record_payment
            staff_label = getattr(p.staff, 'full_name', '') or p.staff.email
            period_label = f"{p.period_start}–{p.period_end}"
            payment = record_payment(
                tenant=self.tenant,
                created_by=request.user,
                payment_type='outgoing',
                method=payment_method,
                amount=p.net_pay,
                date=timezone.localdate(),
                bank_account=bank_account,
                reference=f'PAYSLIP-{p.pk}',
                notes=f'Salary payment to {staff_label} for {period_label}',
            )

        p.status         = Payslip.STATUS_PAID
        p.paid_at        = timezone.now()
        p.payment_method = payment_method
        p.bank_account   = bank_account
        p.save(update_fields=['status', 'paid_at', 'payment_method', 'bank_account'])
        return Response({
            'payslip': PayslipSerializer(p).data,
            'payment': PaymentSerializer(payment).data if payment else None,
        })


# ─────────────────────────────────────────────────────────────────────────────
# Invoices  (enhanced)
# ─────────────────────────────────────────────────────────────────────────────

class InvoiceViewSet(TenantMixin, viewsets.ModelViewSet):
    """
    POST /invoices/generate/                  create + immediately issue
    POST /invoices/generate-from-ticket/      build draft from ticket (service + products)
    POST /invoices/{id}/issue/                move draft to issued
    POST /invoices/{id}/mark-paid/            mark paid
    POST /invoices/{id}/void/                 void
    POST /invoices/{id}/collect-payment/      staff records customer payment on-site
    POST /invoices/{id}/finance-review/       finance approve or reject submitted invoice
    GET  /invoices/{id}/pdf/                  download PDF
    POST /invoices/{id}/send/                 email PDF to customer
    """

    queryset         = Invoice.objects.select_related('customer', 'ticket', 'project')
    serializer_class = InvoiceSerializer
    required_module  = 'accounting'

    def get_permissions(self):
        if self.action in ('list', 'retrieve', 'pdf'):
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES)()]
        # Staff can collect payment, generate from ticket, and edit DRAFT invoices
        if self.action in ('collect_payment', 'generate_from_ticket', 'update', 'partial_update'):
            return [permissions.IsAuthenticated(), make_role_permission(*STAFF_ROLES)()]
        # Finance managers (role='manager') must be able to approve/reject submitted
        # invoices — they are the finance reviewers by design.
        if self.action in ('finance_review',):
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES)()]
        # destroy and all other write actions (issue, void…) require admin
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]

    def get_queryset(self):
        self.ensure_tenant()
        qs = Invoice.objects.filter(tenant=self.tenant).select_related(
            'customer', 'ticket', 'project', 'created_by',
        ).prefetch_related('payments').order_by('-created_at')
        if s := self.request.query_params.get('status'):
            qs = qs.filter(status=s)
        if fs := self.request.query_params.get('finance_status'):
            qs = qs.filter(finance_status=fs)
        if c := self.request.query_params.get('customer'):
            qs = qs.filter(customer_id=c)
        if t := self.request.query_params.get('ticket'):
            qs = qs.filter(ticket_id=t)
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

    def perform_update(self, serializer):
        """Recalculate VAT+totals on PATCH/PUT.
        Staff may only edit draft invoices; admins may force-edit any status.
        """
        inv = serializer.instance
        if inv.status != Invoice.STATUS_DRAFT and not self._is_admin():
            from rest_framework.exceptions import ValidationError
            raise ValidationError(
                'Only draft invoices can be edited. Ask an admin to override.'
            )
        from .services.invoice_service import compute_invoice_totals
        t          = self.tenant
        line_items = serializer.validated_data.get('line_items', inv.line_items)
        discount   = serializer.validated_data.get('discount',   inv.discount)
        vat_rate   = t.vat_rate if t and t.vat_enabled else Decimal('0')
        subtotal, vat_amount, total = compute_invoice_totals(line_items, discount, vat_rate)
        serializer.save(subtotal=subtotal, vat_rate=vat_rate, vat_amount=vat_amount, total=total)

    def destroy(self, request, *args, **kwargs):
        """Admin-only. Admins can delete any invoice; warning is shown in UI."""
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'], url_path='issue')
    def issue(self, request, pk=None):
        """POST /invoices/{id}/issue/ — move draft invoice to issued status."""
        inv = self.get_object()
        if inv.status != Invoice.STATUS_DRAFT:
            return Response({'detail': 'Only draft invoices can be issued.'}, status=400)
        inv.status = Invoice.STATUS_ISSUED
        inv.save(update_fields=['status'])
        return Response(InvoiceSerializer(inv).data)

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
        """
        Mark an invoice as paid.
        If there is an outstanding balance, a Payment record is created for the
        remaining amount (which triggers the Dr Cash/Bank / Cr AR journal entry via signal).
        Body: { "method": "cash" | "bank_transfer" | "cheque" | ..., "bank_account": <id> }
        bank_account is required when method != cash.
        """
        inv = self.get_object()
        # BLOCK: marking a DRAFT invoice paid skips the issue step entirely.
        # The issue signal creates Dr AR / Cr Revenue; without it, recording a
        # Dr Cash / Cr AR payment leaves AR credited with no matching debit — invalid.
        if inv.status != Invoice.STATUS_ISSUED:
            return Response(
                {'detail': 'Only issued invoices can be marked as paid. Issue the invoice first.'},
                status=400,
            )

        method = request.data.get('method', Payment.METHOD_CASH)
        if method not in dict(Payment.METHOD_CHOICES):
            method = Payment.METHOD_CASH

        bank_account = None
        bank_account_id = request.data.get('bank_account')
        if bank_account_id:
            try:
                bank_account = BankAccount.objects.get(pk=bank_account_id, tenant=self.tenant)
            except BankAccount.DoesNotExist:
                return Response({'detail': 'Bank account not found.'}, status=404)

        if method != Payment.METHOD_CASH and not bank_account:
            return Response({'detail': 'bank_account is required for non-cash payment methods.'}, status=400)

        from .services.payment_service import record_payment
        amount_due = inv.amount_due
        payment = None
        if amount_due > Decimal('0'):
            payment = record_payment(
                tenant=self.tenant,
                created_by=request.user,
                payment_type=Payment.TYPE_INCOMING,
                method=method,
                amount=amount_due,
                date=timezone.localdate(),
                invoice=inv,
                bank_account=bank_account,
                reference=inv.invoice_number,
                notes=f'Invoice payment via {method}.',
            )
        else:
            # Already fully covered by earlier payments / credit notes
            inv.status  = Invoice.STATUS_PAID
            inv.paid_at = timezone.now()
            inv.save(update_fields=['status', 'paid_at'])

        inv.refresh_from_db()
        return Response({
            'invoice': InvoiceSerializer(inv).data,
            'payment': PaymentSerializer(payment).data if payment else None,
        })

    @action(detail=True, methods=['post'], url_path='void')
    def void_invoice(self, request, pk=None):
        inv = self.get_object()
        if inv.status == Invoice.STATUS_VOID:
            return Response({'detail': 'Already voided.'}, status=400)
        # BLOCK: paid invoices have payment journals (Dr Cash / Cr AR) already posted.
        # Voiding only reverses the invoice journal (Dr Revenue Cr AR), leaving
        # the cash journal intact — this would leave the ledger in an impossible state.
        if inv.status == Invoice.STATUS_PAID:
            return Response(
                {'detail': 'Paid invoices cannot be voided. Create a credit note or refund payment instead.'},
                status=400,
            )
        inv.status = Invoice.STATUS_VOID
        inv.save(update_fields=['status'])
        return Response(InvoiceSerializer(inv).data)

    @action(detail=True, methods=['post'], url_path='collect-payment')
    def collect_payment(self, request, pk=None):
        """
        POST /invoices/{id}/collect-payment/
        Staff records customer payment on-site.
        Body: { method, amount, bank_account (optional), reference (optional), notes (optional) }
        """
        inv = self.get_object()
        method = request.data.get('method')
        amount = request.data.get('amount')
        if not method:
            return Response({'detail': '"method" is required (cash/bank_transfer/esewa/khalti/cheque).'}, status=400)
        if not amount:
            return Response({'detail': '"amount" is required.'}, status=400)

        bank_account_id = request.data.get('bank_account')
        bank_account = None
        if bank_account_id:
            from accounting.models import BankAccount
            try:
                bank_account = BankAccount.objects.get(pk=bank_account_id, tenant=self.tenant)
            except BankAccount.DoesNotExist:
                return Response({'detail': 'Bank account not found.'}, status=404)

        from accounting.services.ticket_invoice_service import submit_invoice_payment
        try:
            submit_invoice_payment(
                invoice=inv,
                collected_by=request.user,
                method=method,
                amount=amount,
                bank_account=bank_account,
                reference=request.data.get('reference', ''),
                notes=request.data.get('notes', ''),
            )
        except ValueError as e:
            return Response({'detail': str(e)}, status=400)
        inv.refresh_from_db()
        return Response(InvoiceSerializer(inv).data)

    @action(detail=True, methods=['post'], url_path='finance-review')
    def finance_review(self, request, pk=None):
        """
        POST /invoices/{id}/finance-review/
        Finance approves or rejects a submitted invoice.
        Body: { "action": "approve" | "reject", "notes": "..." }
        Requires manager or admin role.
        """
        inv = self.get_object()
        action_str = request.data.get('action')
        notes      = request.data.get('notes', '')

        if action_str not in ('approve', 'reject'):
            return Response({'detail': '"action" must be "approve" or "reject".'}, status=400)

        from accounting.services.ticket_invoice_service import (
            finance_approve_invoice,
            finance_reject_invoice,
        )
        try:
            if action_str == 'approve':
                finance_approve_invoice(inv, request.user, notes)
            else:
                finance_reject_invoice(inv, request.user, notes)
        except ValueError as e:
            return Response({'detail': str(e)}, status=400)

        inv.refresh_from_db()
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
            import logging
            logging.getLogger(__name__).error(
                "Invoice email failed for invoice %s: %s", inv.pk, e, exc_info=True
            )
            return Response(
                {'detail': 'Failed to send invoice email. Check server logs or contact support.'},
                status=500,
            )
        return Response({'detail': 'Invoice sent successfully.'})


# ─────────────────────────────────────────────────────────────────────────────
# Quotations
# ─────────────────────────────────────────────────────────────────────────────

class QuotationViewSet(TenantMixin, viewsets.ModelViewSet):
    """
    Pre-sales estimates / proforma invoices.

    POST /quotations/{id}/send/     — mark as sent
    POST /quotations/{id}/accept/   — mark as accepted
    POST /quotations/{id}/decline/  — mark as declined
    POST /quotations/{id}/convert/  — convert accepted quotation to an Invoice
    """

    queryset         = Quotation.objects.all()
    serializer_class = QuotationSerializer
    required_module  = 'accounting'

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*STAFF_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES)()]

    def get_queryset(self):
        self.ensure_tenant()
        qs = Quotation.objects.filter(tenant=self.tenant).select_related('customer')
        if s := self.request.query_params.get('status'):
            qs = qs.filter(status=s)
        if cid := self.request.query_params.get('customer'):
            qs = qs.filter(customer_id=cid)
        return qs.order_by('-created_at')

    def _compute_and_save(self, serializer):
        from .services.invoice_service import compute_invoice_totals
        t = self.tenant
        existing   = serializer.instance
        line_items = serializer.validated_data.get(
            'line_items',
            existing.line_items if existing else [],
        )
        discount = serializer.validated_data.get(
            'discount',
            existing.discount if existing else Decimal('0'),
        )
        vat_rate   = t.vat_rate if t.vat_enabled else Decimal('0')
        subtotal, vat_amount, total = compute_invoice_totals(line_items, discount, vat_rate)
        serializer.save(
            tenant=t, created_by=self.request.user,
            subtotal=subtotal, vat_rate=vat_rate, vat_amount=vat_amount, total=total,
        )

    def perform_create(self, serializer):
        self._compute_and_save(serializer)

    def perform_update(self, serializer):
        self._compute_and_save(serializer)

    @action(detail=True, methods=['post'], url_path='send')
    def send(self, request, pk=None):
        quo = self.get_object()
        if quo.status != Quotation.STATUS_DRAFT:
            return Response({'detail': 'Only draft quotations can be sent.'}, status=400)
        quo.status  = Quotation.STATUS_SENT
        quo.sent_at = timezone.now()
        quo.save(update_fields=['status', 'sent_at'])
        return Response(QuotationSerializer(quo).data)

    @action(detail=True, methods=['post'], url_path='accept')
    def accept(self, request, pk=None):
        quo = self.get_object()
        if quo.status not in (Quotation.STATUS_SENT, Quotation.STATUS_DRAFT):
            return Response({'detail': 'Quotation cannot be accepted in its current state.'}, status=400)
        quo.status      = Quotation.STATUS_ACCEPTED
        quo.accepted_at = timezone.now()
        quo.save(update_fields=['status', 'accepted_at'])
        return Response(QuotationSerializer(quo).data)

    @action(detail=True, methods=['post'], url_path='decline')
    def decline(self, request, pk=None):
        quo = self.get_object()
        if quo.status in (Quotation.STATUS_DECLINED, Quotation.STATUS_EXPIRED):
            return Response({'detail': 'Already declined/expired.'}, status=400)
        quo.status = Quotation.STATUS_DECLINED
        quo.save(update_fields=['status'])
        return Response(QuotationSerializer(quo).data)

    @action(detail=True, methods=['post'], url_path='convert')
    def convert(self, request, pk=None):
        """Convert an accepted quotation into a full Invoice."""
        quo = self.get_object()
        if quo.status != Quotation.STATUS_ACCEPTED:
            return Response({'detail': 'Quotation must be accepted before converting.'}, status=400)
        if quo.converted_invoice_id:
            return Response({'detail': 'Already converted.'}, status=400)

        from .services.invoice_service import compute_invoice_totals
        t = self.tenant
        vat_rate = t.vat_rate if t.vat_enabled else Decimal('0')
        subtotal, vat_amount, total = compute_invoice_totals(
            quo.line_items, quo.discount, vat_rate,
        )
        invoice = Invoice.objects.create(
            tenant=t, created_by=request.user,
            customer=quo.customer, ticket=quo.ticket, project=quo.project,
            line_items=quo.line_items,
            subtotal=subtotal, discount=quo.discount,
            vat_rate=vat_rate, vat_amount=vat_amount, total=total,
            status=Invoice.STATUS_DRAFT,
            notes=quo.notes,
            payment_terms=30,
        )
        quo.converted_invoice = invoice
        quo.save(update_fields=['converted_invoice'])
        return Response(QuotationSerializer(quo).data, status=201)


# ─────────────────────────────────────────────────────────────────────────────
# Debit Notes
# ─────────────────────────────────────────────────────────────────────────────

class DebitNoteViewSet(TenantMixin, viewsets.ModelViewSet):
    """
    Purchase returns to supplier.

    POST /debit-notes/{id}/issue/ — issue the debit note (creates reversal journal)
    POST /debit-notes/{id}/void/  — void
    """

    queryset         = DebitNote.objects.all()
    serializer_class = DebitNoteSerializer
    required_module  = 'accounting'

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]

    def get_queryset(self):
        self.ensure_tenant()
        qs = DebitNote.objects.filter(tenant=self.tenant).select_related('bill')
        if s := self.request.query_params.get('status'):
            qs = qs.filter(status=s)
        return qs.order_by('-created_at')

    def _compute_totals(self, serializer):
        from .services.invoice_service import compute_invoice_totals
        branch = serializer.validated_data.get('bill')
        vat_rate = self.tenant.vat_rate if self.tenant.vat_enabled else Decimal('0')
        line_items = serializer.validated_data.get('line_items', [])
        subtotal, vat_amount, total = compute_invoice_totals(line_items, Decimal('0'), vat_rate)
        serializer.save(tenant=self.tenant, created_by=self.request.user,
                        subtotal=subtotal, vat_amount=vat_amount, total=total)

    def perform_create(self, serializer):
        self._compute_totals(serializer)

    @action(detail=True, methods=['post'], url_path='issue')
    def issue(self, request, pk=None):
        dn = self.get_object()
        if dn.status != DebitNote.STATUS_DRAFT:
            return Response({'detail': 'Only draft debit notes can be issued.'}, status=400)
        dn.status    = DebitNote.STATUS_ISSUED
        dn.issued_at = timezone.now()
        dn.save(update_fields=['status', 'issued_at'])
        # Signal in signals.py will create the reversal journal entry
        return Response(DebitNoteSerializer(dn).data)

    @action(detail=True, methods=['post'], url_path='void')
    def void(self, request, pk=None):
        dn = self.get_object()
        if dn.status == DebitNote.STATUS_VOID:
            return Response({'detail': 'Already voided.'}, status=400)
        dn.status = DebitNote.STATUS_VOID
        dn.save(update_fields=['status'])
        return Response(DebitNoteSerializer(dn).data)


# ─────────────────────────────────────────────────────────────────────────────
# TDS Entries
# ─────────────────────────────────────────────────────────────────────────────

class TDSEntryViewSet(TenantMixin, viewsets.ModelViewSet):
    """
    Nepal TDS management.  Track deductions and deposits to IRD.

    POST /tds/{id}/mark-deposited/ — record that amount was deposited to IRD
    GET  /tds/summary/             — monthly TDS summary for a fiscal year
    """

    queryset         = TDSEntry.objects.all()
    serializer_class = TDSEntrySerializer
    required_module  = 'accounting'

    def get_permissions(self):
        if self.action in ('list', 'retrieve', 'summary'):
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES)()]
        if self.action in ('update', 'partial_update'):
            # Allow admins to correct TDS entries (supplier name, PAN, rate, period)
            return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]

    def perform_update(self, serializer):
        entry = serializer.instance
        if entry.status == TDSEntry.STATUS_DEPOSITED:
            from rest_framework.exceptions import ValidationError
            raise ValidationError('Cannot edit a deposited TDS entry.')
        serializer.save()

    def get_queryset(self):
        self.ensure_tenant()
        qs = TDSEntry.objects.filter(tenant=self.tenant)
        if s := self.request.query_params.get('status'):
            qs = qs.filter(status=s)
        if y := self.request.query_params.get('year'):
            qs = qs.filter(period_year=y)
        if m := self.request.query_params.get('month'):
            qs = qs.filter(period_month=m)
        return qs.order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save(tenant=self.tenant, created_by=self.request.user)

    @action(detail=True, methods=['post'], url_path='mark-deposited')
    def mark_deposited(self, request, pk=None):
        entry = self.get_object()
        if entry.status == TDSEntry.STATUS_DEPOSITED:
            return Response({'detail': 'Already deposited.'}, status=400)
        entry.status           = TDSEntry.STATUS_DEPOSITED
        entry.deposited_at     = timezone.now()
        entry.deposit_reference = request.data.get('deposit_reference', '')
        entry.save(update_fields=['status', 'deposited_at', 'deposit_reference'])
        return Response(TDSEntrySerializer(entry).data)

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        """Monthly TDS totals for a fiscal year. GET ?year=2081"""
        from django.db.models import Sum
        self.ensure_tenant()
        year = request.query_params.get('year')
        qs   = TDSEntry.objects.filter(tenant=self.tenant)
        if year:
            qs = qs.filter(period_year=year)
        rows = (
            qs.values('period_year', 'period_month', 'status')
            .annotate(total_tds=Sum('tds_amount'), total_taxable=Sum('taxable_amount'))
            .order_by('period_year', 'period_month')
        )
        return Response(list(rows))


# ─────────────────────────────────────────────────────────────────────────────
# Bank Reconciliation
# ─────────────────────────────────────────────────────────────────────────────

class BankReconciliationViewSet(TenantMixin, viewsets.ModelViewSet):
    """
    Bank statement reconciliation against system Payment records.

    POST /bank-reconciliations/{id}/add-line/      — add a bank statement line
    POST /bank-reconciliations/{id}/match-line/    — match a line to a Payment
    POST /bank-reconciliations/{id}/unmatch-line/  — unmatch a line
    POST /bank-reconciliations/{id}/reconcile/     — finalize (requires difference == 0)
    """

    queryset         = BankReconciliation.objects.all()
    serializer_class = BankReconciliationSerializer
    required_module  = 'accounting'

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]

    def get_queryset(self):
        self.ensure_tenant()
        qs = BankReconciliation.objects.filter(tenant=self.tenant).select_related('bank_account')
        if bid := self.request.query_params.get('bank_account'):
            qs = qs.filter(bank_account_id=bid)
        return qs.order_by('-statement_date')

    def perform_create(self, serializer):
        serializer.save(tenant=self.tenant, created_by=self.request.user)

    @action(detail=True, methods=['post'], url_path='add-line')
    def add_line(self, request, pk=None):
        rec = self.get_object()
        if rec.status == BankReconciliation.STATUS_RECONCILED:
            return Response({'detail': 'Reconciliation is locked.'}, status=400)
        ser = BankReconciliationLineSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save(reconciliation=rec)
        return Response(ser.data, status=201)

    @action(detail=True, methods=['post'], url_path='match-line')
    def match_line(self, request, pk=None):
        """Body: {"line_id": int, "payment_id": int}"""
        rec = self.get_object()
        try:
            line    = rec.lines.get(pk=request.data['line_id'])
            payment = Payment.objects.get(pk=request.data['payment_id'], tenant=self.tenant)
        except (BankReconciliationLine.DoesNotExist, Payment.DoesNotExist, KeyError):
            return Response({'detail': 'Line or payment not found.'}, status=404)
        line.is_matched = True
        line.payment    = payment
        line.save(update_fields=['is_matched', 'payment'])
        return Response(BankReconciliationLineSerializer(line).data)

    @action(detail=True, methods=['post'], url_path='unmatch-line')
    def unmatch_line(self, request, pk=None):
        rec = self.get_object()
        try:
            line = rec.lines.get(pk=request.data['line_id'])
        except (BankReconciliationLine.DoesNotExist, KeyError):
            return Response({'detail': 'Line not found.'}, status=404)
        line.is_matched = False
        line.payment    = None
        line.save(update_fields=['is_matched', 'payment'])
        return Response(BankReconciliationLineSerializer(line).data)

    @action(detail=True, methods=['post'], url_path='reconcile')
    def reconcile(self, request, pk=None):
        """Lock the reconciliation. Fails if difference != 0."""
        rec = self.get_object()
        if rec.status == BankReconciliation.STATUS_RECONCILED:
            return Response({'detail': 'Already reconciled.'}, status=400)
        if rec.difference != 0:
            return Response(
                {'detail': f'Unmatched difference of {rec.difference}. All lines must be matched.'},
                status=400,
            )
        rec.status        = BankReconciliation.STATUS_RECONCILED
        rec.reconciled_at = timezone.now()
        rec.save(update_fields=['status', 'reconciled_at'])
        return Response(BankReconciliationSerializer(rec).data)


# ─────────────────────────────────────────────────────────────────────────────
# Recurring Journals
# ─────────────────────────────────────────────────────────────────────────────

class RecurringJournalViewSet(TenantMixin, viewsets.ModelViewSet):
    """
    Recurring journal entry templates.

    POST /recurring-journals/{id}/run/ — manually trigger one run now
    """

    queryset         = RecurringJournal.objects.all()
    serializer_class = RecurringJournalSerializer
    required_module  = 'accounting'

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]

    def get_queryset(self):
        self.ensure_tenant()
        qs = RecurringJournal.objects.filter(tenant=self.tenant)
        if request_active := self.request.query_params.get('active'):
            qs = qs.filter(is_active=request_active.lower() == 'true')
        return qs.order_by('next_date')

    def perform_create(self, serializer):
        obj = serializer.save(tenant=self.tenant, created_by=self.request.user)
        # Ensure next_date defaults to start_date if not provided
        if not obj.next_date:
            obj.next_date = obj.start_date
            obj.save(update_fields=['next_date'])

    @action(detail=True, methods=['post'], url_path='run')
    def run_now(self, request, pk=None):
        """Manually execute this recurring template right now."""
        from .services.journal_service import run_recurring_journal
        rec = self.get_object()
        try:
            entry = run_recurring_journal(rec, triggered_by=request.user)
        except ValueError as e:
            return Response({'detail': str(e)}, status=400)
        from .serializers import JournalEntrySerializer
        return Response(JournalEntrySerializer(entry).data, status=201)


# ─────────────────────────────────────────────────────────────────────────────
# Tax Remittance  (VAT + TDS  →  IRD)
# ─────────────────────────────────────────────────────────────────────────────

class VATRemittanceView(TenantMixin, viewsets.ViewSet):
    """
    POST /accounting/vat-remittance/
    Body: { "amount": "13000.00", "period": "2081-04" }
    Permission: Manager or Admin.

    Records the payment of collected VAT to IRD.
    Journal: Dr VAT Payable 2200 / Cr Cash 1100
    """
    required_module = 'accounting'

    def get_permissions(self):
        return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES)()]

    def create(self, request):
        self.ensure_tenant()
        from decimal import InvalidOperation
        try:
            amount = Decimal(str(request.data.get('amount', '0')))
        except (InvalidOperation, TypeError):
            return Response({'detail': 'amount must be a valid decimal number.'}, status=400)

        period = request.data.get('period', '')
        if not period:
            return Response({'detail': 'period is required (e.g. "2081-04").'}, status=400)

        from .services.journal_service import record_vat_remittance
        try:
            entry = record_vat_remittance(self.tenant, amount, period, created_by=request.user)
        except ValueError as e:
            return Response({'detail': str(e)}, status=400)

        from .serializers import JournalEntrySerializer
        return Response({'journal_entry': JournalEntrySerializer(entry).data}, status=201)


class TDSRemittanceView(TenantMixin, viewsets.ViewSet):
    """
    POST /accounting/tds-remittance/
    Body: { "amount": "3000.00", "period": "2081-04" }
    Permission: Manager or Admin.

    Records the deposit of withheld TDS (salary or supplier) to IRD.
    Journal: Dr TDS Payable 2300 / Cr Cash 1100
    """
    required_module = 'accounting'

    def get_permissions(self):
        return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES)()]

    def create(self, request):
        self.ensure_tenant()
        from decimal import InvalidOperation
        try:
            amount = Decimal(str(request.data.get('amount', '0')))
        except (InvalidOperation, TypeError):
            return Response({'detail': 'amount must be a valid decimal number.'}, status=400)

        period = request.data.get('period', '')
        if not period:
            return Response({'detail': 'period is required (e.g. "2081-04").'}, status=400)

        from .services.journal_service import record_tds_remittance
        try:
            entry = record_tds_remittance(self.tenant, amount, period, created_by=request.user)
        except ValueError as e:
            return Response({'detail': str(e)}, status=400)

        from .serializers import JournalEntrySerializer
        return Response({'journal_entry': JournalEntrySerializer(entry).data}, status=201)
