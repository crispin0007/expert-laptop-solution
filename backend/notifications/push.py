"""
Push notification service (Expo / Firebase Cloud Messaging).

Phase 1: Real token retrieval from FCMDevice model.
         Push delivery to Expo's push service (which routes to APNs/FCM).
Phase 2: Swap to direct FCM HTTP v1 + APNs for higher throughput.
"""
import logging
import requests

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'


def send_push(*, user, tenant, title: str, body: str, data: dict | None = None) -> None:
    """
    Send a push notification to all active devices registered for a user.

    ``tenant`` must be passed explicitly — do NOT rely on user.tenant, which
    may raise a DB query or be None for super-admin accounts.  Callers should
    always have the tenant object or ID available from the originating model.

    Tokens are fetched from FCMDevice.  Expo push tokens are forwarded to
    the Expo push API; raw FCM/APNs tokens fall through to _deliver_fcm().
    """
    tokens = _get_tokens(user, tenant)
    if not tokens:
        logger.debug("No FCM tokens for user %s tenant %s — skipping push", user.pk, getattr(tenant, 'pk', tenant))
        return
    for token in tokens:
        _deliver(token=token, title=title, body=body, data=data or {})


def _get_tokens(user, tenant) -> list[str]:
    """Return active push tokens for a user+tenant from the FCMDevice table."""
    try:
        from .models import FCMDevice
        return list(
            FCMDevice.objects.filter(
                user=user,
                tenant=tenant,
                is_active=True,
            ).values_list('token', flat=True)
        )
    except Exception:
        # If FCMDevice table doesn't exist yet (pre-migration), fail gracefully
        return []


def _deliver(*, token: str, title: str, body: str, data: dict) -> None:
    """
    Deliver to a single token.

    Expo push tokens (ExponentPushToken[...]) are sent to the Expo push API.
    All other tokens are logged as FCM stubs until Phase 2 direct FCM is wired.
    """
    if token.startswith('ExponentPushToken['):
        _deliver_expo(token=token, title=title, body=body, data=data)
    else:
        _deliver_fcm_stub(token=token, title=title, body=body, data=data)


def _deliver_expo(*, token: str, title: str, body: str, data: dict) -> None:
    """Send via Expo push notification API."""
    payload = {
        'to': token,
        'title': title,
        'body': body,
        'data': data,
        'sound': 'default',
    }
    try:
        resp = requests.post(
            EXPO_PUSH_URL,
            json=payload,
            headers={'Accept': 'application/json', 'Content-Type': 'application/json'},
            timeout=10,
        )
        resp.raise_for_status()
        result = resp.json()
        # Expo returns per-message status in data[0]
        msg_status = result.get('data', [{}])[0]
        if msg_status.get('status') == 'error':
            logger.warning("Expo push error for token %s: %s", token[:30], msg_status.get('message'))
        else:
            logger.debug("Expo push OK token=%s title=%r", token[:30], title)
    except Exception as exc:
        logger.error("Expo push failed token=%s: %s", token[:30], exc)


def _deliver_fcm_stub(*, token: str, title: str, body: str, data: dict) -> None:
    """Phase 2 placeholder — logs only."""
    logger.info(
        "FCM stub — would send to token=%s title=%r body=%r data=%r",
        token[:20], title, body, data,
    )
