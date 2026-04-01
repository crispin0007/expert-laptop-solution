"""
NEXUS BMS — Event Bus

EventBus.publish() fires domain events from service layers.
Listeners subscribe via @listens_to decorator.

Current state: transitional.
  - Events are logged to the Django logger (structured, queryable via log aggregator).
  - Full async Celery-backed dispatch is planned for Phase 2.
  - All call sites use EventBus.publish() today so migrating to async is a
    one-file change: replace _dispatch() below with a Celery task call.

Usage
-----
Publishing (from services only — never from views or signals)::

    from core.events import EventBus
    EventBus.publish('staff.created', {
        'id': user.pk,
        'tenant_id': tenant.pk,
        'email': user.email,
    }, tenant=tenant)

Listening::

    from core.events import listens_to

    @listens_to('staff.created', module_id='notifications')
    def on_staff_created(payload: dict, tenant) -> None:
        ...
"""
import logging
from typing import Any

logger = logging.getLogger('nexus.events')


class EventBus:
    """Central event publisher for NEXUS BMS.

    All modules publish via this class; nothing publishes directly to Celery,
    a message broker, or sibling app code.
    """

    @staticmethod
    def publish(event_name: str, payload: dict, tenant: Any = None) -> None:
        """Publish a domain event.

        Args:
            event_name: Dot-separated name from EVENT_CATALOGUE (e.g. 'staff.created').
            payload:    Dict carrying the event data. Must include ``id`` and
                        ``tenant_id`` at minimum.
            tenant:     The resolved Tenant instance (not tenant_id).

        In the transitional phase the event is logged at INFO level.
        When Celery dispatch is wired in Phase 2, this method will also
        enqueue the event for async listener execution.
        """
        try:
            logger.info(
                'nexus.event.published',
                extra={
                    'event': event_name,
                    'tenant_id': getattr(tenant, 'id', None),
                    'payload_keys': list(payload.keys()),
                },
            )
        except Exception:
            # Publishing must never crash the calling service.
            pass


def listens_to(event_name: str, module_id: str = ''):
    """Decorator that marks a function as a listener for *event_name*.

    In Phase 2 this decorator will auto-register the listener with the
    Celery-backed dispatcher.  Currently it is a documentation-only marker —
    the function is not called automatically.

    Args:
        event_name: The event name this function handles (from EVENT_CATALOGUE).
        module_id:  The module that owns this listener (for registry tracking).

    Example::

        @listens_to('staff.created', module_id='notifications')
        def on_staff_created(payload: dict, tenant) -> None:
            NotificationService.send(...)
    """
    def decorator(fn):
        fn._listens_to = event_name
        fn._module_id = module_id
        return fn
    return decorator
