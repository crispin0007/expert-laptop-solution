"""
accounting/services/coin_service.py

All business logic for CoinTransaction — the approval queue and manual award.

Rules
-----
- State transitions (approve / reject / award) go through methods here.
- Raise core.exceptions.AppException subclasses — never return Response objects.
- Never read request.* here — receive plain data from views.
- All DB writes touching multiple rows use @transaction.atomic.
"""
import logging
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Sum

from core.exceptions import NotFoundError, ValidationError, CoinApprovalError, ForbiddenError

logger = logging.getLogger(__name__)
User = get_user_model()


class CoinService:
    """Business logic for CoinTransaction lifecycle."""

    def __init__(self, tenant, user=None):
        self.tenant = tenant
        self.user = user

    # ── Queries ───────────────────────────────────────────────────────────────

    def list(
        self,
        status=None,
        staff_id=None,
        source_type=None,
        fiscal_year_start=None,
        fiscal_year_end=None,
        requesting_user=None,
        is_manager: bool = False,
    ):
        """
        Return filtered, tenant-scoped CoinTransaction queryset.

        Non-managers can only see their own transactions unless staff_id is
        explicitly provided (in which case the view permission layer already
        blocked non-managers from querying other staff).
        """
        from accounting.models import CoinTransaction
        qs = (
            CoinTransaction.objects
            .filter(tenant=self.tenant)
            .select_related('staff', 'approved_by')
        )
        if status:
            qs = qs.filter(status=status)
        if source_type:
            qs = qs.filter(source_type=source_type)
        if staff_id:
            qs = qs.filter(staff_id=staff_id)
        elif not is_manager and requesting_user is not None:
            # Non-managers see only their own coins when no staff filter is given
            qs = qs.filter(staff=requesting_user)
        if fiscal_year_start and fiscal_year_end:
            qs = qs.filter(
                created_at__date__gte=fiscal_year_start,
                created_at__date__lte=fiscal_year_end,
            )
        return qs.order_by('-created_at')

    def pending(self):
        """All pending CoinTransactions for this tenant, newest first."""
        from accounting.models import CoinTransaction
        return (
            CoinTransaction.objects
            .filter(tenant=self.tenant, status=CoinTransaction.STATUS_PENDING)
            .select_related('staff', 'approved_by')
            .order_by('-created_at')
        )

    def staff_history(self, staff_id: int):
        """
        All CoinTransactions for a specific staff member with aggregated totals.

        Returns a dict: { qs, approved_total, pending_total, coin_rate }.
        """
        from accounting.models import CoinTransaction
        qs = (
            CoinTransaction.objects
            .filter(tenant=self.tenant, staff_id=staff_id)
            .select_related('staff', 'approved_by')
            .order_by('-created_at')
        )
        approved = (
            qs.filter(status=CoinTransaction.STATUS_APPROVED)
            .aggregate(t=Sum('amount'))['t'] or Decimal('0')
        )
        pending = (
            qs.filter(status=CoinTransaction.STATUS_PENDING)
            .aggregate(t=Sum('amount'))['t'] or Decimal('0')
        )
        rate = (self.tenant.coin_to_money_rate or Decimal('1')) if self.tenant else Decimal('1')
        return {
            'queryset': qs,
            'approved': approved,
            'pending': pending,
            'rate': rate,
        }

    # ── Create ────────────────────────────────────────────────────────────────

    def create(self, validated_data: dict):
        """Create a CoinTransaction with tenant + created_by injected."""
        from accounting.models import CoinTransaction
        ct = CoinTransaction.objects.create(
            tenant=self.tenant,
            created_by=self.user,
            **validated_data,
        )
        logger.info("CoinTransaction created id=%s tenant=%s", ct.pk, self.tenant.slug)
        return ct

    # ── State transitions ─────────────────────────────────────────────────────

    @transaction.atomic
    def approve(self, coin_txn):
        """Approve a pending CoinTransaction. Raises CoinApprovalError if not pending."""
        from accounting.models import CoinTransaction
        if coin_txn.status != CoinTransaction.STATUS_PENDING:
            raise CoinApprovalError('Only pending transactions can be approved.')
        coin_txn.status      = CoinTransaction.STATUS_APPROVED
        coin_txn.approved_by = self.user
        coin_txn.save(update_fields=['status', 'approved_by', 'updated_at'])
        logger.info("CoinTransaction %s approved by %s", coin_txn.pk, self.user)
        return coin_txn

    @transaction.atomic
    def reject(self, coin_txn, note: str = ''):
        """Reject a pending CoinTransaction. Raises CoinApprovalError if not pending."""
        from accounting.models import CoinTransaction
        if coin_txn.status != CoinTransaction.STATUS_PENDING:
            raise CoinApprovalError('Only pending transactions can be rejected.')
        coin_txn.status      = CoinTransaction.STATUS_REJECTED
        coin_txn.approved_by = self.user
        if note:
            coin_txn.note = note
        coin_txn.save(update_fields=['status', 'approved_by', 'note', 'updated_at'])
        logger.info("CoinTransaction %s rejected by %s", coin_txn.pk, self.user)
        return coin_txn

    @transaction.atomic
    def award(
        self,
        staff_id: int,
        amount,
        source_type: str = None,
        source_id=None,
        note: str = '',
    ):
        """
        Immediately award coins to a staff member (status=approved).

        Validates:
        - staff exists
        - staff is an active member of this tenant
        - amount is positive

        Returns the created CoinTransaction.
        """
        from accounting.models import CoinTransaction
        from accounts.models import TenantMembership

        try:
            amount = Decimal(str(amount))
            if amount <= 0:
                raise ValueError
        except (ValueError, TypeError):
            raise ValidationError('amount must be a positive number.')

        try:
            staff = User.objects.get(pk=staff_id)
        except User.DoesNotExist:
            raise NotFoundError('Staff not found.')

        if not TenantMembership.objects.filter(
            user=staff, tenant=self.tenant, is_active=True,
        ).exists():
            raise ForbiddenError('Staff member is not part of this workspace.')

        if source_type not in dict(CoinTransaction.SOURCE_TYPES):
            source_type = CoinTransaction.SOURCE_MANUAL

        # Prevent duplicate coin awards for the same ticket
        if source_type == CoinTransaction.SOURCE_TICKET and source_id:
            if CoinTransaction.objects.filter(
                tenant=self.tenant,
                source_type=CoinTransaction.SOURCE_TICKET,
                source_id=source_id,
            ).exists():
                raise ValidationError('Coins have already been recorded for this ticket.')

        ct = CoinTransaction.objects.create(
            tenant=self.tenant,
            created_by=self.user,
            staff=staff,
            amount=amount,
            source_type=source_type,
            source_id=source_id,
            status=CoinTransaction.STATUS_APPROVED,
            approved_by=self.user,
            note=note,
        )
        logger.info(
            "Coins awarded: %s to staff=%s by %s (tenant=%s)",
            amount, staff_id, self.user, self.tenant.slug,
        )
        return ct
