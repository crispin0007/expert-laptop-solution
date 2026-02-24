"""
Push notification service (Firebase Cloud Messaging stub).

Actual FCM integration is Phase 2+.  The function signatures are stable so
that Celery tasks and signal handlers can already reference them.
"""
import logging

logger = logging.getLogger(__name__)


def send_push(*, user, title: str, body: str, data: dict | None = None) -> None:
    """
    Send a push notification to a user's registered FCM tokens.

    Phase 1 stub — logs the payload, does not call FCM.
    Replace the body of _deliver() with real FCM HTTP v1 calls in Phase 2.
    """
    tokens = _get_tokens(user)
    if not tokens:
        logger.debug("No FCM tokens for user %s — skipping push", user.pk)
        return
    for token in tokens:
        _deliver(token=token, title=title, body=body, data=data or {})


def _get_tokens(user) -> list[str]:
    """Return FCM registration tokens for a user. Stub: always empty."""
    # TODO Phase 2: query FCMDevice table or user.fcm_tokens
    return []


def _deliver(*, token: str, title: str, body: str, data: dict) -> None:
    """Send to a single FCM token. Stub: logs only."""
    logger.info(
        "FCM stub — would send to token=%s title=%r body=%r data=%r",
        token, title, body, data,
    )
