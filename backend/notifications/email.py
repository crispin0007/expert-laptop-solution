"""
Email notification service.

All outbound email is sent through this module — never directly from views,
signals, or serializers.  Actual delivery is dispatched via Celery tasks so
callers are non-blocking.
"""
import logging
from django.core.mail import send_mail
from django.conf import settings

logger = logging.getLogger(__name__)


def _send(subject: str, message: str, recipient_list: list[str]) -> None:
    """Low-level wrapper — not called directly; use the named helpers below."""
    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@techyatra.com'),
            recipient_list=recipient_list,
            fail_silently=False,
        )
    except Exception as exc:  # pragma: no cover
        logger.error("Email delivery failed: %s", exc, exc_info=True)


# ---------------------------------------------------------------------------
# Public helpers — add more as features require them
# ---------------------------------------------------------------------------

def send_ticket_assigned(ticket, assignee) -> None:
    """Notify staff member that a ticket has been assigned to them."""
    if not assignee.email:
        return
    _send(
        subject=f"[TechYatra] Ticket #{ticket.id} assigned to you",
        message=(
            f"Hi {assignee.get_full_name() or assignee.username},\n\n"
            f"Ticket '{ticket.title}' has been assigned to you.\n\n"
            f"Priority: {ticket.priority}\n"
        ),
        recipient_list=[assignee.email],
    )


def send_ticket_comment(ticket, comment, recipient) -> None:
    """Notify a user about a new comment on a ticket."""
    if not recipient.email:
        return
    _send(
        subject=f"[TechYatra] New comment on Ticket #{ticket.id}",
        message=(
            f"A new comment has been added to ticket '{ticket.title}':\n\n"
            f"{comment.body}\n"
        ),
        recipient_list=[recipient.email],
    )


def send_sla_warning(ticket, recipient) -> None:
    """Warn that a ticket is approaching its SLA deadline."""
    if not recipient.email:
        return
    _send(
        subject=f"[TechYatra] SLA Warning — Ticket #{ticket.id}",
        message=(
            f"Ticket '{ticket.title}' is approaching its SLA deadline.\n\n"
            f"Please take action as soon as possible.\n"
        ),
        recipient_list=[recipient.email],
    )


def send_invoice_issued(invoice, recipient_email: str) -> None:
    """Send invoice notification to a customer."""
    _send(
        subject=f"[TechYatra] Invoice #{invoice.invoice_number} issued",
        message=(
            f"Your invoice #{invoice.invoice_number} for "
            f"{invoice.tenant.name} is ready.\n\n"
            f"Total: {invoice.total}\n"
            f"Due: {invoice.due_date}\n"
        ),
        recipient_list=[recipient_email],
    )


def send_staff_invite(user, tenant, temp_password: str) -> None:
    """Send a welcome / invitation email to a newly invited staff member."""
    if not user.email:
        return
    _send(
        subject=f"[TechYatra] You've been invited to {tenant.name}",
        message=(
            f"Hi {user.full_name or user.email},\n\n"
            f"You have been added as a staff member to {tenant.name} on TechYatra.\n\n"
            f"Your login credentials:\n"
            f"  Email:    {user.email}\n"
            f"  Password: {temp_password}\n\n"
            f"Please log in and change your password immediately.\n\n"
            f"Regards,\nThe TechYatra Team"
        ),
        recipient_list=[user.email],
    )


def send_staff_password_reset(user, tenant, new_password: str) -> None:
    """Notify a staff member that an admin has reset their password."""
    if not user.email:
        return
    _send(
        subject=f"[TechYatra] Your password has been reset — {tenant.name}",
        message=(
            f"Hi {user.full_name or user.email},\n\n"
            f"An administrator at {tenant.name} has reset your TechYatra password.\n\n"
            f"  New Password: {new_password}\n\n"
            f"Please log in and change your password immediately.\n\n"
            f"Regards,\nThe TechYatra Team"
        ),
        recipient_list=[user.email],
    )


def send_staff_reactivated(user, tenant) -> None:
    """Notify a staff member that their account has been reactivated by an admin."""
    if not user.email:
        return
    _send(
        subject=f"[TechYatra] Your account has been reactivated — {tenant.name}",
        message=(
            f"Hi {user.full_name or user.email},\n\n"
            f"Your staff account at {tenant.name} on TechYatra has been reactivated "
            f"by an administrator.\n\n"
            f"You can now log in again using your existing credentials.\n\n"
            f"If you did not expect this, please contact your workspace administrator.\n\n"
            f"Regards,\nThe TechYatra Team"
        ),
        recipient_list=[user.email],
    )

