"""
Celery tasks for async notification delivery.

All notification functions from email.py / push.py are wrapped here so they
run in a worker process and do not block the request/response cycle.

Usage:
    from notifications.tasks import task_send_ticket_assigned
    task_send_ticket_assigned.delay(ticket_id=ticket.pk, assignee_id=user.pk)
"""
from celery import shared_task
import logging

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def task_send_ticket_assigned(self, ticket_id: int, assignee_id: int) -> None:
    try:
        from tickets.models import Ticket
        from accounts.models import User
        from notifications.email import send_ticket_assigned

        ticket = Ticket.objects.get(pk=ticket_id)
        assignee = User.objects.get(pk=assignee_id)
        send_ticket_assigned(ticket, assignee)
    except Exception as exc:
        logger.error("task_send_ticket_assigned failed: %s", exc, exc_info=True)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def task_send_sla_warning(self, ticket_id: int, recipient_id: int) -> None:
    try:
        from tickets.models import Ticket
        from accounts.models import User
        from notifications.email import send_sla_warning

        ticket = Ticket.objects.get(pk=ticket_id)
        recipient = User.objects.get(pk=recipient_id)
        send_sla_warning(ticket, recipient)
    except Exception as exc:
        logger.error("task_send_sla_warning failed: %s", exc, exc_info=True)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def task_send_invoice_issued(self, invoice_id: int, recipient_email: str) -> None:
    try:
        from accounting.models import Invoice
        from notifications.email import send_invoice_issued

        invoice = Invoice.objects.get(pk=invoice_id)
        send_invoice_issued(invoice, recipient_email)
    except Exception as exc:
        logger.error("task_send_invoice_issued failed: %s", exc, exc_info=True)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def task_send_push(self, user_id: int, title: str, body: str, data: dict | None = None) -> None:
    try:
        from accounts.models import User
        from notifications.push import send_push

        user = User.objects.get(pk=user_id)
        send_push(user=user, title=title, body=body, data=data or {})
    except Exception as exc:
        logger.error("task_send_push failed: %s", exc, exc_info=True)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def task_send_staff_invite(self, user_id: int, tenant_id: int, temp_password: str) -> None:
    """Send invitation email to a newly added staff member."""
    try:
        from accounts.models import User
        from tenants.models import Tenant
        from notifications.email import send_staff_invite

        user = User.objects.get(pk=user_id)
        tenant = Tenant.objects.get(pk=tenant_id)
        send_staff_invite(user, tenant, temp_password)
    except Exception as exc:
        logger.error("task_send_staff_invite failed: %s", exc, exc_info=True)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def task_send_staff_password_reset(self, user_id: int, tenant_id: int, new_password: str) -> None:
    """Notify staff member that their password was reset by an admin."""
    try:
        from accounts.models import User
        from tenants.models import Tenant
        from notifications.email import send_staff_password_reset

        user = User.objects.get(pk=user_id)
        tenant = Tenant.objects.get(pk=tenant_id)
        send_staff_password_reset(user, tenant, new_password)
    except Exception as exc:
        logger.error("task_send_staff_password_reset failed: %s", exc, exc_info=True)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def task_send_staff_reactivated(self, user_id: int, tenant_id: int) -> None:
    """Notify a staff member that their account has been reactivated."""
    try:
        from accounts.models import User
        from tenants.models import Tenant
        from notifications.email import send_staff_reactivated

        user = User.objects.get(pk=user_id)
        tenant = Tenant.objects.get(pk=tenant_id)
        send_staff_reactivated(user, tenant)
    except Exception as exc:
        logger.error("task_send_staff_reactivated failed: %s", exc, exc_info=True)
        raise self.retry(exc=exc)


# ---------------------------------------------------------------------------
# SLA beat task — runs every 15 minutes via Celery Beat
# ---------------------------------------------------------------------------

@shared_task
def task_check_sla_deadlines() -> None:
    """
    Periodic task (every 15 min) that:
    1. Marks TicketSLA records as breached when breach_at has passed.
    2. Sends SLA warning emails for tickets within 20% of their SLA window
       (approximated as breach_at within 6 hours) where warning not yet sent.

    Registered in CELERY_BEAT_SCHEDULE in config/settings/base.py.
    """
    from django.utils import timezone
    from tickets.models import TicketSLA, Ticket

    now = timezone.now()

    # ── 1. Mark breached ────────────────────────────────────────────────────
    newly_breached = TicketSLA.objects.filter(
        breached=False,
        breach_at__lte=now,
        ticket__status__in=(
            Ticket.STATUS_OPEN,
            Ticket.STATUS_IN_PROGRESS,
            Ticket.STATUS_PENDING_CUSTOMER,
        ),
    ).select_related('ticket', 'ticket__assigned_to')

    breach_count = 0
    for sla in newly_breached:
        sla.breached = True
        sla.breached_at = now
        sla.save(update_fields=['breached', 'breached_at'])

        # Notify assigned staff
        assignee = sla.ticket.assigned_to
        if assignee:
            try:
                from notifications.email import send_sla_warning
                # Reuse warning email — subject line differentiates breach vs warning
                send_sla_warning(sla.ticket, assignee)
            except Exception as exc:
                logger.error("SLA breach email failed for ticket %s: %s", sla.ticket_id, exc)

        breach_count += 1

    # ── 2. Send warnings (approaching breach — within 6 hours) ──────────────
    warning_slas = TicketSLA.objects.filter(
        breached=False,
        warning_sent_at__isnull=True,
        breach_at__isnull=False,
        breach_at__lte=now + timezone.timedelta(hours=6),
        breach_at__gt=now,
        ticket__status__in=(
            Ticket.STATUS_OPEN,
            Ticket.STATUS_IN_PROGRESS,
            Ticket.STATUS_PENDING_CUSTOMER,
        ),
    ).select_related('ticket', 'ticket__assigned_to')

    warning_count = 0
    for sla in warning_slas:
        assignee = sla.ticket.assigned_to
        if assignee:
            try:
                from notifications.email import send_sla_warning
                send_sla_warning(sla.ticket, assignee)
                sla.warning_sent_at = now
                sla.save(update_fields=['warning_sent_at'])
                warning_count += 1
            except Exception as exc:
                logger.error("SLA warning email failed for ticket %s: %s", sla.ticket_id, exc)

    logger.info(
        "task_check_sla_deadlines: %d breached, %d warnings sent.",
        breach_count, warning_count,
    )