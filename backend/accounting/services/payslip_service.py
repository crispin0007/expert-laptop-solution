"""
accounting/services/payslip_service.py

All business logic for Payslip generation and lifecycle.

Rules
-----
- Raise core.exceptions.AppException subclasses — never return Response objects.
- Multi-step DB writes use @transaction.atomic.
- Never read request.* here — receive plain data from views.
"""
import logging
from datetime import date as dt
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from core.exceptions import NotFoundError, ValidationError, ForbiddenError, ConflictError

logger = logging.getLogger(__name__)
User = get_user_model()


class PayslipService:
    """Business logic for Payslip lifecycle."""

    def __init__(self, tenant, user=None):
        self.tenant = tenant
        self.user = user

    # ── Queries ───────────────────────────────────────────────────────────────

    def list(self, staff_id=None, fiscal_year_start=None, fiscal_year_end=None):
        """Return filtered, tenant-scoped Payslip queryset."""
        from accounting.models import Payslip
        qs = (
            Payslip.objects
            .filter(tenant=self.tenant)
            .select_related('staff', 'bank_account')
        )
        if staff_id:
            qs = qs.filter(staff_id=staff_id)
        if fiscal_year_start and fiscal_year_end:
            qs = qs.filter(
                period_start__gte=fiscal_year_start,
                period_start__lte=fiscal_year_end,
            )
        return qs.order_by('-period_end')

    # ── Create / update ───────────────────────────────────────────────────────

    def create(self, validated_data: dict):
        """Create a basic payslip (admin manually specified values)."""
        from accounting.models import Payslip
        payslip = Payslip.objects.create(
            tenant=self.tenant,
            created_by=self.user,
            **validated_data,
        )
        logger.info("Payslip created id=%s tenant=%s", payslip.pk, self.tenant.slug)
        return payslip

    def update(self, instance, validated_data: dict):
        """
        Update a draft payslip and recompute net_pay.

        net_pay = base_salary + bonus + gross_amount(coins) − tds_amount − deductions
        Only draft payslips can be edited.
        """
        from accounting.models import Payslip
        if instance.status != Payslip.STATUS_DRAFT:
            raise ConflictError('Only draft payslips can be edited.')

        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()

        instance.net_pay = (
            instance.base_salary + instance.bonus + instance.gross_amount
            - instance.tds_amount - instance.deductions
        )
        instance.save(update_fields=['net_pay'])
        return instance

    def delete(self, instance):
        """Hard delete (admin only, enforced by view permissions)."""
        instance.delete()

    # ── Generation ────────────────────────────────────────────────────────────

    @transaction.atomic
    def generate(
        self,
        staff_id: int,
        period_start,
        period_end,
        base_salary=None,
        bonus=None,
        tds_rate=None,
        deductions=None,
        employee_pan: str = '',
    ):
        """
        Auto-generate (or refresh) a payslip for a staff member by aggregating
        their approved CoinTransactions in the given pay period.

        - Falls back to StaffSalaryProfile defaults if individual params are omitted.
        - Idempotent: uses get_or_create so re-running updates an existing draft.
        - Auto-creates a TDSEntry if TDS rate > 0.

        Returns (payslip, created: bool).
        """
        from accounting.models import (
            CoinTransaction, Payslip, StaffSalaryProfile, TDSEntry,
        )
        from accounts.models import TenantMembership

        # ── Validate staff ────────────────────────────────────────────────────
        try:
            staff = User.objects.get(pk=staff_id)
        except User.DoesNotExist:
            raise NotFoundError('Staff not found.')

        membership = TenantMembership.objects.filter(
            user=staff, tenant=self.tenant, is_active=True,
        ).first()
        if not membership:
            raise ForbiddenError('Staff member is not part of this workspace.')
        # Auto-read employee PAN from membership when not explicitly provided (Bug 4)
        if not employee_pan:
            employee_pan = getattr(membership, 'pan_number', '') or ''

        # ── Parse dates ───────────────────────────────────────────────────────
        try:
            ps = dt.fromisoformat(str(period_start))
            pe = dt.fromisoformat(str(period_end))
        except ValueError:
            raise ValidationError('Invalid date format. Use YYYY-MM-DD.')

        # ── Load salary profile defaults ──────────────────────────────────────
        profile = StaffSalaryProfile.objects.filter(
            tenant=self.tenant, staff=staff
        ).first()
        profile_base  = profile.base_salary    if profile else Decimal('0')
        profile_bonus = profile.bonus_default  if profile else Decimal('0')
        profile_tds   = profile.tds_rate       if profile else Decimal('0')

        base         = Decimal(str(base_salary  if base_salary  is not None else profile_base)).quantize(Decimal('0.01'))
        bon          = Decimal(str(bonus        if bonus        is not None else profile_bonus)).quantize(Decimal('0.01'))
        tds_rate_dec = Decimal(str(tds_rate     if tds_rate     is not None else profile_tds)).quantize(Decimal('0.0001'))
        other_ded    = Decimal(str(deductions   if deductions   is not None else 0))

        # ── Aggregate approved coins for period ───────────────────────────────
        coins = (
            CoinTransaction.objects
            .filter(
                tenant=self.tenant, staff=staff,
                status=CoinTransaction.STATUS_APPROVED,
                created_at__date__gte=ps,
                created_at__date__lte=pe,
            )
            .aggregate(t=Sum('amount'))['t'] or Decimal('0')
        )
        rate  = (self.tenant.coin_to_money_rate or Decimal('1')) if self.tenant else Decimal('1')
        gross = (coins * rate).quantize(Decimal('0.01'))

        # TDS on base + bonus only (coin income not subject to salary TDS)
        tds_amount = Decimal('0')
        if tds_rate_dec > 0:
            tds_amount = ((base + bon) * tds_rate_dec).quantize(Decimal('0.01'))

        net = base + bon + gross - tds_amount - other_ded

        payslip, created = Payslip.objects.get_or_create(
            tenant=self.tenant,
            staff=staff,
            period_start=ps,
            period_end=pe,
            defaults={
                'total_coins':       coins,
                'coin_to_money_rate': rate,
                'gross_amount':      gross,
                'base_salary':       base,
                'bonus':             bon,
                'tds_amount':        tds_amount,
                'deductions':        other_ded,
                'net_pay':           net,
                'created_by':        self.user,
            },
        )
        if not created:
            if payslip.status != Payslip.STATUS_DRAFT:
                raise ConflictError(
                    f'A payslip for this period already exists with status '
                    f'"{payslip.status}". Cannot regenerate — void it first or '
                    f'adjust the period dates.'
                )
            payslip.total_coins        = coins
            payslip.coin_to_money_rate = rate
            payslip.gross_amount       = gross
            payslip.base_salary        = base
            payslip.bonus              = bon
            payslip.tds_amount         = tds_amount
            payslip.deductions         = other_ded
            payslip.net_pay            = net
            payslip.save()

        # ── Auto-create / replace TDSEntry for this salary ────────────────────
        if tds_rate_dec > 0 and tds_amount > 0:
            # Bug 1 fix: use BS calendar for period_month (not AD month)
            # Both month and year must be BS so the TDS tab period grouping matches
            # the bill TDS path which uses ad_to_bs() for period_month.
            from core.nepali_date import ad_to_bs
            bs_pe         = ad_to_bs(pe)
            nepali_month  = bs_pe.month
            nepali_year   = bs_pe.year
            staff_display = getattr(staff, 'full_name', '') or staff.email
            TDSEntry.objects.filter(
                tenant=self.tenant,
                supplier_name=staff_display,
                period_month=nepali_month,
                period_year=nepali_year,
            ).delete()
            TDSEntry.objects.create(
                tenant=self.tenant,
                supplier_name=staff_display,
                supplier_pan=employee_pan,
                taxable_amount=base + bon,
                tds_rate=tds_rate_dec,
                period_month=nepali_month,
                period_year=nepali_year,
                created_by=self.user,
            )

        logger.info(
            "Payslip %s (created=%s) for staff=%s period=%s–%s tenant=%s",
            payslip.pk, created, staff_id, ps, pe, self.tenant.slug,
        )
        try:
            from core.events import EventBus
            EventBus.publish('payroll.payslip.generated', {
                'id': payslip.pk,
                'tenant_id': self.tenant.id,
                'staff_id': staff_id,
                'net_pay': str(payslip.net_pay),
                'period_start': str(ps),
                'period_end': str(pe),
            }, tenant=self.tenant)
        except Exception as exc:
            logger.warning('EventBus.publish payroll.payslip.generated failed for payslip %s: %s', payslip.pk, exc, exc_info=True)
        return payslip, created

    # ── State transitions ─────────────────────────────────────────────────────

    @transaction.atomic
    def issue(self, payslip):
        """Move a draft payslip to issued. Raises ConflictError if not draft."""
        from accounting.models import Payslip
        # Re-fetch with row lock to prevent concurrent double-issue.
        payslip = Payslip.objects.select_for_update().get(pk=payslip.pk)
        if payslip.status != Payslip.STATUS_DRAFT:
            raise ConflictError('Only draft payslips can be issued.')
        payslip.status    = Payslip.STATUS_ISSUED
        payslip.issued_at = timezone.now()
        payslip.save(update_fields=['status', 'issued_at'])
        return payslip

    @transaction.atomic
    def mark_paid(self, payslip, payment_method: str, bank_account_id=None):
        """
        Mark an issued payslip as paid and record the salary outflow in Payments.

        Returns (payslip, Payment | None).
        """
        from accounting.models import BankAccount, Payslip
        from accounting.services.payment_service import record_payment

        # Re-fetch with row lock to prevent concurrent double-payment.
        payslip = Payslip.objects.select_for_update().get(pk=payslip.pk)
        if payslip.status != Payslip.STATUS_ISSUED:
            raise ConflictError('Only issued payslips can be marked as paid.')

        VALID_METHODS = ('cash', 'bank_transfer', 'cheque')
        if payment_method not in VALID_METHODS:
            raise ValidationError(f'payment_method must be one of: {VALID_METHODS}')

        bank_account = None
        if bank_account_id:
            try:
                bank_account = BankAccount.objects.get(
                    pk=bank_account_id, tenant=self.tenant
                )
            except BankAccount.DoesNotExist:
                raise NotFoundError('Bank account not found.')

        if payment_method == 'bank_transfer' and not bank_account:
            raise ValidationError('bank_account is required for bank transfer.')

        payment = None
        if payslip.net_pay > Decimal('0'):
            staff_label  = getattr(payslip.staff, 'full_name', '') or payslip.staff.email
            period_label = f"{payslip.period_start}–{payslip.period_end}"
            payment = record_payment(
                tenant=self.tenant,
                created_by=self.user,
                payment_type='outgoing',
                method=payment_method,
                amount=payslip.net_pay,
                date=timezone.localdate(),
                bank_account=bank_account,
                reference=f'PAYSLIP-{payslip.pk}',
                notes=f'Salary payment to {staff_label} for {period_label}',
            )

        payslip.status         = Payslip.STATUS_PAID
        payslip.paid_at        = timezone.now()
        payslip.payment_method = payment_method
        payslip.bank_account   = bank_account
        payslip.save(update_fields=['status', 'paid_at', 'payment_method', 'bank_account'])

        logger.info("Payslip %s marked paid. payment=%s", payslip.pk, payment and payment.pk)
        try:
            from core.events import EventBus
            EventBus.publish('payroll.processed', {
                'id': payslip.pk,
                'tenant_id': self.tenant.id,
                'staff_id': payslip.staff_id,
                'net_pay': str(payslip.net_pay),
            }, tenant=self.tenant)
        except Exception as exc:
            logger.warning('EventBus.publish payroll.processed failed for payslip %s: %s', payslip.pk, exc, exc_info=True)
        return payslip, payment
