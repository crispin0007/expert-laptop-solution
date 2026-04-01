"""
Async Celery tasks for the accounts module.

Task guidelines:
  - Always bind=True + max_retries + default_retry_delay.
  - Always accept tenant_id (int), never a Tenant object.
  - Always idempotent — safe to retry on transient failures.
"""
from celery import shared_task


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def task_send_staff_invite_email(self, user_id: int, tenant_id: int) -> None:
    """Send a staff invitation email asynchronously.

    NOTE: Plaintext passwords must NEVER be passed to Celery.
    The invite email should direct the user to set their own password.
    The synchronous invite path (InviteStaffSerializer) handles the initial
    password email directly to avoid persisting credentials in the broker.
    """
    # Phase 2: implement full async invite flow with password-reset link.
    pass


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def task_send_staff_reactivated(self, user_id: int, tenant_id: int) -> None:
    """Send a reactivation confirmation email to a staff member."""
    try:
        from django.contrib.auth import get_user_model
        from tenants.models import Tenant
        from notifications.email import send_staff_reactivated
        User = get_user_model()
        user = User.objects.get(pk=user_id)
        tenant = Tenant.objects.get(pk=tenant_id)
        send_staff_reactivated(user, tenant)
    except Exception as exc:
        raise self.retry(exc=exc)
