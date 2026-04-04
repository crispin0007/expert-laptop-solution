"""
Async Celery tasks for the accounts module.

Task guidelines:
  - Always bind=True + max_retries + default_retry_delay.
  - Always accept tenant_id (int), never a Tenant object.
  - Always idempotent — safe to retry on transient failures.
"""
import logging

from celery import shared_task

logger = logging.getLogger(__name__)

# Default token lifetime (minutes)
PASSWORD_RESET_EXPIRY_MINUTES = 60


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def task_send_staff_invite_email(self, user_id: int, tenant_id: int) -> None:
    """Send a staff invitation email asynchronously.

    Phase 2: implement full async invite flow using a password-reset token link
    so the staff member sets their own password on first login.
    """
    try:
        import secrets
        from datetime import timedelta
        from django.contrib.auth import get_user_model
        from django.utils import timezone
        from tenants.models import Tenant
        from accounts.models import PasswordResetToken

        User   = get_user_model()
        user   = User.objects.get(pk=user_id)
        tenant = Tenant.objects.get(pk=tenant_id)

        token_value = secrets.token_urlsafe(48)
        PasswordResetToken.objects.create(
            user=user,
            token=token_value,
            expires_at=timezone.now() + timedelta(minutes=PASSWORD_RESET_EXPIRY_MINUTES * 24 * 7),
        )

        from notifications.email import send_staff_invite
        send_staff_invite(user, tenant, token=token_value)
    except Exception as exc:
        logger.exception('task_send_staff_invite_email failed user=%s: %s', user_id, exc)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def task_send_password_reset_email(self, user_id: int, token_id: int) -> None:
    """Send a password-reset link email to the user.

    token_id is the PasswordResetToken.pk — never pass the token string
    through Celery to avoid it appearing in broker logs.
    """
    try:
        from django.contrib.auth import get_user_model
        from accounts.models import PasswordResetToken
        from notifications.email import send_password_reset

        User  = get_user_model()
        user  = User.objects.get(pk=user_id)
        token = PasswordResetToken.objects.get(pk=token_id)

        send_password_reset(user, token.token)
    except Exception as exc:
        logger.exception(
            'task_send_password_reset_email failed user=%s token=%s: %s',
            user_id, token_id, exc,
        )
        raise self.retry(exc=exc)


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
