"""
NEXUS BMS — Event Bus

EventBus.publish() fires domain events from service layers.
Listeners subscribe via @listens_to decorator and are auto-discovered on startup.

Architecture
------------
- @listens_to registers a function into _REGISTRY at import time.
- CoreConfig.ready() imports every installed app's listeners.py, filling the registry.
- EventBus.publish() calls _dispatch() which iterates registered listeners
  synchronously in the same request/worker thread.

Phase 2 upgrade path (Celery async dispatch):
  Replace _dispatch() body with a single Celery task enqueue.
  All call sites (EventBus.publish) remain unchanged.

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
from collections import defaultdict
from typing import Any, Callable

logger = logging.getLogger('nexus.events')

# Registry: event_name -> list of listener callables
_REGISTRY: dict[str, list[Callable]] = defaultdict(list)


def _register(event_name: str, fn: Callable) -> None:
    """Add *fn* to the registry for *event_name* (idempotent)."""
    if fn not in _REGISTRY[event_name]:
        _REGISTRY[event_name].append(fn)


class EventBus:
    """Central synchronous event publisher for NEXUS BMS.

    All modules publish via this class; nothing dispatches directly to Celery,
    a message broker, or sibling app code.
    """

    @staticmethod
    def publish(event_name: str, payload: dict, tenant: Any = None) -> None:
        """Publish a domain event and dispatch it to all registered listeners.

        Args:
            event_name: Dot-separated name from EVENT_CATALOGUE (e.g. 'ticket.created').
            payload:    Dict with event data. Must include ``id`` and ``tenant_id``.
            tenant:     The resolved Tenant instance (not tenant_id).
        """
        logger.info(
            'nexus.event.published',
            extra={
                'event': event_name,
                'tenant_id': getattr(tenant, 'id', None),
                'payload_keys': list(payload.keys()),
            },
        )
        EventBus._dispatch(event_name, payload, tenant)

    @staticmethod
    def _dispatch(event_name: str, payload: dict, tenant: Any) -> None:
        """Call every registered listener for *event_name*.

        Each listener is called synchronously and in isolation — a failure in
        one listener never prevents others from running, and never raises to
        the calling service.

        Phase 2: replace this method body with a single Celery task enqueue.
        """
        listeners = _REGISTRY.get(event_name, [])
        for listener in listeners:
            try:
                listener(payload, tenant)
            except Exception:
                logger.exception(
                    'nexus.event.listener_error',
                    extra={
                        'event': event_name,
                        'listener': getattr(listener, '__qualname__', repr(listener)),
                        'module_id': getattr(listener, '_module_id', ''),
                    },
                )

    @staticmethod
    def registered_listeners() -> dict[str, list[str]]:
        """Return a snapshot of the registry for inspection/debugging."""
        return {
            event: [getattr(fn, '__qualname__', repr(fn)) for fn in fns]
            for event, fns in _REGISTRY.items()
        }


def listens_to(event_name: str, module_id: str = ''):
    """Decorator that registers a function as a listener for *event_name*.

    The decorated function is added to the EventBus registry immediately at
    import time. CoreConfig.ready() imports all listeners.py modules so that
    every listener is registered before the first request arrives.

    Args:
        event_name: The event name this function handles (from EVENT_CATALOGUE).
        module_id:  The module that owns this listener (for logging/debugging).

    Example::

        @listens_to('staff.created', module_id='notifications')
        def on_staff_created(payload: dict, tenant) -> None:
            NotificationService.send(...)
    """
    def decorator(fn):
        fn._listens_to = event_name
        fn._module_id = module_id
        _register(event_name, fn)
        return fn
    return decorator
