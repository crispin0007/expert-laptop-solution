"""
tickets/repositories/ticket_repo.py

All ORM access for Ticket and related SLA models.
Views and service functions MUST NOT query these models directly —
all queryset construction lives here so filter rules stay in one place.
"""
import logging

from django.utils import timezone

from core.repositories import BaseRepository

logger = logging.getLogger(__name__)


class TicketRepository(BaseRepository):
    """
    Tenant-scoped data-access layer for Ticket.

    ``self._qs`` is auto-scoped to ``tenant`` via BaseRepository.
    """

    @property
    def model(self):
        from tickets.models import Ticket
        return Ticket

    # ── List / filter ─────────────────────────────────────────────────────────

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
        """Return a filtered, tenant-scoped queryset of non-deleted tickets."""
        from tickets.models import Ticket
        qs = (
            Ticket.objects.filter(tenant=self.tenant, is_deleted=False)
            .select_related(
                'ticket_type', 'customer', 'department',
                'assigned_to', 'created_by', 'sla',
            )
        )
        if status:
            qs = qs.filter(status=status)
        if priority:
            qs = qs.filter(priority=priority)
        if assigned_to_id:
            qs = qs.filter(assigned_to_id=assigned_to_id)
        if department_id:
            qs = qs.filter(department_id=department_id)
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        if fiscal_year_start and fiscal_year_end:
            qs = qs.filter(
                created_at__date__gte=fiscal_year_start,
                created_at__date__lte=fiscal_year_end,
            )
        return qs

    # ── SLA queries ───────────────────────────────────────────────────────────

    def sla_breached(self):
        """All TicketSLA records that have already breached."""
        from tickets.models import TicketSLA
        return (
            TicketSLA.objects
            .filter(tenant=self.tenant, breached=True)
            .select_related('ticket')
        )

    def sla_warning(self, warning_hours: int = 6):
        """TicketSLA records that will breach within ``warning_hours``."""
        from tickets.models import TicketSLA
        now = timezone.now()
        return (
            TicketSLA.objects
            .filter(
                tenant=self.tenant,
                breached=False,
                breach_at__isnull=False,
                breach_at__lte=now + timezone.timedelta(hours=warning_hours),
                breach_at__gt=now,
            )
            .select_related('ticket')
        )
