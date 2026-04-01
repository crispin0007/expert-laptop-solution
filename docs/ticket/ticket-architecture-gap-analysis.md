# Ticket Architecture Gap Analysis

## 1) Current State Summary

The system uses a hybrid style:
- Synchronous domain actions in view/service layers
- Reactive side effects with Django signals
- Async transport for notifications with Celery

This gives partial decoupling, but it is not a true domain event architecture yet.

## 2) Gaps vs Target Event-Driven Architecture

1. No first-class event bus in runtime core
- There is no active `core.events` runtime implementation currently wired in.
- CMS listeners include explicit comments that EventBus is not yet implemented.

2. Signals are model-coupled, not domain-event-coupled
- Signal receivers are bound to ORM persistence events (`post_save`, `post_delete`).
- This can blur business intent (for example, any save may trigger handlers).

3. Service-layer events are not standardized
- Ticket service methods do not consistently publish named domain events such as `ticket.created`, `ticket.assigned`, `ticket.status.changed`.

4. Cross-module interactions still happen via direct imports in places
- Some paths directly import other module models/services, which increases compile-time coupling.

5. Event payload contracts are not formalized
- No enforced schema/versioning for event payloads (id, tenant_id, actor, timestamp, etc.).

6. Event observability is limited
- No dedicated event log table/stream for replay/audit and failure analysis.

## 3) सुझाव: Improvements to Reach Event-Driven Design

## 3.1 Architectural Changes

1. Introduce `core.events`
- Implement `EventBus.publish(event_name, payload, tenant)`.
- Implement `@listens_to(event_name, module_id=...)` subscription decorator.
- Register listeners during app startup.

2. Publish domain events from service layer
- Emit events only from business service methods, not views.
- Example events for tickets:
  - `ticket.created`
  - `ticket.assigned`
  - `ticket.status.changed`
  - `ticket.resolved`
  - `ticket.closed`
  - `ticket.comment.added`
  - `ticket.escalated`

3. Keep ORM signals thin or transitional
- Use signals only as compatibility adapters where migration is incomplete.
- Move business reactions into explicit event listeners.

4. Standardize payloads
- Require minimum payload keys:
  - `id`
  - `tenant_id`
  - `occurred_at`
  - `actor_id` (when user-triggered)
  - `version`

5. Add event persistence/outbox
- Implement an outbox table (`event_outbox`) in the same transaction as domain writes.
- Publish asynchronously from outbox worker for reliability.

## 3.2 Recommended Patterns

- Transactional outbox pattern
- Idempotent consumers/listeners
- At-least-once delivery semantics
- Retry with exponential backoff and dead-letter queue
- Correlation IDs in logs for cross-service tracing

## 3.3 Recommended Tools/Technologies

Base stack (fits existing architecture):
- Django + PostgreSQL outbox table for guaranteed event capture
- Celery for async dispatch workers and retries
- Redis for lightweight pub/sub or queue fan-out (short term)

Scale-up options (when needed):
- Kafka or RabbitMQ for high-volume durable event streams
- Schema registry approach (or strict Pydantic payload models) for event contract governance
- OpenTelemetry for distributed tracing of event flows

## 4) Practical Transition Plan

Phase A: Foundation (safe, incremental)
1. Add `core/events.py` with publish/subscribe primitives.
2. Define canonical event names and payload model constants.
3. Add `EventLog` model for observability.

Phase B: Ticket module migration
1. Emit events from `TicketService` methods.
2. Move inventory/accounting/notification reactions into listeners.
3. Keep existing signals as fallback for one release cycle.

Phase C: Reliability hardening
1. Introduce transactional outbox and dispatcher worker.
2. Add idempotency keys on listener side effects.
3. Add replay tool for failed events.

Phase D: Governance
1. Add tests validating event emission per use case.
2. Add lint/check rule preventing cross-module imports in service layer.
3. Track event latency/failure metrics in monitoring dashboard.

## 5) Decision Answer Summary

- Is ticket management completely separate?
  - Domain-separated: Yes.
  - Runtime-isolated: No, it is intentionally integrated with inventory/accounting/notifications.

- Is the system event-driven?
  - Partially: Yes (signals + async tasks).
  - Fully event-driven: No (no active centralized EventBus and event contract governance).
