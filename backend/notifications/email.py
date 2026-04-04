"""
Email notification service.

All outbound email is sent through this module — never directly from views,
signals, or serializers.  Actual delivery is dispatched via Celery tasks so
callers are non-blocking.

Per-tenant SMTP: if the sending tenant has an active TenantSmtpConfig, email
is routed through that SMTP server.  Falls back to global Django EMAIL_*
settings when no tenant config exists or is_active=False.
"""
import logging
from django.core.mail import send_mail
from django.conf import settings

logger = logging.getLogger(__name__)


def _get_tenant_smtp(tenant):
    """
    Return the active TenantSmtpConfig for *tenant*, or None.
    Returns None if tenant is None, config doesn't exist, or is_active=False.
    """
    if tenant is None:
        return None
    try:
        from tenants.models import TenantSmtpConfig
        cfg = TenantSmtpConfig.objects.get(tenant=tenant, is_active=True)
        return cfg
    except Exception:
        return None


def _send(subject: str, message: str, recipient_list: list[str], tenant=None) -> None:
    """Low-level wrapper — not called directly; use the named helpers below."""
    smtp = _get_tenant_smtp(tenant)
    try:
        if smtp:
            connection = smtp.build_email_backend()
            send_mail(
                subject=subject,
                message=message,
                from_email=smtp.from_address,
                recipient_list=recipient_list,
                connection=connection,
                fail_silently=False,
            )
        else:
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
        subject=f"[TechYatra] Ticket {ticket.ticket_number} assigned to you",
        message=(
            f"Hi {assignee.get_full_name() or assignee.username},\n\n"
            f"Ticket '{ticket.title}' has been assigned to you.\n\n"
            f"Priority: {ticket.priority}\n"
        ),
        recipient_list=[assignee.email],
        tenant=getattr(ticket, 'tenant', None),
    )


def send_ticket_comment(ticket, comment, recipient) -> None:
    """Notify a user about a new comment on a ticket."""
    if not recipient.email:
        return
    _send(
        subject=f"[TechYatra] New comment on Ticket {ticket.ticket_number}",
        message=(
            f"A new comment has been added to ticket '{ticket.title}':\n\n"
            f"{comment.body}\n"
        ),
        recipient_list=[recipient.email],
        tenant=getattr(ticket, 'tenant', None),
    )


def send_sla_warning(ticket, recipient) -> None:
    """Warn that a ticket is approaching its SLA deadline."""
    if not recipient.email:
        return
    _send(
        subject=f"[TechYatra] SLA Warning — Ticket {ticket.ticket_number}",
        message=(
            f"Ticket '{ticket.title}' is approaching its SLA deadline.\n\n"
            f"Please take action as soon as possible.\n"
        ),
        recipient_list=[recipient.email],
        tenant=getattr(ticket, 'tenant', None),
    )


def send_ticket_transferred(ticket, new_assignee) -> None:
    """Notify a staff member that a ticket has been transferred to them."""
    if not new_assignee.email:
        return
    _send(
        subject=f"[TechYatra] Ticket {ticket.ticket_number} transferred to you",
        message=(
            f"Hi {new_assignee.get_full_name() or new_assignee.username},\n\n"
            f"Ticket '{ticket.title}' has been transferred to you.\n\n"
            f"Priority: {ticket.priority}\n"
        ),
        recipient_list=[new_assignee.email],
        tenant=getattr(ticket, 'tenant', None),
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
        tenant=getattr(invoice, 'tenant', None),
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
        tenant=tenant,
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
        tenant=tenant,
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
        tenant=tenant,
    )


def send_password_reset(user, token: str, reset_url_base: str = '') -> None:
    """Send a self-service password-reset link to the user.

    reset_url_base should be the frontend URL, e.g. https://app.mybms.com/reset-password
    If blank, a generic message is sent with just the token.
    """
    if not user.email:
        return
    if reset_url_base:
        reset_link = f"{reset_url_base.rstrip('/')}?token={token}"
        body = (
            f"Hi {user.full_name or user.email},\n\n"
            f"We received a request to reset your TechYatra password.\n\n"
            f"Click the link below to set a new password (valid for 60 minutes):\n"
            f"  {reset_link}\n\n"
            f"If you did not request this, you can safely ignore this email.\n\n"
            f"Regards,\nThe TechYatra Team"
        )
    else:
        body = (
            f"Hi {user.full_name or user.email},\n\n"
            f"We received a request to reset your TechYatra password.\n\n"
            f"Use this token in the app to set a new password (valid for 60 minutes):\n"
            f"  {token}\n\n"
            f"If you did not request this, you can safely ignore this email.\n\n"
            f"Regards,\nThe TechYatra Team"
        )
    _send(
        subject='[TechYatra] Reset your password',
        message=body,
        recipient_list=[user.email],
        tenant=None,
    )


# ── Inventory notifications ───────────────────────────────────────────────────

def send_low_stock_alert(product, quantity: int, recipient_email: str) -> None:
    """Notify an admin/manager that a product has hit or dropped below its reorder level."""
    _send(
        subject=f"[TechYatra] Low Stock: {product.name}",
        message=(
            f"Product '{product.name}' (SKU: {product.sku}) is at or below its reorder level.\n\n"
            f"  Current stock : {quantity}\n"
            f"  Reorder level : {product.reorder_level}\n\n"
            f"Please create a purchase order to replenish stock."
        ),
        recipient_list=[recipient_email],
        tenant=getattr(product, 'tenant', None),
    )


def send_po_status_changed(po, recipient_email: str) -> None:
    """Notify the PO creator when the purchase order status changes."""
    _send(
        subject=f"[TechYatra] Purchase Order {po.po_number} — {po.status.upper()}",
        message=(
            f"Purchase Order {po.po_number} (Supplier: {po.supplier.name}) "
            f"has been updated to status: {po.get_status_display()}.\n"
        ),
        recipient_list=[recipient_email],
        tenant=getattr(po, 'tenant', None),
    )


def send_return_status_changed(return_order, recipient_email: str) -> None:
    """Notify creator when a return order status changes."""
    _send(
        subject=f"[TechYatra] Return Order {return_order.return_number} — {return_order.status.upper()}",
        message=(
            f"Return Order {return_order.return_number} (Supplier: {return_order.supplier.name}) "
            f"has been updated to status: {return_order.get_status_display()}.\n"
        ),
        recipient_list=[recipient_email],
        tenant=getattr(return_order, 'tenant', None),
    )


# ── Project notifications ─────────────────────────────────────────────────────

def send_project_assigned(project, manager) -> None:
    """Notify a user that they have been set as manager on a project."""
    if not manager.email:
        return
    _send(
        subject=f"[TechYatra] You are managing project {project.project_number}",
        message=(
            f"Hi {manager.full_name or manager.email},\n\n"
            f"You have been assigned as manager for project \"{project.name}\" "
            f"({project.project_number}).\n\n"
            f"Status: {project.get_status_display()}\n"
        ),
        recipient_list=[manager.email],
        tenant=getattr(project, 'tenant', None),
    )


def send_task_assigned(task, assignee) -> None:
    """Notify a staff member that a task has been assigned to them."""
    if not assignee.email:
        return
    _send(
        subject=f"[TechYatra] Task assigned: {task.title}",
        message=(
            f"Hi {assignee.full_name or assignee.email},\n\n"
            f"You have been assigned a task in project {task.project.project_number} — {task.project.name}.\n\n"
            f"Task    : {task.title}\n"
            f"Priority: {task.get_priority_display()}\n"
            f"Due date: {task.due_date or 'Not set'}\n\n"
            f"Please log in to NEXUS BMS to view the full details.\n"
        ),
        recipient_list=[assignee.email],
        tenant=getattr(task, 'tenant', None),
    )


def send_task_completed(task, manager) -> None:
    """Notify the project manager that a task has been marked done."""
    if not manager.email:
        return
    assignee_name = (
        task.assigned_to.full_name or task.assigned_to.email
        if task.assigned_to else 'Unassigned'
    )
    _send(
        subject=f"[TechYatra] Task completed in {task.project.project_number}: {task.title}",
        message=(
            f"Hi {manager.full_name or manager.email},\n\n"
            f"Task \"{task.title}\" in project \"{task.project.name}\" has been marked as done "
            f"by {assignee_name}.\n"
        ),
        recipient_list=[manager.email],
        tenant=getattr(task, 'tenant', None),
    )

