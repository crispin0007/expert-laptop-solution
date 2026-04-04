"""
tickets/tests/test_tickets_extended.py
=======================================
Extended service-layer tests covering:
  - Assignment on ticket creation (event + timeline)
  - Transfer to department
  - Status transitions: cancel, reopen blocked by lock rules
  - ticket.cancelled / ticket.reopened events
  - Comment create / soft-delete
  - Cross-tenant isolation (tickets cannot bleed across tenants)
  - Timeline entries for key transitions
  - Staff permission: only resolve own assigned tickets

Run inside Docker:
    docker exec nexus_bms-web-1 python -m pytest tickets/tests/test_tickets_extended.py -v
"""
import pytest
from decimal import Decimal

from tenants.models import Tenant, Plan
from accounts.models import User, TenantMembership
from customers.models import Customer
from tickets.models import Ticket, TicketType, TicketTimeline, TicketTransfer
from tickets.services.ticket_service import TicketService


# ─── Helpers (mirrors test_tickets.py) ───────────────────────────────────────

def _plan():
    return Plan.objects.get_or_create(
        slug='basic', defaults={'name': 'Basic', 'description': 'Test plan'},
    )[0]


def _tenant(slug):
    return Tenant.objects.create(
        name=f'Tenant {slug}',
        slug=slug,
        plan=_plan(),
        is_active=True,
        coin_to_money_rate=Decimal('10.00'),
        vat_enabled=False,
    )


def _user(email):
    return User.objects.create_user(
        username=email.replace('@', '_').replace('.', '_'),
        email=email,
        password='Pass1234!',
    )


def _member(user, tenant, role='staff'):
    return TenantMembership.objects.create(
        user=user, tenant=tenant, role=role, is_active=True,
    )


def _ticket_type(tenant, name='Support', sla_hours=24):
    return TicketType.objects.create(
        tenant=tenant,
        name=name,
        default_sla_hours=sla_hours,
        coin_service_rate=Decimal('25.00'),
        coin_product_rate=Decimal('1.00'),
    )


def _make_ticket(service, ticket_type, assigned_to=None, title='Test Ticket'):
    data = {'title': title, 'ticket_type': ticket_type, 'priority': 'medium'}
    if assigned_to:
        data['assigned_to'] = assigned_to
    return service.create(data)


def _department(tenant, name='Support Dept', creator=None):
    from departments.models import Department
    return Department.objects.create(tenant=tenant, name=name, created_by=creator)


# ─── Assignment on Creation ───────────────────────────────────────────────────

@pytest.mark.django_db
def test_ticket_created_with_assignment_fires_assigned_event(settings):
    """Creating a ticket with assigned_to set publishes ticket.assigned event."""
    from unittest.mock import patch

    tenant = _tenant('ext-create-assign')
    admin = _user('admin@ext-create-assign.com')
    staff = _user('staff@ext-create-assign.com')
    _member(admin, tenant, role='admin')
    _member(staff, tenant, role='staff')
    tt = _ticket_type(tenant)

    service = TicketService(tenant=tenant, user=admin)
    with patch('core.events.EventBus.publish') as mock_publish:
        ticket = _make_ticket(service, tt, assigned_to=staff)

    published_events = [call.args[0] for call in mock_publish.call_args_list]
    assert 'ticket.assigned' in published_events


@pytest.mark.django_db
def test_ticket_created_with_assignment_has_timeline_entry():
    """Creating a ticket with assigned_to produces an EVENT_ASSIGNED timeline entry."""
    tenant = _tenant('ext-create-timeline')
    admin = _user('admin@ext-create-timeline.com')
    staff = _user('staff@ext-create-timeline.com')
    _member(admin, tenant, role='admin')
    _member(staff, tenant, role='staff')
    tt = _ticket_type(tenant)

    service = TicketService(tenant=tenant, user=admin)
    ticket = _make_ticket(service, tt, assigned_to=staff)

    assign_entries = TicketTimeline.objects.filter(
        ticket=ticket, event_type=TicketTimeline.EVENT_ASSIGNED,
    )
    assert assign_entries.exists(), "Expected EVENT_ASSIGNED timeline entry on creation with assigned_to"


@pytest.mark.django_db
def test_ticket_created_without_assignment_no_assigned_timeline():
    """Creating a ticket with no assigned_to must NOT create an EVENT_ASSIGNED entry."""
    tenant = _tenant('ext-create-noassign')
    admin = _user('admin@ext-create-noassign.com')
    _member(admin, tenant, role='admin')
    tt = _ticket_type(tenant)

    service = TicketService(tenant=tenant, user=admin)
    ticket = _make_ticket(service, tt)

    assert not TicketTimeline.objects.filter(
        ticket=ticket, event_type=TicketTimeline.EVENT_ASSIGNED,
    ).exists()


# ─── Transfer ─────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_transfer_moves_ticket_to_department():
    """transfer() updates ticket.department and creates a TicketTransfer record."""
    tenant = _tenant('ext-transfer')
    admin = _user('admin@ext-transfer.com')
    _member(admin, tenant, role='admin')
    tt = _ticket_type(tenant)

    dept_a = _department(tenant, 'Department A', creator=admin)
    dept_b = _department(tenant, 'Department B', creator=admin)

    service = TicketService(tenant=tenant, user=admin)
    ticket = service.create({'title': 'Transfer Me', 'ticket_type': tt, 'priority': 'low', 'department': dept_a})

    transfer_obj, updated_ticket = service.transfer(
        ticket, to_dept_id=dept_b.pk, actor=admin, reason='Better team'
    )

    updated_ticket.refresh_from_db()
    assert updated_ticket.department == dept_b
    assert isinstance(transfer_obj, TicketTransfer)
    assert transfer_obj.to_department == dept_b
    assert transfer_obj.reason == 'Better team'


@pytest.mark.django_db
def test_transfer_wrong_tenant_raises_not_found():
    """transfer() to a department from another tenant raises NotFoundError."""
    from core.exceptions import NotFoundError

    tenant_a = _tenant('ext-xfer-a')
    tenant_b = _tenant('ext-xfer-b')
    admin_a = _user('admin@ext-xfer-a.com')
    admin_b = _user('admin@ext-xfer-b.com')
    _member(admin_a, tenant_a, role='admin')
    _member(admin_b, tenant_b, role='admin')
    tt = _ticket_type(tenant_a)
    foreign_dept = _department(tenant_b, creator=admin_b)

    service = TicketService(tenant=tenant_a, user=admin_a)
    ticket = _make_ticket(service, tt)

    with pytest.raises(NotFoundError):
        service.transfer(ticket, to_dept_id=foreign_dept.pk, actor=admin_a)


@pytest.mark.django_db
def test_transfer_creates_timeline_entry():
    """transfer() creates an EVENT_TRANSFERRED timeline entry."""
    tenant = _tenant('ext-xfer-timeline')
    admin = _user('admin@ext-xfer-timeline.com')
    _member(admin, tenant, role='admin')
    tt = _ticket_type(tenant)
    dept = _department(tenant, creator=admin)

    service = TicketService(tenant=tenant, user=admin)
    ticket = _make_ticket(service, tt)
    service.transfer(ticket, to_dept_id=dept.pk, actor=admin, reason='Routing')

    assert TicketTimeline.objects.filter(
        ticket=ticket, event_type=TicketTimeline.EVENT_TRANSFERRED,
    ).exists()


# ─── Status transitions: cancel / reopen events ───────────────────────────────

@pytest.mark.django_db
def test_cancel_fires_ticket_cancelled_event():
    """change_status to cancelled publishes ticket.cancelled (not generic changed)."""
    from unittest.mock import patch

    tenant = _tenant('ext-cancel-event')
    admin = _user('admin@ext-cancel-event.com')
    _member(admin, tenant, role='admin')
    tt = _ticket_type(tenant)

    service = TicketService(tenant=tenant, user=admin)
    ticket = _make_ticket(service, tt)

    with patch('core.events.EventBus.publish') as mock_publish:
        service.change_status(ticket, Ticket.STATUS_CANCELLED, actor=admin, is_manager=True)

    published_events = [call.args[0] for call in mock_publish.call_args_list]
    assert 'ticket.cancelled' in published_events
    assert 'ticket.status.changed' not in published_events


@pytest.mark.django_db
def test_reopen_from_resolved_fires_ticket_reopened_event():
    """Changing status FROM resolved to open fires ticket.reopened."""
    from unittest.mock import patch

    tenant = _tenant('ext-reopen-event')
    admin = _user('admin@ext-reopen-event.com')
    staff = _user('staff@ext-reopen-event.com')
    _member(admin, tenant, role='admin')
    _member(staff, tenant, role='staff')
    tt = _ticket_type(tenant)

    service = TicketService(tenant=tenant, user=admin)
    ticket = _make_ticket(service, tt, assigned_to=staff)
    ticket.refresh_from_db()

    service.change_status(ticket, Ticket.STATUS_RESOLVED, actor=admin, is_manager=True)
    ticket.refresh_from_db()

    with patch('core.events.EventBus.publish') as mock_publish:
        service.change_status(ticket, Ticket.STATUS_OPEN, actor=admin, is_manager=True)

    published_events = [call.args[0] for call in mock_publish.call_args_list]
    assert 'ticket.reopened' in published_events


@pytest.mark.django_db
def test_closed_ticket_cannot_be_cancelled():
    """change_status on a closed ticket raises TicketStateError."""
    from core.exceptions import TicketStateError

    tenant = _tenant('ext-closed-cancel')
    admin = _user('admin@ext-closed-cancel.com')
    staff = _user('staff@ext-closed-cancel.com')
    _member(admin, tenant, role='admin')
    _member(staff, tenant, role='staff')
    tt = _ticket_type(tenant)

    service = TicketService(tenant=tenant, user=admin)
    ticket = _make_ticket(service, tt, assigned_to=staff)
    ticket.refresh_from_db()
    service.change_status(ticket, Ticket.STATUS_RESOLVED, actor=admin, is_manager=True)
    ticket.refresh_from_db()
    service.close_ticket(ticket, coin_amount=Decimal('0'), actor=admin)
    ticket.refresh_from_db()

    with pytest.raises(TicketStateError):
        service.change_status(ticket, Ticket.STATUS_CANCELLED, actor=admin, is_manager=True)


# ─── Comment lifecycle ────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_add_comment_creates_timeline_and_event():
    """add_comment() creates comment + EVENT_COMMENTED timeline + publishes event."""
    from unittest.mock import patch
    from tickets.services import add_comment  # flat services.py module
    from tickets.models import TicketComment

    tenant = _tenant('ext-comment')
    admin = _user('admin@ext-comment.com')
    _member(admin, tenant, role='admin')
    tt = _ticket_type(tenant)

    service = TicketService(tenant=tenant, user=admin)
    ticket = _make_ticket(service, tt)

    with patch('core.events.EventBus.publish') as mock_publish:
        comment = add_comment(ticket, author=admin, body='Hello world', tenant=tenant)

    assert isinstance(comment, TicketComment)
    assert comment.body == 'Hello world'
    assert TicketTimeline.objects.filter(
        ticket=ticket, event_type=TicketTimeline.EVENT_COMMENTED,
    ).exists()
    published_events = [call.args[0] for call in mock_publish.call_args_list]
    assert 'ticket.comment.added' in published_events


# ─── Cross-tenant isolation ───────────────────────────────────────────────────

@pytest.mark.django_db
def test_tickets_are_tenant_isolated():
    """A ticket created in tenant A is not visible via tenant B's service."""
    tenant_a = _tenant('ext-iso-a')
    tenant_b = _tenant('ext-iso-b')
    admin_a = _user('admin@ext-iso-a.com')
    admin_b = _user('admin@ext-iso-b.com')
    _member(admin_a, tenant_a, role='admin')
    _member(admin_b, tenant_b, role='admin')
    tt_a = _ticket_type(tenant_a)

    svc_a = TicketService(tenant=tenant_a, user=admin_a)
    ticket_a = _make_ticket(svc_a, tt_a, title='Tenant A Ticket')

    # Direct .filter(tenant=tenant_b) must return zero rows — ticket_a belongs to tenant_a
    pks = list(Ticket.objects.filter(tenant=tenant_b).values_list('pk', flat=True))
    assert ticket_a.pk not in pks


# ─── Staff permission enforcement ─────────────────────────────────────────────

@pytest.mark.django_db
def test_staff_cannot_resolve_unassigned_ticket():
    """Staff trying to resolve a ticket not assigned to them gets ForbiddenError."""
    from core.exceptions import ForbiddenError

    tenant = _tenant('ext-staff-perm')
    admin = _user('admin@ext-staff-perm.com')
    staff = _user('staff@ext-staff-perm.com')
    _member(admin, tenant, role='admin')
    _member(staff, tenant, role='staff')
    tt = _ticket_type(tenant)

    service = TicketService(tenant=tenant, user=staff)
    # Ticket is unassigned (i.e. not assigned to staff)
    admin_service = TicketService(tenant=tenant, user=admin)
    ticket = _make_ticket(admin_service, tt)

    with pytest.raises(ForbiddenError):
        service.change_status(
            ticket,
            Ticket.STATUS_RESOLVED,
            actor=staff,
            is_manager=False,
            requesting_user_id=staff.pk,
        )


# ─── SLA overdue task — Gap 4 ─────────────────────────────────────────────────

@pytest.mark.django_db
def test_task_mark_overdue_tickets_sets_breached_flag():
    """task_mark_overdue_tickets marks TicketSLA.breached=True for past-due SLAs."""
    from django.utils import timezone
    from tickets.models import TicketSLA
    from tickets.tasks import task_mark_overdue_tickets

    tenant = _tenant('ext-overdue-flag')
    admin = _user('admin@ext-overdue-flag.com')
    _member(admin, tenant, role='admin')
    tt = _ticket_type(tenant)

    service = TicketService(tenant=tenant, user=admin)
    ticket = _make_ticket(service, tt)

    # TicketService.create() auto-creates a TicketSLA. Back-date its breach_at.
    past = timezone.now() - timezone.timedelta(hours=2)
    TicketSLA.objects.filter(ticket=ticket).update(breach_at=past, breached=False)
    sla = TicketSLA.objects.get(ticket=ticket)

    task_mark_overdue_tickets.apply(args=[tenant.pk])

    sla.refresh_from_db()
    assert sla.breached is True
    assert sla.breached_at is not None


@pytest.mark.django_db
def test_task_mark_overdue_tickets_publishes_overdue_event():
    """task_mark_overdue_tickets publishes the ticket.overdue event for each breached ticket."""
    from unittest.mock import patch
    from django.utils import timezone
    from tickets.models import TicketSLA
    from tickets.tasks import task_mark_overdue_tickets

    tenant = _tenant('ext-overdue-event')
    admin = _user('admin@ext-overdue-event.com')
    _member(admin, tenant, role='admin')
    tt = _ticket_type(tenant)

    service = TicketService(tenant=tenant, user=admin)
    ticket = _make_ticket(service, tt)

    # Back-date the auto-created SLA so the ticket is overdue
    past = timezone.now() - timezone.timedelta(hours=1)
    TicketSLA.objects.filter(ticket=ticket).update(breach_at=past, breached=False)

    with patch('core.events.EventBus.publish') as mock_publish:
        task_mark_overdue_tickets.apply(args=[tenant.pk])

    published_events = [call.args[0] for call in mock_publish.call_args_list]
    assert 'ticket.overdue' in published_events


@pytest.mark.django_db
def test_task_mark_overdue_skips_already_breached_slas():
    """task_mark_overdue_tickets does NOT re-publish for SLAs already marked breached."""
    from unittest.mock import patch
    from django.utils import timezone
    from tickets.models import TicketSLA
    from tickets.tasks import task_mark_overdue_tickets

    tenant = _tenant('ext-overdue-skip')
    admin = _user('admin@ext-overdue-skip.com')
    _member(admin, tenant, role='admin')
    tt = _ticket_type(tenant)

    service = TicketService(tenant=tenant, user=admin)
    ticket = _make_ticket(service, tt)

    # Mark the auto-created SLA as already breached — task must skip it
    past = timezone.now() - timezone.timedelta(hours=1)
    TicketSLA.objects.filter(ticket=ticket).update(
        breach_at=past,
        breached=True,
        breached_at=timezone.now() - timezone.timedelta(minutes=30),
    )

    with patch('core.events.EventBus.publish') as mock_publish:
        task_mark_overdue_tickets.apply(args=[tenant.pk])

    published_events = [call.args[0] for call in mock_publish.call_args_list]
    assert 'ticket.overdue' not in published_events


# ─── Email smoke tests — Gap 6 ────────────────────────────────────────────────

@pytest.mark.django_db
def test_send_ticket_assigned_sends_email_to_assignee():
    """send_ticket_assigned() delivers an email to the assignee's address."""
    from django.core import mail
    from django.test import override_settings
    from notifications.email import send_ticket_assigned

    tenant = _tenant('ext-email-smoke')
    admin = _user('admin@ext-email-smoke.com')
    staff = _user('staff@ext-email-smoke.com')
    _member(admin, tenant, role='admin')
    _member(staff, tenant, role='staff')
    tt = _ticket_type(tenant)

    service = TicketService(tenant=tenant, user=admin)
    ticket = _make_ticket(service, tt, assigned_to=staff)

    with override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend'):
        send_ticket_assigned(ticket, staff)

    assert len(mail.outbox) == 1
    assert staff.email in mail.outbox[0].to
    assert ticket.ticket_number in mail.outbox[0].subject


@pytest.mark.django_db
def test_task_send_ticket_assigned_calls_email_function():
    """task_send_ticket_assigned Celery task invokes send_ticket_assigned with correct objects."""
    from unittest.mock import patch
    from notifications.tasks import task_send_ticket_assigned

    tenant = _tenant('ext-task-email')
    admin = _user('admin@ext-task-email.com')
    staff = _user('staff@ext-task-email.com')
    _member(admin, tenant, role='admin')
    _member(staff, tenant, role='staff')
    tt = _ticket_type(tenant)

    service = TicketService(tenant=tenant, user=admin)
    ticket = _make_ticket(service, tt, assigned_to=staff)

    # send_ticket_assigned is imported inside the task function body,
    # so we must patch it at its definition location.
    with patch('notifications.email.send_ticket_assigned') as mock_send:
        task_send_ticket_assigned.apply(args=[ticket.pk, staff.pk])

    mock_send.assert_called_once()
    call_ticket, call_assignee = mock_send.call_args.args
    assert call_ticket.pk == ticket.pk
    assert call_assignee.pk == staff.pk


@pytest.mark.django_db
def test_send_ticket_assigned_skips_user_without_email():
    """send_ticket_assigned() sends nothing when the assignee has no email address."""
    from django.core import mail
    from django.test import override_settings
    from notifications.email import send_ticket_assigned

    tenant = _tenant('ext-email-noemail')
    admin = _user('admin@ext-email-noemail.com')
    staff = _user('noemail@ext-email-noemail.com')
    staff.email = ''
    staff.save(update_fields=['email'])
    _member(admin, tenant, role='admin')
    _member(staff, tenant, role='staff')
    tt = _ticket_type(tenant)

    service = TicketService(tenant=tenant, user=admin)
    ticket = _make_ticket(service, tt, assigned_to=staff)

    with override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend'):
        send_ticket_assigned(ticket, staff)

    assert len(mail.outbox) == 0
