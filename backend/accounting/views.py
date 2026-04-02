"""
accounting/views.py — Full accounting module viewsets.
"""
import logging
from decimal import Decimal
from rest_framework import viewsets, permissions, status

logger = logging.getLogger(__name__)
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django.http import HttpResponse
from core.mixins import TenantMixin
from core.views import NexusViewSet
from core.exceptions import ConflictError, ForbiddenError
from core.exceptions import ValidationError as AppValidationError
from core.response import ApiResponse
from core.permissions import (
    make_role_permission, ALL_ROLES, STAFF_ROLES, MANAGER_ROLES, ADMIN_ROLES,
)
from accounting.services.invoice_service import InvoiceService
from accounting.services.coin_service import CoinService
from accounting.services.payslip_service import PayslipService
from accounting.services.bill_service import BillService
from accounting.services.credit_note_service import CreditNoteService
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

class AccountViewSet(NexusViewSet):
    """CRUD for Chart of Accounts. GET /accounts/trial-balance/ for trial balance."""

    queryset         = Account.objects.all()
    serializer_class = AccountSerializer
    required_module  = 'accounting'

    def get_permissions(self):
        if self.action in ('list', 'retrieve', 'trial_balance'):
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES, permission_key='accounting.view_invoices')()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES, permission_key='accounting.manage_invoices')()]

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
            raise ConflictError('System accounts cannot be deleted.')
        if account.children.exists():
            raise ConflictError('This account has sub-accounts. Delete or re-parent them first.')
        if account.journal_lines.filter(entry__is_posted=True).exists():
            raise ConflictError('This account has posted journal entries and cannot be deleted.')
        account.delete()
        return ApiResponse.no_content()

    @action(detail=False, methods=['get'], url_path='trial-balance')
    def trial_balance(self, request):
        from .services.report_service import trial_balance as tb
        from datetime import date
        df_raw = request.query_params.get('date_from', str(date.today().replace(day=1)))
        dt_raw = request.query_params.get('date_to', str(date.today()))
        try:
            df = date.fromisoformat(df_raw)
            dt = date.fromisoformat(dt_raw)
        except ValueError as exc:
            raise AppValidationError(str(exc))
        self.ensure_tenant()
        return ApiResponse.success(data=tb(self.tenant, df, dt))


# ─────────────────────────────────────────────────────────────────────────────
# Bank Accounts
# ─────────────────────────────────────────────────────────────────────────────

class BankAccountViewSet(NexusViewSet):
    """Bank account CRUD. read=manager+, write=admin+."""

    queryset         = BankAccount.objects.all()
    serializer_class = BankAccountSerializer
    required_module  = 'accounting'

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES, permission_key='accounting.view_invoices')()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES, permission_key='accounting.manage_invoices')()]

    def get_queryset(self):
        self.ensure_tenant()
        return BankAccount.objects.filter(tenant=self.tenant).select_related('linked_account')


# ─────────────────────────────────────────────────────────────────────────────
# Journal Entries
# ─────────────────────────────────────────────────────────────────────────────

class JournalEntryViewSet(NexusViewSet):
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
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES, permission_key='accounting.view_invoices')()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES, permission_key='accounting.manage_invoices')()]

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
        if fy_raw := self.request.query_params.get('fiscal_year'):
            try:
                from core.nepali_date import fiscal_year_date_range, FiscalYear
                fy = FiscalYear(bs_year=int(fy_raw))
                start_ad, end_ad = fiscal_year_date_range(fy)
                qs = qs.filter(date__gte=start_ad, date__lte=end_ad)
            except (ValueError, KeyError):
                pass
        return qs

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
        return ApiResponse.created(data=JournalEntrySerializer(entry).data)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.is_posted:
            raise ConflictError('Posted entries cannot be edited.')
        partial = kwargs.pop('partial', False)
        serializer = JournalEntryWriteSerializer(
            instance, data=request.data, partial=partial,
            context=self.get_serializer_context(),
        )
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        return ApiResponse.success(data=JournalEntrySerializer(instance).data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.is_posted:
            raise ConflictError('Posted entries cannot be deleted.')
        instance.delete()
        return ApiResponse.no_content()

    @action(detail=True, methods=['post'], url_path='post')
    def post_entry(self, request, pk=None):
        """POST /journals/{id}/post/ — validate balance and lock the entry."""
        entry = self.get_object()
        if entry.is_posted:
            raise ConflictError('Already posted.')
        try:
            entry.post()
        except ValueError as exc:
            raise AppValidationError(str(exc))
        return ApiResponse.success(data=JournalEntrySerializer(entry).data)


# ─────────────────────────────────────────────────────────────────────────────
# Bills
# ─────────────────────────────────────────────────────────────────────────────

class BillViewSet(NexusViewSet):
    """
    Supplier bills / expenses.
    approve action triggers journal entry via signal.

    POST /bills/{id}/approve/   — approve draft
    POST /bills/{id}/void/      — void
    POST /bills/{id}/mark-paid/ — mark as paid
    """

    queryset         = Bill.objects.all()
    serializer_class = BillSerializer
    service_class    = BillService
    required_module  = 'accounting'

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES, permission_key='accounting.view_invoices')()]
        if self.action in ('update', 'partial_update'):
            return [permissions.IsAuthenticated(), make_role_permission(*STAFF_ROLES, permission_key='accounting.manage_invoices')()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES, permission_key='accounting.manage_invoices')()]

    def get_queryset(self):
        self.ensure_tenant()
        status_filter   = self.request.query_params.get('status')
        fy_start, fy_end = None, None
        if fy_raw := self.request.query_params.get('fiscal_year'):
            try:
                from core.nepali_date import fiscal_year_date_range, FiscalYear
                fy = FiscalYear(bs_year=int(fy_raw))
                fy_start, fy_end = fiscal_year_date_range(fy)
            except (ValueError, KeyError):
                pass
        return self.get_service().list(
            status=status_filter,
            fiscal_year_start=fy_start,
            fiscal_year_end=fy_end,
        )

    def update(self, request, *args, **kwargs):
        """Pass is_admin flag so service can enforce draft-only edit rule for non-admins."""
        partial    = kwargs.pop('partial', False)
        instance   = self.get_object()
        serializer = self.get_input_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        bill = self.get_service().update(
            instance, serializer.validated_data, is_admin=self._is_admin()
        )
        return ApiResponse.success(data=BillSerializer(bill).data)

    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        bill = self.get_object()
        bill = self.get_service().approve(bill)
        return ApiResponse.success(data=BillSerializer(bill).data)

    @action(detail=True, methods=['post'], url_path='void')
    def void(self, request, pk=None):
        bill = self.get_object()
        bill = self.get_service().void(bill)
        return ApiResponse.success(data=BillSerializer(bill).data)

    @action(detail=True, methods=['post'], url_path='mark-paid')
    def mark_paid(self, request, pk=None):
        """
        Mark a bill as paid.
        Body: { "method": "cash" | "bank_transfer" | "cheque" | ..., "bank_account": <id> }
        """
        bill            = self.get_object()
        method          = request.data.get('method', Payment.METHOD_CASH)
        bank_account_id = request.data.get('bank_account')
        bill, payment   = self.get_service().mark_paid(bill, method, bank_account_id)
        return ApiResponse.success(data={
            'bill':    BillSerializer(bill).data,
            'payment': PaymentSerializer(payment).data if payment else None,
        })


# ─────────────────────────────────────────────────────────────────────────────
# Payments
# ─────────────────────────────────────────────────────────────────────────────

class PaymentViewSet(NexusViewSet):
    """
    Payments are immutable once created — no edit or delete.
    Journal entry auto-created by signal on post_save.
    """

    queryset         = Payment.objects.all()
    serializer_class = PaymentSerializer
    required_module  = 'accounting'

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES, permission_key='accounting.view_invoices')()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES, permission_key='accounting.manage_invoices')()]

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
        if fy_raw := self.request.query_params.get('fiscal_year'):
            try:
                from core.nepali_date import fiscal_year_date_range, FiscalYear
                fy = FiscalYear(bs_year=int(fy_raw))
                start_ad, end_ad = fiscal_year_date_range(fy)
                qs = qs.filter(date__gte=start_ad, date__lte=end_ad)
            except (ValueError, KeyError):
                pass
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

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return ApiResponse.created(data=PaymentSerializer(serializer.instance).data)

    def update(self, request, *args, **kwargs):
        raise ConflictError('Payments cannot be edited.')

    def destroy(self, request, *args, **kwargs):
        """Admin-only hard delete. Note: linked journal entries are NOT auto-reversed.
        Admin should post a manual reversing journal entry if needed."""
        if not self._is_admin():
            raise ForbiddenError('Only admins can delete payments.')
        instance = self.get_object()
        instance.delete()
        return ApiResponse.no_content()


# ─────────────────────────────────────────────────────────────────────────────
# Credit Notes
# ─────────────────────────────────────────────────────────────────────────────

class CreditNoteViewSet(NexusViewSet):
    """
    POST /credit-notes/{id}/issue/    — issue a draft credit note
    POST /credit-notes/{id}/apply/    — apply to an invoice (body: {invoice: id})
    POST /credit-notes/{id}/void/     — void
    """

    queryset         = CreditNote.objects.all()
    serializer_class = CreditNoteSerializer
    service_class    = CreditNoteService
    required_module  = 'accounting'

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES, permission_key='accounting.view_invoices')()]
        if self.action in ('update', 'partial_update'):
            return [permissions.IsAuthenticated(), make_role_permission(*STAFF_ROLES, permission_key='accounting.manage_invoices')()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES, permission_key='accounting.manage_invoices')()]

    def get_queryset(self):
        self.ensure_tenant()
        fy_start, fy_end = None, None
        if fy_raw := self.request.query_params.get('fiscal_year'):
            try:
                from core.nepali_date import fiscal_year_date_range, FiscalYear
                fy = FiscalYear(bs_year=int(fy_raw))
                fy_start, fy_end = fiscal_year_date_range(fy)
            except (ValueError, KeyError):
                pass
        return self.get_service().list(
            fiscal_year_start=fy_start,
            fiscal_year_end=fy_end,
        )

    @action(detail=True, methods=['post'], url_path='issue')
    def issue(self, request, pk=None):
        cn = self.get_object()
        cn = self.get_service().issue(cn)
        return ApiResponse.success(data=CreditNoteSerializer(cn).data)

    @action(detail=True, methods=['post'], url_path='apply')
    def apply_to_invoice(self, request, pk=None):
        cn         = self.get_object()
        invoice_id = request.data.get('invoice')
        if not invoice_id:
            from core.exceptions import ValidationError as AppValidationError
            raise AppValidationError('invoice field is required.')
        cn = self.get_service().apply(cn, invoice_id)
        return ApiResponse.success(data=CreditNoteSerializer(cn).data)

    @action(detail=True, methods=['post'], url_path='void')
    def void(self, request, pk=None):
        cn = self.get_object()
        cn = self.get_service().void(cn)
        return ApiResponse.success(data=CreditNoteSerializer(cn).data)


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
        return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES, permission_key='accounting.view_invoices')()]

    def _parse_dates(self, request, *names):
        """
        Parse date query params.  Accepts both AD (YYYY-MM-DD) and BS dates.

        Formats accepted
        ----------------
        ``?date_from=2024-07-17``           → AD ISO date
        ``?date_from=bs:2081-04-01``        → convert BS → AD automatically
        ``?fiscal_year=2081``               → expand to full FY AD range
                                              (only useful for paired from/to)
        """
        from datetime import date as _date
        from core.nepali_date import bs_to_ad, fiscal_year_date_range, FiscalYear

        # Shortcut: entire fiscal year for report endpoints that take a from/to pair
        fy_raw = request.query_params.get('fiscal_year')
        if fy_raw and len(names) == 2:
            try:
                fy = FiscalYear(bs_year=int(fy_raw))
                start_ad, end_ad = fiscal_year_date_range(fy)
                return [start_ad, end_ad]
            except (ValueError, KeyError):
                pass  # fall through to normal parsing

        result = []
        for name in names:
            raw = request.query_params.get(name, str(_date.today()))
            if raw.lower().startswith('bs:'):
                # BS date: parse YYYY-MM-DD after the prefix
                bs_str = raw[3:]
                parts = bs_str.split('-')
                if len(parts) != 3:
                    raise ValueError(f"Invalid BS date format for {name}: '{raw}'. Use bs:YYYY-MM-DD")
                result.append(bs_to_ad(int(parts[0]), int(parts[1]), int(parts[2])))
            else:
                result.append(_date.fromisoformat(raw))
        return result

    @action(detail=False, methods=['get'], url_path='current-fiscal-year')
    def current_fiscal_year(self, request):
        """
        GET /reports/current-fiscal-year/

        Returns metadata for the current Nepal fiscal year::

            {
              "fiscal_year":  "2081/082",
              "bs_year":      2081,
              "start_ad":     "2024-07-17",
              "end_ad":       "2025-07-16",
              "start_bs":     "2081-04-01",
              "start_bs_en":  "1 Shrawan 2081",
              "end_bs":       "2082-03-32",
              "end_bs_en":    "32 Ashadh 2082"
            }
        """
        from core.nepali_date import (
            current_fiscal_year, fiscal_year_date_range, ad_to_bs
        )
        fy = current_fiscal_year()
        start_ad, end_ad = fiscal_year_date_range(fy)
        start_bs = ad_to_bs(start_ad)
        end_bs   = ad_to_bs(end_ad)
        return ApiResponse.success(data={
            'fiscal_year':  str(fy),
            'bs_year':      fy.bs_year,
            'label_full':   fy.label_full,
            'start_ad':     str(start_ad),
            'end_ad':       str(end_ad),
            'start_bs':     start_bs.isoformat(),
            'start_bs_en':  start_bs.display_en(),
            'start_bs_np':  start_bs.display_np(),
            'end_bs':       end_bs.isoformat(),
            'end_bs_en':    end_bs.display_en(),
            'end_bs_np':    end_bs.display_np(),
        })

    @action(detail=False, methods=['get'], url_path='profit-loss')
    def profit_loss(self, request):
        from .services.report_service import profit_and_loss
        self.ensure_tenant()
        try:
            df, dt = self._parse_dates(request, 'date_from', 'date_to')
        except ValueError as exc:
            raise AppValidationError(str(exc))
        return ApiResponse.success(data=profit_and_loss(self.tenant, df, dt))

    @action(detail=False, methods=['get'], url_path='balance-sheet')
    def balance_sheet(self, request):
        from .services.report_service import balance_sheet
        self.ensure_tenant()
        try:
            (as_of,) = self._parse_dates(request, 'as_of_date')
        except ValueError as exc:
            raise AppValidationError(str(exc))
        return ApiResponse.success(data=balance_sheet(self.tenant, as_of))

    @action(detail=False, methods=['get'], url_path='trial-balance')
    def trial_balance(self, request):
        from .services.report_service import trial_balance
        self.ensure_tenant()
        try:
            df, dt = self._parse_dates(request, 'date_from', 'date_to')
        except ValueError as exc:
            raise AppValidationError(str(exc))
        return ApiResponse.success(data=trial_balance(self.tenant, df, dt))

    @action(detail=False, methods=['get'], url_path='aged-receivables')
    def aged_receivables(self, request):
        from .services.report_service import aged_receivables
        self.ensure_tenant()
        try:
            (as_of,) = self._parse_dates(request, 'as_of_date')
        except ValueError as exc:
            raise AppValidationError(str(exc))
        return ApiResponse.success(data=aged_receivables(self.tenant, as_of))

    @action(detail=False, methods=['get'], url_path='aged-payables')
    def aged_payables(self, request):
        from .services.report_service import aged_payables
        self.ensure_tenant()
        try:
            (as_of,) = self._parse_dates(request, 'as_of_date')
        except ValueError as exc:
            raise AppValidationError(str(exc))
        return ApiResponse.success(data=aged_payables(self.tenant, as_of))

    @action(detail=False, methods=['get'], url_path='vat-report')
    def vat_report(self, request):
        from .services.report_service import vat_report
        self.ensure_tenant()
        try:
            ps, pe = self._parse_dates(request, 'period_start', 'period_end')
        except ValueError as exc:
            raise AppValidationError(str(exc))
        return ApiResponse.success(data=vat_report(self.tenant, ps, pe))

    @action(detail=False, methods=['get'], url_path='cash-flow')
    def cash_flow(self, request):
        from .services.report_service import cash_flow
        self.ensure_tenant()
        try:
            df, dt = self._parse_dates(request, 'date_from', 'date_to')
        except ValueError as exc:
            raise AppValidationError(str(exc))
        return ApiResponse.success(data=cash_flow(self.tenant, df, dt))

    @action(detail=False, methods=['get'], url_path='ledger')
    def ledger(self, request):
        """GET ?account_code=1001&date_from=YYYY-MM-DD&date_to=YYYY-MM-DD"""
        from .services.report_service import ledger_report
        self.ensure_tenant()
        account_code = request.query_params.get('account_code', '')
        if not account_code:
            raise AppValidationError('account_code is required.')
        try:
            df, dt = self._parse_dates(request, 'date_from', 'date_to')
        except ValueError as exc:
            raise AppValidationError(str(exc))
        return ApiResponse.success(data=ledger_report(self.tenant, account_code, df, dt))

    @action(detail=False, methods=['get'], url_path='day-book')
    def day_book(self, request):
        """GET ?date=YYYY-MM-DD (defaults to today)"""
        from .services.report_service import day_book
        from datetime import date
        self.ensure_tenant()
        raw = request.query_params.get('date', str(date.today()))
        try:
            d = date.fromisoformat(raw)
        except ValueError as exc:
            raise AppValidationError(str(exc))
        return ApiResponse.success(data=day_book(self.tenant, d))


# ─────────────────────────────────────────────────────────────────────────────
# Coins
# ─────────────────────────────────────────────────────────────────────────────

class CoinTransactionViewSet(NexusViewSet):
    """
    GET  /coins/?status=pending|approved|rejected&staff=<id>
    POST /coins/{id}/approve/
    POST /coins/{id}/reject/
    GET  /coins/pending/
    POST /coins/award/
    GET  /coins/staff/{staff_id}/
    """

    serializer_class = CoinTransactionSerializer
    service_class    = CoinService
    required_module  = 'accounting'

    def get_permissions(self):
        if self.action in ('list', 'retrieve', 'summary'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES, permission_key='accounting.view_coins')()]
        if self.action in ('approve', 'reject', 'pending', 'award', 'staff_history'):
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES, permission_key='accounting.manage_coins')()]
        if self.action == 'destroy':
            return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES, permission_key='accounting.manage_coins')()]
        return [permissions.IsAuthenticated(), make_role_permission(*STAFF_ROLES, permission_key='accounting.view_coins')()]

    def get_queryset(self):
        params   = self.request.query_params
        fy_start = fy_end = None
        if fy_raw := params.get('fiscal_year'):
            try:
                from core.nepali_date import fiscal_year_date_range, FiscalYear
                fy = FiscalYear(bs_year=int(fy_raw))
                fy_start, fy_end = fiscal_year_date_range(fy)
            except (ValueError, KeyError):
                pass
        return self.get_service().list(
            status=params.get('status'),
            staff_id=params.get('staff'),
            fiscal_year_start=fy_start,
            fiscal_year_end=fy_end,
            requesting_user=self.request.user,
            is_manager=self.is_manager_role(),
        )

    # ── Custom actions ────────────────────────────────────────────────────────

    def retrieve(self, request, pk=None):
        """GET /coins/{id}/ — full detail with source ticket/task context."""
        from accounting.serializers import CoinTransactionDetailSerializer
        ct = self.get_object()
        return ApiResponse.success(data=CoinTransactionDetailSerializer(ct).data)

    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        """POST /coins/{id}/approve/ — approve a pending coin transaction."""
        ct = self.get_object()
        ct = self.get_service().approve(ct)
        return ApiResponse.success(data=CoinTransactionSerializer(ct).data)

    @action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request, pk=None):
        """POST /coins/{id}/reject/ — reject a pending coin transaction."""
        ct = self.get_object()
        ct = self.get_service().reject(ct, note=request.data.get('note', ''))
        return ApiResponse.success(data=CoinTransactionSerializer(ct).data)

    @action(detail=False, methods=['get'], url_path='pending')
    def pending(self, request):
        """GET /coins/pending/ — list all pending coin transactions."""
        qs = self.get_service().pending()
        return ApiResponse.success(data=CoinTransactionSerializer(qs, many=True).data)

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        """GET /coins/summary/ — aggregate counts and totals for dashboard tabs.

        Returns pending and approved totals + tenant coin-to-money rate so the
        frontend can render tab badges and NPR value without extra requests.
        Respects the same fiscal_year filter as the list endpoint.
        """
        from decimal import Decimal
        from django.db.models import Sum
        from accounting.models import CoinTransaction as CT

        qs = CT.objects.for_tenant(request.tenant)

        # Optional fiscal-year filter
        if fy_raw := request.query_params.get('fiscal_year'):
            try:
                from core.nepali_date import fiscal_year_date_range, FiscalYear
                fy = FiscalYear(bs_year=int(fy_raw))
                fy_start, fy_end = fiscal_year_date_range(fy)
                qs = qs.filter(created_at__date__range=(fy_start, fy_end))
            except (ValueError, KeyError):
                pass

        pending_qs  = qs.filter(status=CT.STATUS_PENDING)
        approved_qs = qs.filter(status=CT.STATUS_APPROVED)

        pending_coins  = pending_qs.aggregate(t=Sum('amount'))['t']  or Decimal('0')
        approved_coins = approved_qs.aggregate(t=Sum('amount'))['t'] or Decimal('0')
        rate           = Decimal(str(request.tenant.coin_to_money_rate or '1'))

        return ApiResponse.success(data={
            'pending_count':       pending_qs.count(),
            'pending_total_coins': str(pending_coins),
            'approved_count':      approved_qs.count(),
            'approved_total_coins': str(approved_coins),
            'coin_to_money_rate':  str(rate),
            'approved_total_npr':  str((approved_coins * rate).quantize(Decimal('0.01'))),
        })

    @action(detail=False, methods=['post'], url_path='award')
    def award(self, request):
        """
        POST /coins/award/
        Body: { staff: int, amount: number, source_type: str (optional), note: str (optional) }
        Immediately awards coins with status=approved.
        """
        staff_id = request.data.get('staff')
        amount   = request.data.get('amount')
        if not staff_id or amount is None:
            from core.exceptions import ValidationError as AppValidationError
            raise AppValidationError('staff and amount are required.')
        ct = self.get_service().award(
            staff_id=staff_id,
            amount=amount,
            source_type=request.data.get('source_type'),
            source_id=request.data.get('source_id'),
            note=request.data.get('note', ''),
        )
        return ApiResponse.created(data=CoinTransactionSerializer(ct).data)

    @action(detail=False, methods=['get'], url_path=r'staff/(?P<staff_id>[^/.]+)')
    def staff_history(self, request, staff_id=None):
        """GET /coins/staff/{staff_id}/ — coin history + totals for one staff member."""
        result = self.get_service().staff_history(int(staff_id))
        rate   = result['rate']
        approved = result['approved']
        return ApiResponse.success(data={
            'staff_id':             staff_id,
            'coin_rate':            str(rate),
            'total_approved_coins': str(approved),
            'total_approved_value': str((approved * rate).quantize(Decimal('0.01'))),
            'total_pending_coins':  str(result['pending']),
            'transactions':         CoinTransactionSerializer(result['queryset'], many=True).data,
        })


# ─────────────────────────────────────────────────────────────────────────────
# Staff Salary Profiles
# ─────────────────────────────────────────────────────────────────────────────

class StaffSalaryProfileViewSet(NexusViewSet):
    """CRUD for per-staff salary configuration used by auto-generate task and payslip generation."""
    required_module  = 'accounting'
    queryset         = StaffSalaryProfile.objects.all()
    serializer_class = StaffSalaryProfileSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES, permission_key='accounting.view_payslips')()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES, permission_key='accounting.manage_payslips')()]

    def get_queryset(self):
        self.ensure_tenant()
        return StaffSalaryProfile.objects.filter(
            tenant=self.tenant
        ).select_related('staff').order_by('staff__email')


# ─────────────────────────────────────────────────────────────────────────────
# Payslips
# ─────────────────────────────────────────────────────────────────────────────

class PayslipViewSet(NexusViewSet):
    """
    POST /payslips/generate/       auto-generate from approved coins + salary profile
    POST /payslips/{id}/issue/     mark as issued
    POST /payslips/{id}/mark-paid/ mark as paid, record salary outflow in cash flow
    """

    required_module  = 'accounting'
    serializer_class = PayslipSerializer
    service_class    = PayslipService

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES, permission_key='accounting.view_payslips')()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES, permission_key='accounting.manage_payslips')()]

    def get_queryset(self):
        params   = self.request.query_params
        fy_start = fy_end = None
        if fy_raw := params.get('fiscal_year'):
            try:
                from core.nepali_date import fiscal_year_date_range, FiscalYear
                fy = FiscalYear(bs_year=int(fy_raw))
                fy_start, fy_end = fiscal_year_date_range(fy)
            except (ValueError, KeyError):
                pass
        return self.get_service().list(
            staff_id=params.get('staff'),
            fiscal_year_start=fy_start,
            fiscal_year_end=fy_end,
        )

    def update(self, request, *args, **kwargs):
        """
        Override to call service.update() which recomputes net_pay.
        net_pay = base_salary + bonus + gross_amount − tds_amount − deductions
        """
        partial  = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_input_serializer(
            instance, data=request.data, partial=partial
        )
        serializer.is_valid(raise_exception=True)
        instance = self.get_service().update(instance, serializer.validated_data)
        return ApiResponse.success(data=PayslipSerializer(instance).data)

    # ── Custom actions ────────────────────────────────────────────────────────

    @action(detail=False, methods=['post'], url_path='generate')
    def generate(self, request):
        """
        POST /payslips/generate/
        Body: { staff, period_start, period_end, base_salary?, bonus?,
                tds_rate?, deductions?, employee_pan? }
        Idempotent — regenerates if a payslip for the period already exists.
        """
        staff_id     = request.data.get('staff')
        period_start = request.data.get('period_start')
        period_end   = request.data.get('period_end')
        if not all([staff_id, period_start, period_end]):
            from core.exceptions import ValidationError as AppValidationError
            raise AppValidationError('staff, period_start, period_end are required.')

        payslip, created = self.get_service().generate(
            staff_id=staff_id,
            period_start=period_start,
            period_end=period_end,
            base_salary=request.data.get('base_salary'),
            bonus=request.data.get('bonus'),
            tds_rate=request.data.get('tds_rate'),
            deductions=request.data.get('deductions'),
            employee_pan=request.data.get('employee_pan', ''),
        )
        if created:
            return ApiResponse.created(data=PayslipSerializer(payslip).data)
        return ApiResponse.success(data=PayslipSerializer(payslip).data)

    @action(detail=True, methods=['post'], url_path='issue')
    def issue(self, request, pk=None):
        """POST /payslips/{id}/issue/ — move draft payslip to issued."""
        p = self.get_object()
        p = self.get_service().issue(p)
        return ApiResponse.success(data=PayslipSerializer(p).data)

    @action(detail=True, methods=['post'], url_path='mark-paid')
    def mark_paid(self, request, pk=None):
        """POST /payslips/{id}/mark-paid/ — mark as paid and record salary outflow."""
        p = self.get_object()
        p, payment = self.get_service().mark_paid(
            p,
            payment_method=request.data.get('payment_method', 'cash'),
            bank_account_id=request.data.get('bank_account'),
        )
        return ApiResponse.success(data={
            'payslip': PayslipSerializer(p).data,
            'payment': PaymentSerializer(payment).data if payment else None,
        })


# ─────────────────────────────────────────────────────────────────────────────
# Invoices  (enhanced)
# ─────────────────────────────────────────────────────────────────────────────

class InvoiceViewSet(NexusViewSet):
    """
    POST /invoices/                           create draft invoice
    PUT  /invoices/{id}/                      update draft invoice (recalculates VAT)
    DELETE /invoices/{id}/                    hard delete (admin only)
    POST /invoices/generate/                  create + immediately issue
    POST /invoices/generate-from-ticket/      build draft from ticket (service + products)
    POST /invoices/{id}/issue/                move draft to issued
    POST /invoices/{id}/mark-paid/            mark paid (creates Payment record)
    POST /invoices/{id}/void/                 void
    POST /invoices/{id}/collect-payment/      staff records customer payment on-site
    POST /invoices/{id}/finance-review/       finance approve or reject submitted invoice
    GET  /invoices/{id}/pdf/                  download PDF
    POST /invoices/{id}/send/                 email PDF to customer
    GET  /invoices/?finance_status=submitted  pending finance review queue
    """

    serializer_class = InvoiceSerializer
    service_class    = InvoiceService
    required_module  = 'accounting'

    def get_permissions(self):
        if self.action in ('list', 'retrieve', 'pdf'):
            # Managers see all invoices; viewer/staff see only their ticket-scoped invoices
            # (get_queryset enforces the restriction for non-manager roles).
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES, permission_key='accounting.view_invoices')()]
        # Staff can collect payment, generate from ticket, and edit DRAFT invoices
        if self.action in ('collect_payment', 'generate_from_ticket', 'update', 'partial_update'):
            return [permissions.IsAuthenticated(), make_role_permission(*STAFF_ROLES, permission_key='accounting.manage_invoices')()]
        # Finance managers (role='manager') approve/reject submitted invoices
        if self.action in ('finance_review',):
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES, permission_key='accounting.manage_invoices')()]
        # destroy and all other write actions (issue, void…) require admin
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES, permission_key='accounting.manage_invoices')()]

    def get_queryset(self):
        params = self.request.query_params
        fy_start = fy_end = None
        if fy_raw := params.get('fiscal_year'):
            try:
                from core.nepali_date import fiscal_year_date_range, FiscalYear
                fy = FiscalYear(bs_year=int(fy_raw))
                fy_start, fy_end = fiscal_year_date_range(fy)
            except (ValueError, KeyError):
                pass

        # Viewer/custom roles may only read invoices for tickets assigned to them.
        # They must supply ?ticket=<id> and be assigned to that ticket.
        ticket_id = params.get('ticket')
        if not self.is_manager_role() and self.user_role not in STAFF_ROLES:
            if not ticket_id:
                return self.get_service().list(  # return empty queryset safely
                    ticket_id=-1,
                    fiscal_year_start=fy_start,
                    fiscal_year_end=fy_end,
                )
            from tickets.models import Ticket
            try:
                ticket_obj = Ticket.objects.for_tenant(self.tenant).get(pk=ticket_id)
            except Ticket.DoesNotExist:
                from django.http import Http404
                raise Http404
            is_assigned = (
                ticket_obj.assigned_to_id == self.request.user.id or
                ticket_obj.team_members.filter(id=self.request.user.id).exists()
            )
            if not is_assigned:
                return self.get_service().list(ticket_id=-1)  # empty

        return self.get_service().list(
            status=params.get('status'),
            finance_status=params.get('finance_status'),
            customer_id=params.get('customer'),
            ticket_id=ticket_id,
            fiscal_year_start=fy_start,
            fiscal_year_end=fy_end,
        )

    # ── Custom actions ────────────────────────────────────────────────────────

    @action(detail=True, methods=['post'], url_path='issue')
    def issue(self, request, pk=None):
        """POST /invoices/{id}/issue/ — move draft invoice to issued status."""
        inv = self.get_object()
        inv = self.get_service().issue(inv)
        return ApiResponse.success(data=InvoiceSerializer(inv).data)

    @action(detail=False, methods=['post'], url_path='generate')
    def generate(self, request):
        """POST /invoices/generate/ — create and immediately issue an invoice."""
        s = self.get_input_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        inv = self.get_service().generate_issued(s.validated_data)
        return ApiResponse.created(data=InvoiceSerializer(inv).data)

    @action(detail=False, methods=['post'], url_path='generate-from-ticket')
    def generate_from_ticket(self, request):
        """POST /invoices/generate-from-ticket/ — build invoice from ticket products.

        Optional body field:
          service_charge: decimal — overrides / sets the ticket's service charge before
                          generating. If omitted, the existing value on the ticket is used.
        """
        ticket_id = request.data.get('ticket')
        service_charge = request.data.get('service_charge')  # None if not sent
        inv = self.get_service().invoice_from_ticket(
            ticket_id=ticket_id,
            due_date=request.data.get('due_date'),
            notes=request.data.get('notes', ''),
            service_charge=service_charge,
        )
        return ApiResponse.created(data=InvoiceSerializer(inv).data)

    @action(detail=True, methods=['post'], url_path='mark-paid')
    def mark_paid(self, request, pk=None):
        """
        POST /invoices/{id}/mark-paid/
        Mark an issued invoice as paid.
        Body: { "method": "cash"|"bank_transfer"|..., "bank_account": <id> }
        """
        inv = self.get_object()
        inv, payment = self.get_service().mark_paid(
            inv,
            method=request.data.get('method', Payment.METHOD_CASH),
            bank_account_id=request.data.get('bank_account'),
        )
        return ApiResponse.success(data={
            'invoice': InvoiceSerializer(inv).data,
            'payment': PaymentSerializer(payment).data if payment else None,
        })

    @action(detail=True, methods=['post'], url_path='void')
    def void_invoice(self, request, pk=None):
        """POST /invoices/{id}/void/ — void a non-paid invoice."""
        inv = self.get_object()
        inv = self.get_service().void(inv)
        return ApiResponse.success(data=InvoiceSerializer(inv).data)

    @action(detail=True, methods=['post'], url_path='collect-payment')
    def collect_payment(self, request, pk=None):
        """
        POST /invoices/{id}/collect-payment/
        Staff records customer payment on-site.
        Body: { method, amount, bank_account (optional), reference (optional), notes (optional) }
        """
        inv = self.get_object()
        inv = self.get_service().collect_payment(
            inv,
            method=request.data.get('method'),
            amount=request.data.get('amount'),
            bank_account_id=request.data.get('bank_account'),
            reference=request.data.get('reference', ''),
            notes=request.data.get('notes', ''),
        )
        return ApiResponse.success(data=InvoiceSerializer(inv).data)

    @action(detail=True, methods=['post'], url_path='finance-review')
    def finance_review(self, request, pk=None):
        """
        POST /invoices/{id}/finance-review/
        Finance approves or rejects a submitted invoice.
        Body: { "action": "approve"|"reject", "notes": "..." }
        """
        inv = self.get_object()
        inv = self.get_service().finance_review(
            inv,
            action=request.data.get('action'),
            notes=request.data.get('notes', ''),
        )
        return ApiResponse.success(data=InvoiceSerializer(inv).data)

    @action(detail=True, methods=['get'], url_path='pdf')
    def pdf(self, request, pk=None):
        """GET /invoices/{id}/pdf/ — download invoice as PDF."""
        inv = self.get_object()
        pdf_bytes = self.get_service().get_pdf_bytes(inv)
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = (
            f'attachment; filename="Invoice-{inv.invoice_number}.pdf"'
        )
        return response

    @action(detail=True, methods=['post'], url_path='send')
    def send_invoice(self, request, pk=None):
        """POST /invoices/{id}/send/ — email PDF invoice to customer."""
        inv = self.get_object()
        self.get_service().send_email(inv)  # raises ServiceUnavailableError → 503
        return ApiResponse.success(message='Invoice sent successfully.')


# ─────────────────────────────────────────────────────────────────────────────
# Quotations
# ─────────────────────────────────────────────────────────────────────────────

class QuotationViewSet(NexusViewSet):
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
            return [permissions.IsAuthenticated(), make_role_permission(*STAFF_ROLES, permission_key='accounting.view_invoices')()]
        return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES, permission_key='accounting.manage_invoices')()]

    def get_queryset(self):
        self.ensure_tenant()
        qs = Quotation.objects.filter(tenant=self.tenant).select_related('customer')
        if s := self.request.query_params.get('status'):
            qs = qs.filter(status=s)
        if cid := self.request.query_params.get('customer'):
            qs = qs.filter(customer_id=cid)
        if fy_raw := self.request.query_params.get('fiscal_year'):
            try:
                from core.nepali_date import fiscal_year_date_range, FiscalYear
                fy = FiscalYear(bs_year=int(fy_raw))
                start_ad, end_ad = fiscal_year_date_range(fy)
                qs = qs.filter(created_at__date__gte=start_ad, created_at__date__lte=end_ad)
            except (ValueError, KeyError):
                pass
        return qs.order_by('-created_at')

    def _compute_and_save(self, serializer):
        from .services.invoice_service import compute_invoice_totals
        t          = self.tenant
        existing   = serializer.instance
        line_items = serializer.validated_data.get(
            'line_items', existing.line_items if existing else [],
        )
        discount = serializer.validated_data.get(
            'discount', existing.discount if existing else Decimal('0'),
        )
        vat_rate = t.vat_rate if t.vat_enabled else Decimal('0')
        subtotal, vat_amount, total = compute_invoice_totals(line_items, discount, vat_rate)
        serializer.save(
            tenant=t, created_by=self.request.user,
            subtotal=subtotal, vat_rate=vat_rate, vat_amount=vat_amount, total=total,
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self._compute_and_save(serializer)
        return ApiResponse.created(data=self.get_serializer(serializer.instance).data)

    def update(self, request, *args, **kwargs):
        partial  = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self._compute_and_save(serializer)
        return ApiResponse.success(data=self.get_serializer(serializer.instance).data)

    @action(detail=True, methods=['post'], url_path='send')
    def send(self, request, pk=None):
        quo = self.get_object()
        if quo.status != Quotation.STATUS_DRAFT:
            raise ConflictError('Only draft quotations can be sent.')
        quo.status  = Quotation.STATUS_SENT
        quo.sent_at = timezone.now()
        quo.save(update_fields=['status', 'sent_at'])
        return ApiResponse.success(data=QuotationSerializer(quo).data)

    @action(detail=True, methods=['post'], url_path='accept')
    def accept(self, request, pk=None):
        quo = self.get_object()
        if quo.status not in (Quotation.STATUS_SENT, Quotation.STATUS_DRAFT):
            raise ConflictError('Quotation cannot be accepted in its current state.')
        quo.status      = Quotation.STATUS_ACCEPTED
        quo.accepted_at = timezone.now()
        quo.save(update_fields=['status', 'accepted_at'])
        return ApiResponse.success(data=QuotationSerializer(quo).data)

    @action(detail=True, methods=['post'], url_path='decline')
    def decline(self, request, pk=None):
        quo = self.get_object()
        if quo.status in (Quotation.STATUS_DECLINED, Quotation.STATUS_EXPIRED):
            raise ConflictError('Already declined/expired.')
        quo.status = Quotation.STATUS_DECLINED
        quo.save(update_fields=['status'])
        return ApiResponse.success(data=QuotationSerializer(quo).data)

    @action(detail=True, methods=['post'], url_path='convert')
    def convert(self, request, pk=None):
        """Convert an accepted quotation into a full Invoice."""
        quo = self.get_object()
        if quo.status != Quotation.STATUS_ACCEPTED:
            raise ConflictError('Quotation must be accepted before converting.')
        if quo.converted_invoice_id:
            raise ConflictError('Already converted.')
        from .services.invoice_service import compute_invoice_totals
        t        = self.tenant
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
        return ApiResponse.created(data=QuotationSerializer(quo).data)


# ─────────────────────────────────────────────────────────────────────────────
# Debit Notes
# ─────────────────────────────────────────────────────────────────────────────

class DebitNoteViewSet(NexusViewSet):
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
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES, permission_key='accounting.view_invoices')()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES, permission_key='accounting.manage_invoices')()]

    def get_queryset(self):
        self.ensure_tenant()
        qs = DebitNote.objects.filter(tenant=self.tenant).select_related('bill')
        if s := self.request.query_params.get('status'):
            qs = qs.filter(status=s)
        if fy_raw := self.request.query_params.get('fiscal_year'):
            try:
                from core.nepali_date import fiscal_year_date_range, FiscalYear
                fy = FiscalYear(bs_year=int(fy_raw))
                start_ad, end_ad = fiscal_year_date_range(fy)
                qs = qs.filter(created_at__date__gte=start_ad, created_at__date__lte=end_ad)
            except (ValueError, KeyError):
                pass
        return qs.order_by('-created_at')

    def _compute_totals(self, serializer):
        from .services.invoice_service import compute_invoice_totals
        vat_rate   = self.tenant.vat_rate if self.tenant.vat_enabled else Decimal('0')
        line_items = serializer.validated_data.get('line_items', [])
        subtotal, vat_amount, total = compute_invoice_totals(line_items, Decimal('0'), vat_rate)
        serializer.save(tenant=self.tenant, created_by=self.request.user,
                        subtotal=subtotal, vat_amount=vat_amount, total=total)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self._compute_totals(serializer)
        return ApiResponse.created(data=self.get_serializer(serializer.instance).data)

    @action(detail=True, methods=['post'], url_path='issue')
    def issue(self, request, pk=None):
        dn = self.get_object()
        if dn.status != DebitNote.STATUS_DRAFT:
            raise ConflictError('Only draft debit notes can be issued.')
        dn.status    = DebitNote.STATUS_ISSUED
        dn.issued_at = timezone.now()
        dn.save(update_fields=['status', 'issued_at'])
        # Signal in signals.py will create the reversal journal entry
        return ApiResponse.success(data=DebitNoteSerializer(dn).data)

    @action(detail=True, methods=['post'], url_path='void')
    def void(self, request, pk=None):
        dn = self.get_object()
        if dn.status == DebitNote.STATUS_VOID:
            raise ConflictError('Already voided.')
        dn.status = DebitNote.STATUS_VOID
        dn.save(update_fields=['status'])
        return ApiResponse.success(data=DebitNoteSerializer(dn).data)


# ─────────────────────────────────────────────────────────────────────────────
# TDS Entries
# ─────────────────────────────────────────────────────────────────────────────

class TDSEntryViewSet(NexusViewSet):
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
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES, permission_key='accounting.view_invoices')()]
        if self.action in ('update', 'partial_update'):
            # Allow admins to correct TDS entries (supplier name, PAN, rate, period)
            return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES, permission_key='accounting.manage_invoices')()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES, permission_key='accounting.manage_invoices')()]

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status == TDSEntry.STATUS_DEPOSITED:
            raise AppValidationError('Cannot edit a deposited TDS entry.')
        partial = kwargs.pop('partial', False)
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return ApiResponse.success(data=self.get_serializer(serializer.instance).data)

    @action(detail=True, methods=['post'], url_path='mark-deposited')
    def mark_deposited(self, request, pk=None):
        entry = self.get_object()
        if entry.status == TDSEntry.STATUS_DEPOSITED:
            raise ConflictError('Already deposited.')
        entry.status            = TDSEntry.STATUS_DEPOSITED
        entry.deposited_at      = timezone.now()
        entry.deposit_reference = request.data.get('deposit_reference', '')
        entry.save(update_fields=['status', 'deposited_at', 'deposit_reference'])
        return ApiResponse.success(data=TDSEntrySerializer(entry).data)

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
        return ApiResponse.success(data=list(rows))


# ─────────────────────────────────────────────────────────────────────────────
# Bank Reconciliation
# ─────────────────────────────────────────────────────────────────────────────

class BankReconciliationViewSet(NexusViewSet):
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
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES, permission_key='accounting.view_invoices')()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES, permission_key='accounting.manage_invoices')()]

    def get_queryset(self):
        self.ensure_tenant()
        qs = BankReconciliation.objects.filter(tenant=self.tenant).select_related('bank_account')
        if bid := self.request.query_params.get('bank_account'):
            qs = qs.filter(bank_account_id=bid)
        return qs.order_by('-statement_date')

    @action(detail=True, methods=['post'], url_path='add-line')
    def add_line(self, request, pk=None):
        rec = self.get_object()
        if rec.status == BankReconciliation.STATUS_RECONCILED:
            raise ConflictError('Reconciliation is locked.')
        ser = BankReconciliationLineSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save(reconciliation=rec)
        return ApiResponse.created(data=ser.data)

    @action(detail=True, methods=['post'], url_path='match-line')
    def match_line(self, request, pk=None):
        """Body: {"line_id": int, "payment_id": int}"""
        rec = self.get_object()
        try:
            line    = rec.lines.get(pk=request.data['line_id'])
            payment = Payment.objects.get(pk=request.data['payment_id'], tenant=self.tenant)
        except (BankReconciliationLine.DoesNotExist, Payment.DoesNotExist, KeyError):
            raise AppValidationError('Line or payment not found.')
        line.is_matched = True
        line.payment    = payment
        line.save(update_fields=['is_matched', 'payment'])
        return ApiResponse.success(data=BankReconciliationLineSerializer(line).data)

    @action(detail=True, methods=['post'], url_path='unmatch-line')
    def unmatch_line(self, request, pk=None):
        rec = self.get_object()
        try:
            line = rec.lines.get(pk=request.data['line_id'])
        except (BankReconciliationLine.DoesNotExist, KeyError):
            raise AppValidationError('Line not found.')
        line.is_matched = False
        line.payment    = None
        line.save(update_fields=['is_matched', 'payment'])
        return ApiResponse.success(data=BankReconciliationLineSerializer(line).data)

    @action(detail=True, methods=['post'], url_path='reconcile')
    def reconcile(self, request, pk=None):
        """Lock the reconciliation. Fails if difference != 0."""
        rec = self.get_object()
        if rec.status == BankReconciliation.STATUS_RECONCILED:
            raise ConflictError('Already reconciled.')
        if rec.difference != 0:
            raise ConflictError(
                f'Unmatched difference of {rec.difference}. All lines must be matched.'
            )
        rec.status        = BankReconciliation.STATUS_RECONCILED
        rec.reconciled_at = timezone.now()
        rec.save(update_fields=['status', 'reconciled_at'])
        return ApiResponse.success(data=BankReconciliationSerializer(rec).data)


# ─────────────────────────────────────────────────────────────────────────────
# Recurring Journals
# ─────────────────────────────────────────────────────────────────────────────

class RecurringJournalViewSet(NexusViewSet):
    """
    Recurring journal entry templates.

    POST /recurring-journals/{id}/run/ — manually trigger one run now
    """

    queryset         = RecurringJournal.objects.all()
    serializer_class = RecurringJournalSerializer
    required_module  = 'accounting'

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES, permission_key='accounting.view_invoices')()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES, permission_key='accounting.manage_invoices')()]

    def get_queryset(self):
        self.ensure_tenant()
        qs = RecurringJournal.objects.filter(tenant=self.tenant)
        if request_active := self.request.query_params.get('active'):
            qs = qs.filter(is_active=request_active.lower() == 'true')
        return qs.order_by('next_date')

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        obj = serializer.save(tenant=self.tenant, created_by=self.request.user)
        # Ensure next_date defaults to start_date if not provided
        if not obj.next_date:
            obj.next_date = obj.start_date
            obj.save(update_fields=['next_date'])
        return ApiResponse.created(data=self.get_serializer(obj).data)

    @action(detail=True, methods=['post'], url_path='run')
    def run_now(self, request, pk=None):
        """Manually execute this recurring template right now."""
        from .services.journal_service import run_recurring_journal
        rec = self.get_object()
        try:
            entry = run_recurring_journal(rec, triggered_by=request.user)
        except ValueError as exc:
            raise AppValidationError(str(exc))
        return ApiResponse.created(data=JournalEntrySerializer(entry).data)


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
        return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES, permission_key='accounting.manage_invoices')()]

    def create(self, request):
        self.ensure_tenant()
        from decimal import InvalidOperation
        try:
            amount = Decimal(str(request.data.get('amount', '0')))
        except (InvalidOperation, TypeError):
            raise AppValidationError('amount must be a valid decimal number.')

        period = request.data.get('period', '')
        if not period:
            raise AppValidationError('period is required (e.g. "2081-04").')

        from .services.journal_service import record_vat_remittance
        try:
            entry = record_vat_remittance(self.tenant, amount, period, created_by=request.user)
        except ValueError as exc:
            raise AppValidationError(str(exc))

        from .serializers import JournalEntrySerializer
        return ApiResponse.created(data={'journal_entry': JournalEntrySerializer(entry).data})


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
        return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES, permission_key='accounting.manage_invoices')()]

    def create(self, request):
        self.ensure_tenant()
        from decimal import InvalidOperation
        try:
            amount = Decimal(str(request.data.get('amount', '0')))
        except (InvalidOperation, TypeError):
            raise AppValidationError('amount must be a valid decimal number.')

        period = request.data.get('period', '')
        if not period:
            raise AppValidationError('period is required (e.g. "2081-04").')

        from .services.journal_service import record_tds_remittance
        try:
            entry = record_tds_remittance(self.tenant, amount, period, created_by=request.user)
        except ValueError as exc:
            raise AppValidationError(str(exc))

        from .serializers import JournalEntrySerializer
        return ApiResponse.created(data={'journal_entry': JournalEntrySerializer(entry).data})


# ─────────────────────────────────────────────────────────────────────────────
# Expenses  (internal operating expenses)
# ─────────────────────────────────────────────────────────────────────────────

class ExpenseViewSet(NexusViewSet):
    """
    Internal operating expense management (travel, office supplies, utilities, etc.).
    Distinct from Bills which are supplier invoices.

    POST /expenses/                 — create draft expense
    PUT  /expenses/{id}/            — update draft expense
    DELETE /expenses/{id}/          — delete draft expense
    POST /expenses/{id}/approve/    — approve (manager+)
    POST /expenses/{id}/reject/     — reject (manager+), body: { "note": "..." }
    POST /expenses/{id}/post/       — post approved expense to double-entry ledger (admin+)
    """

    from accounting.models import Expense as _Expense
    queryset         = _Expense.objects.none()
    required_module  = 'accounting'

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*STAFF_ROLES, permission_key='accounting.view_invoices')()]
        if self.action in ('create', 'update', 'partial_update'):
            return [permissions.IsAuthenticated(), make_role_permission(*STAFF_ROLES, permission_key='accounting.manage_invoices')()]
        if self.action in ('approve', 'reject'):
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES, permission_key='accounting.manage_invoices')()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES, permission_key='accounting.manage_invoices')()]

    def _get_service(self):
        from accounting.services.expense_service import ExpenseService
        return ExpenseService(tenant=self.tenant, user=self.request.user)

    def get_queryset(self):
        from accounting.models import Expense
        self.ensure_tenant()
        params = self.request.query_params
        svc = self._get_service()
        return svc.list(
            status=params.get('status'),
            category=params.get('category'),
            date_from=params.get('date_from'),
            date_to=params.get('date_to'),
        )

    def get_serializer_class(self):
        from accounting.serializers import ExpenseSerializer, ExpenseWriteSerializer
        if self.action in ('create', 'update', 'partial_update'):
            return ExpenseWriteSerializer
        return ExpenseSerializer

    def create(self, request, *args, **kwargs):
        from accounting.serializers import ExpenseSerializer, ExpenseWriteSerializer
        self.ensure_tenant()
        serializer = ExpenseWriteSerializer(
            data=request.data, context=self.get_serializer_context()
        )
        serializer.is_valid(raise_exception=True)
        expense = self._get_service().create(serializer.validated_data)
        return ApiResponse.created(data=ExpenseSerializer(expense).data)

    def update(self, request, *args, **kwargs):
        from accounting.serializers import ExpenseSerializer, ExpenseWriteSerializer
        partial  = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = ExpenseWriteSerializer(
            instance, data=request.data, partial=partial,
            context=self.get_serializer_context(),
        )
        serializer.is_valid(raise_exception=True)
        expense = self._get_service().update(instance, serializer.validated_data)
        return ApiResponse.success(data=ExpenseSerializer(expense).data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self._get_service().delete(instance)
        return ApiResponse.no_content()

    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        """POST /expenses/{id}/approve/ — manager approves a draft expense."""
        expense = self.get_object()
        expense = self._get_service().approve(expense)
        from accounting.serializers import ExpenseSerializer
        return ApiResponse.success(data=ExpenseSerializer(expense).data)

    @action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request, pk=None):
        """POST /expenses/{id}/reject/ — reject with optional note."""
        expense = self.get_object()
        expense = self._get_service().reject(expense, note=request.data.get('note', ''))
        from accounting.serializers import ExpenseSerializer
        return ApiResponse.success(data=ExpenseSerializer(expense).data)

    @action(detail=True, methods=['post'], url_path='post')
    def post_expense(self, request, pk=None):
        """POST /expenses/{id}/post/ — post approved expense to double-entry ledger."""
        expense = self.get_object()
        try:
            expense = self._get_service().post(expense)
        except (ConflictError, AppValidationError):
            raise
        from accounting.serializers import ExpenseSerializer
        return ApiResponse.success(data=ExpenseSerializer(expense).data)
