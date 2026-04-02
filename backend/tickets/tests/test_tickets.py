"""
tickets/tests/test_tickets.py
==============================
Unit tests for TicketService and ticket-related EventBus listeners.

Run inside Docker:
    docker exec nexus_bms-web-1 python -m pytest tickets/tests/test_tickets.py -v
"""
import pytest
from decimal import Decimal

from django.test import override_settings

from tenants.models import Tenant, Plan
from accounts.models import User, TenantMembership
from customers.models import Customer
from tickets.models import Ticket, TicketType
from tickets.services.ticket_service import TicketService


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _plan():
    return Plan.objects.get_or_create(
        slug='basic', defaults={'name': 'Basic', 'description': 'Test plan'},
    )[0]


def _tenant(slug='tickettest'):
    return Tenant.objects.create(
        name=f'Tenant {slug}',
        slug=slug,
        plan=_plan(),
        is_active=True,
        coin_to_money_rate=Decimal('10.00'),
        vat_enabled=False,
    )


def _user(email, password='Pass1234!'):
    return User.objects.create_user(
        username=email.replace('@', '_').replace('.', '_'),
        email=email,
        password=password,
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


def _customer(tenant, creator):
    return Customer.objects.create(
        tenant=tenant,
        name='John Doe',
        email='john@example.com',
        created_by=creator,
    )


def _make_ticket(service, ticket_type, customer, title='Test Ticket'):
    """Create a ticket via the service with minimal required data."""
    return service.create({
        'title': title,
        'ticket_type': ticket_type,
        'customer': customer,
        'priority': 'medium',
    })


# ─── Ticket Creation ──────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_ticket_number_auto_generated():
    """Tickets get TKT-XXXX numbers scoped per tenant."""
    tenant = _tenant('tkt-number')
    admin = _user('admin@tkt-number.com')
    _member(admin, tenant, role='admin')
    tt = _ticket_type(tenant)

    service = TicketService(tenant=tenant, user=admin)
    ticket = _make_ticket(service, tt, None)

    assert ticket.ticket_number.startswith('TKT-')
    assert ticket.tenant == tenant


@pytest.mark.django_db
def test_ticket_numbers_increment_per_tenant():
    """Each tenant maintains its own ticket counter."""
    tenantA = _tenant('tkt-incA')
    tenantB = _tenant('tkt-incB')
    adminA = _user('admin@tkt-incA.com')
    adminB = _user('admin@tkt-incB.com')
    _member(adminA, tenantA, role='admin')
    _member(adminB, tenantB, role='admin')
    ttA = _ticket_type(tenantA)
    ttB = _ticket_type(tenantB)

    svcA = TicketService(tenant=tenantA, user=adminA)
    svcB = TicketService(tenant=tenantB, user=adminB)

    t1 = _make_ticket(svcA, ttA, None, 'First A')
    t2 = _make_ticket(svcA, ttA, None, 'Second A')
    tb1 = _make_ticket(svcB, ttB, None, 'First B')

    assert t1.ticket_number != t2.ticket_number
    assert tb1.ticket_number == 'TKT-0001'  # B's own counter starts at 1


@pytest.mark.django_db
def test_ticket_sla_created_on_create():
    """A TicketSLA record is created when a ticket is created."""
    from tickets.models import TicketSLA

    tenant = _tenant('tkt-sla')
    admin = _user('admin@tkt-sla.com')
    _member(admin, tenant, role='admin')
    tt = _ticket_type(tenant, sla_hours=8)

    service = TicketService(tenant=tenant, user=admin)
    ticket = _make_ticket(service, tt, None)

    sla = TicketSLA.objects.filter(ticket=ticket).first()
    assert sla is not None
    assert sla.sla_hours == 8


@pytest.mark.django_db
def test_ticket_create_with_customer():
    """Ticket created with a linked customer."""
    tenant = _tenant('tkt-cust')
    admin = _user('admin@tkt-cust.com')
    _member(admin, tenant, role='admin')
    tt = _ticket_type(tenant)
    customer = _customer(tenant, admin)

    service = TicketService(tenant=tenant, user=admin)
    ticket = _make_ticket(service, tt, customer)

    assert ticket.customer == customer


# ─── Ticket Assignment ────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_ticket_assign_to_staff():
    """Assigning a ticket sets assigned_to and creates a timeline entry."""
    from tickets.models import TicketTimeline

    tenant = _tenant('tkt-assign')
    admin = _user('admin@tkt-assign.com')
    staff = _user('staff@tkt-assign.com')
    _member(admin, tenant, role='admin')
    _member(staff, tenant, role='staff')
    tt = _ticket_type(tenant)

    service = TicketService(tenant=tenant, user=admin)
    ticket = _make_ticket(service, tt, None)
    service.assign(ticket, user_id=staff.id, actor=admin)

    ticket.refresh_from_db()
    assert ticket.assigned_to == staff
    assert TicketTimeline.objects.filter(ticket=ticket, actor=admin).exists()


# ─── Status Changes ───────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_ticket_status_change():
    """Status changes from open → in_progress → resolved."""
    tenant = _tenant('tkt-status')
    admin = _user('admin@tkt-status.com')
    _member(admin, tenant, role='admin')
    tt = _ticket_type(tenant)

    service = TicketService(tenant=tenant, user=admin)
    ticket = _make_ticket(service, tt, None)

    assert ticket.status == Ticket.STATUS_OPEN

    service.change_status(ticket, Ticket.STATUS_IN_PROGRESS, actor=admin, is_manager=True)
    ticket.refresh_from_db()
    assert ticket.status == Ticket.STATUS_IN_PROGRESS

    service.change_status(ticket, Ticket.STATUS_RESOLVED, actor=admin, is_manager=True)
    ticket.refresh_from_db()
    assert ticket.status == Ticket.STATUS_RESOLVED


# ─── Ticket Close + Coins ─────────────────────────────────────────────────────

@pytest.mark.django_db
def test_close_ticket_creates_coin_transaction():
    """Closing a ticket auto-creates a pending CoinTransaction for assigned staff."""
    from accounting.models import CoinTransaction

    tenant = _tenant('tkt-coins')
    admin = _user('admin@tkt-coins.com')
    staff = _user('staff@tkt-coins.com')
    _member(admin, tenant, role='admin')
    _member(staff, tenant, role='staff')
    tt = _ticket_type(tenant, sla_hours=24)

    service = TicketService(tenant=tenant, user=admin)
    ticket = _make_ticket(service, tt, None)
    service.assign(ticket, user_id=staff.id, actor=admin)
    ticket.refresh_from_db()

    # Must be resolved before closing
    service.change_status(ticket, Ticket.STATUS_RESOLVED, actor=admin, is_manager=True)
    ticket.refresh_from_db()
    updated_ticket, coin_txn = service.close_ticket(ticket, coin_amount=Decimal('50'), actor=admin)

    assert updated_ticket.status == Ticket.STATUS_CLOSED
    assert coin_txn is not None
    assert coin_txn.status == CoinTransaction.STATUS_PENDING
    assert coin_txn.source_type == CoinTransaction.SOURCE_TICKET
    assert coin_txn.source_id == ticket.pk
    assert coin_txn.amount == Decimal('50')


@pytest.mark.django_db
def test_close_ticket_is_idempotent():
    """Closing an already-closed ticket raises TicketStateError — no extra CoinTransaction created."""
    from accounting.models import CoinTransaction
    from core.exceptions import TicketStateError

    tenant = _tenant('tkt-idem')
    admin = _user('admin@tkt-idem.com')
    staff = _user('staff@tkt-idem.com')
    _member(admin, tenant, role='admin')
    _member(staff, tenant, role='staff')
    tt = _ticket_type(tenant)

    service = TicketService(tenant=tenant, user=admin)
    ticket = _make_ticket(service, tt, None)
    service.assign(ticket, user_id=staff.id, actor=admin)
    ticket.refresh_from_db()

    # Must be resolved before closing
    service.change_status(ticket, Ticket.STATUS_RESOLVED, actor=admin, is_manager=True)
    ticket.refresh_from_db()

    service.close_ticket(ticket, coin_amount=Decimal('30'), actor=admin)

    # Second close attempt raises TicketStateError (ticket is already closed)
    with pytest.raises(TicketStateError):
        service.close_ticket(ticket, coin_amount=Decimal('30'), actor=admin)

    # Only one CoinTransaction was created
    count = CoinTransaction.objects.filter(
        source_type=CoinTransaction.SOURCE_TICKET,
        source_id=ticket.pk,
    ).count()
    assert count == 1


# ─── EventBus Listeners ───────────────────────────────────────────────────────

@pytest.mark.django_db
def test_on_customer_deleted_detaches_from_tickets():
    """When customer.deleted fires, tickets lose their customer FK (set to None)."""
    from core.events import EventBus

    tenant = _tenant('tkt-cust-del')
    admin = _user('admin@tkt-cust-del.com')
    _member(admin, tenant, role='admin')
    tt = _ticket_type(tenant)
    customer = _customer(tenant, admin)

    service = TicketService(tenant=tenant, user=admin)
    ticket = _make_ticket(service, tt, customer)
    assert ticket.customer is not None

    EventBus.publish(
        'customer.deleted',
        {'id': customer.pk, 'tenant_id': tenant.pk},
        tenant=tenant,
    )

    ticket.refresh_from_db()
    assert ticket.customer is None


@pytest.mark.django_db
def test_on_staff_deleted_unassigns_from_tickets():
    """When staff.deleted fires, tickets lose their assigned_to FK (set to None)."""
    from core.events import EventBus

    tenant = _tenant('tkt-staff-del')
    admin = _user('admin@tkt-staff-del.com')
    staff = _user('staff@tkt-staff-del.com')
    _member(admin, tenant, role='admin')
    _member(staff, tenant, role='staff')
    tt = _ticket_type(tenant)

    service = TicketService(tenant=tenant, user=admin)
    ticket = _make_ticket(service, tt, None)
    service.assign(ticket, user_id=staff.id, actor=admin)
    ticket.refresh_from_db()
    assert ticket.assigned_to == staff

    EventBus.publish(
        'staff.deleted',
        {'id': staff.pk, 'tenant_id': tenant.pk},
        tenant=tenant,
    )

    ticket.refresh_from_db()
    assert ticket.assigned_to is None
