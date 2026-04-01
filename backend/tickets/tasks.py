"""
Celery tasks for the tickets module.

SLA enforcement is handled centrally in notifications.tasks.task_check_sla_deadlines
which is scheduled via Celery Beat (every 15 minutes).  The tasks here are kept as
thin per-tenant entry points that can be triggered on-demand.
"""
import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def task_check_sla_warnings(self, tenant_id: int) -> None:
    """Per-tenant SLA warning check — delegates to the central beat task.

    Can be triggered on demand; the central task covers all tenants on schedule.
    """
    try:
        from django.utils import timezone
        from tenants.models import Tenant
        from tickets.models import Ticket, TicketSLA
        from notifications.service import notify_sla_warning

        tenant = Tenant.objects.get(id=tenant_id)
        now = timezone.now()
        warn_before = now + timezone.timedelta(minutes=60)

        sla_qs = (
            TicketSLA.objects
            .filter(
                ticket__tenant=tenant,
                breached=False,
                warning_sent_at__isnull=True,
                breach_at__lte=warn_before,
                breach_at__gt=now,
                ticket__status__in=[Ticket.STATUS_OPEN, Ticket.STATUS_IN_PROGRESS],
            )
            .select_related('ticket__assigned_to')
            .iterator(chunk_size=200)
        )
        warned = 0
        for sla in sla_qs:
            ticket = sla.ticket
            if ticket.assigned_to:
                try:
                    notify_sla_warning(ticket, ticket.assigned_to)
                    TicketSLA.objects.filter(pk=sla.pk).update(warning_sent_at=now)
                    warned += 1
                except Exception:
                    logger.exception('SLA warning failed ticket_id=%s', ticket.pk)
        logger.info('task_check_sla_warnings tenant=%s warned=%d', tenant_id, warned)
    except Exception as exc:
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def task_mark_overdue_tickets(self, tenant_id: int) -> None:
    """Per-tenant overdue ticket marker — delegates to the central beat task.

    Can be triggered on demand; the central task covers all tenants on schedule.
    """
    try:
        from django.utils import timezone
        from tenants.models import Tenant
        from tickets.models import Ticket, TicketSLA
        from core.events import EventBus

        tenant = Tenant.objects.get(id=tenant_id)
        now = timezone.now()

        overdue_slas = (
            TicketSLA.objects
            .filter(
                ticket__tenant=tenant,
                breached=False,
                breach_at__lte=now,
                ticket__status__in=[Ticket.STATUS_OPEN, Ticket.STATUS_IN_PROGRESS],
            )
            .select_related('ticket')
            .iterator(chunk_size=200)
        )
        marked = 0
        for sla in overdue_slas:
            ticket = sla.ticket
            try:
                TicketSLA.objects.filter(pk=sla.pk, breached=False).update(
                    breached=True, breached_at=now
                )
                EventBus.publish('ticket.overdue', {
                    'id': ticket.pk,
                    'tenant_id': tenant.pk,
                    'assigned_to_id': ticket.assigned_to_id,
                }, tenant=tenant)
                marked += 1
            except Exception:
                logger.exception('mark_overdue failed ticket_id=%s', ticket.pk)
        logger.info('task_mark_overdue_tickets tenant=%s marked=%d', tenant_id, marked)
    except Exception as exc:
        raise self.retry(exc=exc)
