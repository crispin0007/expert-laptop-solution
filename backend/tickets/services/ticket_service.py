"""
tickets/services/ticket_service.py

Single source of truth for all ticket business logic.

Rules
-----
- All ticket state transitions go through methods here.
- Raise core.exceptions.AppException subclasses — never raise bare Exception
  or return Response objects.
- Multi-step DB writes are wrapped in @transaction.atomic.
- All data access uses self.repo (TicketRepository) where possible.
- Never read request.* here — receive plain data from views.

Instantiated per-request by NexusViewSet.get_service():

    service = TicketService(tenant=request.tenant, user=request.user)
"""
import logging
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from core.exceptions import (
    NotFoundError, ForbiddenError, ValidationError,
    TicketStateError, ConflictError,
)
from tickets.repositories import TicketRepository

logger = logging.getLogger(__name__)
User = get_user_model()


def _user_display(user) -> str:
    """Return human-readable name for timeline descriptions."""
    return user.get_full_name() or user.email if user else "System"


class TicketService:
    """All business logic for Ticket lifecycle."""

    def __init__(self, tenant, user=None):
        self.tenant = tenant
        self.user = user
        self.repo = TicketRepository(tenant=tenant)

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _is_locked(self, ticket) -> bool:
        """Return True when the ticket is in a terminal state."""
        from tickets.models import Ticket
        return ticket.status in (
            Ticket.STATUS_RESOLVED,
            Ticket.STATUS_CLOSED,
            Ticket.STATUS_CANCELLED,
        )

    def _build_auto_title(self, validated_data: dict) -> str:
        """Derive a title from category + subcategory when the caller omits one."""
        category    = validated_data.get('category')
        subcategory = validated_data.get('subcategory')
        if category and subcategory:
            return f"{category.name} — {subcategory.name}"
        if category:
            return f"{category.name} Request"
        ticket_type = validated_data.get('ticket_type')
        if ticket_type:
            return f"{ticket_type.name} Ticket"
        return "Support Request"

    # ── Queries ───────────────────────────────────────────────────────────────

    def list(
        self,
        status=None,
        priority=None,
        assigned_to_id=None,
        department_id=None,
        customer_id=None,
        fiscal_year_start=None,
        fiscal_year_end=None,
    ):
        """Return filtered, tenant-scoped ticket queryset."""
        return self.repo.list(
            status=status,
            priority=priority,
            assigned_to_id=assigned_to_id,
            department_id=department_id,
            customer_id=customer_id,
            fiscal_year_start=fiscal_year_start,
            fiscal_year_end=fiscal_year_end,
        )

    def get_timeline(self, ticket):
        """Full chronological event log for a ticket."""
        from tickets.models import TicketTimeline
        return (
            TicketTimeline.objects
            .filter(ticket=ticket)
            .select_related('actor')
        )

    def sla_breached(self):
        """All currently breached SLA records for this tenant."""
        return self.repo.sla_breached()

    def sla_warning(self, warning_hours: int = 6):
        """SLA records that will breach within ``warning_hours``."""
        return self.repo.sla_warning(warning_hours=warning_hours)

    def suggest_title(self, category_id=None, subcategory_id=None) -> str:
        """Suggest a ticket title from category + subcategory."""
        from tickets.models import TicketCategory, TicketSubCategory
        cat_name = sub_name = ''
        if category_id:
            try:
                cat_name = TicketCategory.objects.get(
                    pk=category_id, tenant=self.tenant
                ).name
            except TicketCategory.DoesNotExist:
                pass
        if subcategory_id:
            try:
                sub_name = TicketSubCategory.objects.get(
                    pk=subcategory_id, tenant=self.tenant
                ).name
            except TicketSubCategory.DoesNotExist:
                pass
        if cat_name and sub_name:
            return f"{cat_name} — {sub_name}"
        if cat_name:
            return f"{cat_name} Request"
        return "Support Request"

    # ── Create / update / delete ──────────────────────────────────────────────

    @transaction.atomic
    def create(self, validated_data: dict):
        """
        Create a Ticket with SLA record and opening timeline entry.
        Mirrors TicketCreateSerializer.create() but uses self.tenant / self.user
        instead of serializer context — keeps all creation logic in the service.
        """
        from tickets.models import Ticket, TicketSLA, TicketTimeline

        team_members = validated_data.pop('team_members', [])
        vehicles     = validated_data.pop('vehicles', [])

        # Auto-generate title when caller omits or blanks it
        if not validated_data.get('title', '').strip():
            validated_data['title'] = self._build_auto_title(validated_data)

        ticket_type  = validated_data.get('ticket_type')
        sla_hours    = ticket_type.default_sla_hours if ticket_type else 24
        sla_deadline = timezone.now() + timezone.timedelta(hours=sla_hours)

        ticket = Ticket.objects.create(
            tenant=self.tenant,
            created_by=self.user,
            sla_deadline=sla_deadline,
            **validated_data,
        )

        TicketSLA.objects.create(
            tenant=self.tenant,
            ticket=ticket,
            sla_hours=sla_hours,
            breach_at=sla_deadline,
            created_by=self.user,
        )

        TicketTimeline.objects.create(
            tenant=self.tenant,
            ticket=ticket,
            event_type=TicketTimeline.EVENT_CREATED,
            description=f"Ticket created by {_user_display(self.user)}",
            actor=self.user,
            created_by=self.user,
        )

        if team_members:
            ticket.team_members.set(team_members)
        if vehicles:
            ticket.vehicles.set(vehicles)

        logger.info("Ticket created id=%s tenant=%s", ticket.pk, self.tenant.slug)
        return ticket

    @transaction.atomic
    def update(self, instance, validated_data: dict, is_manager: bool = False):
        """
        Update ticket fields.
        Staff cannot edit locked (resolved / closed / cancelled) tickets.
        """
        if self._is_locked(instance) and not is_manager:
            raise TicketStateError(
                'This ticket is locked. Only a manager or admin can modify it.'
            )
        team_members = validated_data.pop('team_members', None)
        vehicles     = validated_data.pop('vehicles', None)

        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()

        if team_members is not None:
            instance.team_members.set(team_members)
        if vehicles is not None:
            instance.vehicles.set(vehicles)

        return instance

    def delete(self, instance):
        """Soft-delete a ticket (is_deleted + deleted_at) — no hard removal."""
        instance.is_deleted = True
        instance.deleted_at = timezone.now()
        instance.save(update_fields=['is_deleted', 'deleted_at', 'updated_at'])

    # ── State transitions ─────────────────────────────────────────────────────

    @transaction.atomic
    def assign(self, ticket, user_id=None, team_member_ids=None, actor=None):
        """
        Assign a primary user and/or co-assignees to a ticket.

        Validates that all users are active members of this tenant.
        Raises NotFoundError / ValidationError on bad input.
        Returns the updated ticket instance.
        """
        from accounts.models import TenantMembership
        from tickets.models import TicketTimeline

        team_member_ids = team_member_ids or []

        if not user_id and not team_member_ids:
            raise ValidationError(
                'Provide user_id (primary) and/or team_member_ids (co-assignees).'
            )

        # ── primary assignee ──────────────────────────────────────────────────
        if user_id:
            try:
                assignee = User.objects.get(pk=user_id)
            except User.DoesNotExist:
                raise NotFoundError(f'User {user_id} not found.')

            if not TenantMembership.objects.filter(
                user=assignee, tenant=self.tenant, is_active=True,
            ).exists():
                raise ValidationError(
                    'Assignee is not an active member of this workspace.'
                )

            from tickets.models import Ticket
            old_assignee   = ticket.assigned_to
            ticket.assigned_to = assignee
            if ticket.status == Ticket.STATUS_OPEN:
                ticket.status = Ticket.STATUS_IN_PROGRESS
            ticket.save(update_fields=['assigned_to', 'status', 'updated_at'])

            TicketTimeline.objects.create(
                tenant=ticket.tenant,
                ticket=ticket,
                event_type=TicketTimeline.EVENT_ASSIGNED,
                description=f"Assigned to {_user_display(assignee)}",
                actor=actor,
                created_by=actor,
                metadata={
                    'from': old_assignee.pk if old_assignee else None,
                    'to': assignee.pk,
                },
            )

            # Email notification — async preferred, sync fallback
            try:
                from notifications.tasks import task_send_ticket_assigned
                task_send_ticket_assigned.delay(
                    ticket_id=ticket.pk, assignee_id=assignee.pk
                )
            except Exception:
                try:
                    from notifications.email import send_ticket_assigned
                    send_ticket_assigned(ticket, assignee)
                except Exception as _e:
                    logger.warning(
                        'Ticket assignment email failed for ticket %s assignee %s: %s',
                        ticket.pk, assignee.pk, _e,
                    )

        # ── co-assignees (team members) ────────────────────────────────────────
        if team_member_ids:
            team_qs   = User.objects.filter(pk__in=team_member_ids)
            found_ids = set(team_qs.values_list('pk', flat=True))
            missing   = [i for i in team_member_ids if i not in found_ids]
            if missing:
                raise NotFoundError(f'Users not found: {missing}')

            member_ids_in_tenant = set(
                TenantMembership.objects.filter(
                    user__in=team_qs, tenant=self.tenant, is_active=True,
                ).values_list('user_id', flat=True)
            )
            not_members = [i for i in found_ids if i not in member_ids_in_tenant]
            if not_members:
                raise ValidationError(f'Users not in this workspace: {not_members}')

            ticket.team_members.set(team_qs)
            names = [_user_display(u) for u in team_qs]
            TicketTimeline.objects.create(
                tenant=ticket.tenant,
                ticket=ticket,
                event_type=TicketTimeline.EVENT_ASSIGNED,
                description=f"Co-assignees updated: {', '.join(names)}",
                actor=actor,
                created_by=actor,
                metadata={'team_member_ids': list(found_ids)},
            )

        return ticket

    @transaction.atomic
    def transfer(self, ticket, to_dept_id: int, actor, reason: str = ''):
        """
        Transfer a ticket to another department.

        Returns (TicketTransfer, updated Ticket).
        Raises NotFoundError if the department doesn't exist in this tenant.
        """
        from departments.models import Department
        from tickets.models import TicketTimeline, TicketTransfer

        try:
            to_dept = Department.objects.get(pk=to_dept_id, tenant=self.tenant)
        except Department.DoesNotExist:
            raise NotFoundError('Department not found in this tenant.')

        from_dept = ticket.department
        transfer = TicketTransfer.objects.create(
            tenant=ticket.tenant,
            ticket=ticket,
            from_department=from_dept,
            to_department=to_dept,
            transferred_by=actor,
            reason=reason,
            created_by=actor,
        )

        ticket.department = to_dept
        ticket.save(update_fields=['department', 'updated_at'])

        TicketTimeline.objects.create(
            tenant=ticket.tenant,
            ticket=ticket,
            event_type=TicketTimeline.EVENT_TRANSFERRED,
            description=(
                f"Transferred from {from_dept.name if from_dept else '—'} "
                f"to {to_dept.name}. Reason: {reason or '—'}"
            ),
            actor=actor,
            created_by=actor,
            metadata={
                'from_department': from_dept.pk if from_dept else None,
                'to_department': to_dept.pk,
                'reason': reason,
            },
        )

        return transfer, ticket

    @transaction.atomic
    def change_status(
        self,
        ticket,
        new_status: str,
        reason: str = '',
        actor=None,
        is_manager: bool = False,
        requesting_user_id: int = None,
    ):
        """
        Change ticket status with full transition-rule enforcement.

        Staff rules:
        - May only set status to 'resolved'.
        - May only act on tickets assigned to themselves.
        - Cannot act on tickets already in a terminal state.
        - Can only resolve from in_progress or pending_customer.

        Manager / Admin / Owner:
        - Can set any status EXCEPT 'closed'.
        - Use close_ticket() to close and award coins.

        Returns updated ticket.
        """
        from tickets.models import Ticket, TicketTimeline

        valid = [s for s, _ in Ticket.STATUS_CHOICES]
        if new_status not in valid:
            raise ValidationError(f'Invalid status. Choose from: {valid}')

        if new_status == Ticket.STATUS_CLOSED:
            raise ValidationError(
                'Use POST /tickets/{id}/close/ to close a ticket and award coins.'
            )

        if not is_manager:
            if new_status != Ticket.STATUS_RESOLVED:
                raise ForbiddenError(
                    'Staff may only set a ticket to resolved. '
                    'Closing, cancelling, or re-opening requires a manager or admin.'
                )
            if ticket.assigned_to_id != requesting_user_id:
                raise ForbiddenError(
                    'You can only resolve tickets that are assigned to you.'
                )
            if self._is_locked(ticket):
                raise TicketStateError(
                    'This ticket is already resolved, closed, or cancelled.'
                )
            allowed_from = (Ticket.STATUS_IN_PROGRESS, Ticket.STATUS_PENDING_CUSTOMER)
            if ticket.status not in allowed_from:
                raise TicketStateError(
                    f'Can only resolve a ticket that is in_progress or '
                    f'pending_customer. Current status: {ticket.status}'
                )

        old_status = ticket.status
        ticket.status = new_status
        now = timezone.now()
        update_fields = ['status', 'updated_at']
        if new_status == Ticket.STATUS_RESOLVED and not ticket.resolved_at:
            ticket.resolved_at = now
            update_fields.append('resolved_at')
        ticket.save(update_fields=update_fields)

        TicketTimeline.objects.create(
            tenant=ticket.tenant,
            ticket=ticket,
            event_type=TicketTimeline.EVENT_STATUS_CHANGE,
            description=(
                f"Status changed from {old_status} to {new_status}."
                f"{(' ' + reason) if reason else ''}"
            ),
            actor=actor,
            created_by=actor,
            metadata={'from': old_status, 'to': new_status, 'reason': reason},
        )

        return ticket

    @transaction.atomic
    def close_ticket(self, ticket, coin_amount, reason: str = '', actor=None):
        """
        Close a resolved ticket and award coins to the assigned staff member.

        Validates ticket state and coin_amount.
        Returns (updated Ticket, CoinTransaction | None).
        """
        from accounting.models import CoinTransaction
        from tickets.models import Ticket, TicketTimeline

        if ticket.status == Ticket.STATUS_CLOSED:
            raise TicketStateError('Ticket is already closed.')
        if ticket.status == Ticket.STATUS_CANCELLED:
            raise TicketStateError('Cannot close a cancelled ticket.')
        if ticket.status != Ticket.STATUS_RESOLVED:
            raise TicketStateError(
                f'Ticket must be resolved before closing. '
                f'Current status: {ticket.status}'
            )

        try:
            coin_amount = Decimal(str(coin_amount))
            if coin_amount < 0:
                raise ValueError
        except (ValueError, TypeError):
            raise ValidationError('coin_amount must be a non-negative number.')

        now = timezone.now()
        ticket.status    = Ticket.STATUS_CLOSED
        ticket.closed_at = now
        ticket.save(update_fields=['status', 'closed_at', 'updated_at'])

        TicketTimeline.objects.create(
            tenant=ticket.tenant,
            ticket=ticket,
            event_type=TicketTimeline.EVENT_STATUS_CHANGE,
            description=(
                f"Ticket closed by {_user_display(actor)}."
                f"{(' ' + reason) if reason else ''}"
            ),
            actor=actor,
            created_by=actor,
            metadata={
                'from': Ticket.STATUS_RESOLVED,
                'to': Ticket.STATUS_CLOSED,
                'reason': reason,
                'coin_amount': str(coin_amount),
            },
        )

        coin_txn = None
        if coin_amount > 0 and ticket.assigned_to_id:
            coin_txn = CoinTransaction.objects.create(
                tenant=ticket.tenant,
                created_by=actor,
                staff=ticket.assigned_to,
                amount=coin_amount,
                source_type=CoinTransaction.SOURCE_TICKET,
                source_id=ticket.pk,
                status=CoinTransaction.STATUS_APPROVED,
                approved_by=actor,
                note=(
                    f"Awarded on ticket close by {_user_display(actor)}. {reason}"
                ).strip(),
            )
            TicketTimeline.objects.create(
                tenant=ticket.tenant,
                ticket=ticket,
                event_type=TicketTimeline.EVENT_STATUS_CHANGE,
                description=(
                    f"{coin_amount} coin(s) awarded to "
                    f"{_user_display(ticket.assigned_to)}."
                ),
                actor=actor,
                created_by=actor,
                metadata={
                    'coin_amount': str(coin_amount),
                    'staff_id': ticket.assigned_to_id,
                },
            )

        logger.info(
            "Ticket %s closed by %s. coins=%s", ticket.pk, actor, coin_amount
        )
        return ticket, coin_txn
