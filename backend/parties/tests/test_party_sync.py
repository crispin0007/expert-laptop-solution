import pytest
from django.core.management import call_command

from accounts.models import TenantMembership
from accounts.models import User
from accounts.services import invite_staff
from customers.models import Customer
from inventory.models import Supplier
from parties.models import Party
from parties.listeners import on_staff_created_link_party
from parties.services import (
    resolve_or_create_customer_party,
    resolve_or_create_staff_party,
    resolve_or_create_supplier_party,
)
from tenants.models import Plan, Tenant


def _plan():
    return Plan.objects.get_or_create(
        slug='basic', defaults={'name': 'Basic', 'description': 'Test plan'},
    )[0]


def _tenant(slug='partytest'):
    return Tenant.objects.create(
        name=f'Tenant {slug}', slug=slug, plan=_plan(), is_active=True,
    )


def _user(email, password=None):
    pwd = password or 'test-pass'
    return User.objects.create_user(
        username=email.replace('@', '_').replace('.', '_'),
        email=email,
        password=pwd,
    )


@pytest.mark.django_db
def test_resolve_or_create_customer_party_creates_and_is_idempotent():
    tenant = _tenant('party-customer')
    admin = _user('admin@party-customer.com')
    customer = Customer.objects.create(
        tenant=tenant,
        created_by=admin,
        name='Acme Corp',
        email='acme@example.com',
        phone='9800000001',
        pan_number='123456789',
    )

    first = resolve_or_create_customer_party(customer)
    customer.refresh_from_db()

    assert first.action in {'created-and-linked', 'already-linked'}
    assert customer.party_id is not None
    assert customer.party.account_id is not None
    assert customer.party.account.group.slug == 'sundry_debtors'
    assert customer.party.account.parent.code == '1200'

    second = resolve_or_create_customer_party(customer)
    assert second.action == 'already-linked'
    assert Party.objects.filter(tenant=tenant, party_type=Party.TYPE_CUSTOMER).count() == 1


@pytest.mark.django_db
def test_resolve_or_create_supplier_party_creates_and_is_idempotent():
    tenant = _tenant('party-supplier')
    admin = _user('admin@party-supplier.com')
    supplier = Supplier.objects.create(
        tenant=tenant,
        created_by=admin,
        name='Widget Supply',
        email='supplier@example.com',
        phone='9800000002',
        pan_number='987654321',
    )

    first = resolve_or_create_supplier_party(supplier)
    supplier.refresh_from_db()

    assert first.action in {'created-and-linked', 'already-linked'}
    assert supplier.party_id is not None
    assert supplier.party.account_id is not None
    assert supplier.party.account.group.slug == 'sundry_creditors'
    assert supplier.party.account.parent.code == '2100'

    second = resolve_or_create_supplier_party(supplier)
    assert second.action == 'already-linked'
    assert Party.objects.filter(tenant=tenant, party_type=Party.TYPE_SUPPLIER).count() == 1


@pytest.mark.django_db
def test_backfill_dry_run_does_not_write_links():
    tenant = _tenant('party-dryrun')
    admin = _user('admin@party-dryrun.com')
    staff = _user('staff@party-dryrun.com')

    customer = Customer.objects.create(
        tenant=tenant,
        created_by=admin,
        name='Dry Run Customer',
        email='dry-customer@example.com',
    )
    supplier = Supplier.objects.create(
        tenant=tenant,
        created_by=admin,
        name='Dry Run Supplier',
        email='dry-supplier@example.com',
    )
    membership = TenantMembership.objects.create(
        user=staff,
        tenant=tenant,
        role='staff',
        is_active=True,
    )

    customer_party_before = customer.party_id
    supplier_party_before = supplier.party_id
    staff_party_before = membership.party_id
    total_party_before = Party.objects.filter(tenant=tenant).count()

    call_command('backfill_parties', '--dry-run', '--limit', '100')

    customer.refresh_from_db()
    supplier.refresh_from_db()
    membership.refresh_from_db()

    assert customer.party_id == customer_party_before
    assert supplier.party_id == supplier_party_before
    assert membership.party_id == staff_party_before
    assert Party.objects.filter(tenant=tenant).count() == total_party_before


@pytest.mark.django_db
def test_resolve_or_create_staff_party_creates_and_is_idempotent():
    tenant = _tenant('party-staff')
    staff = _user('staff@party-staff.com')
    membership = TenantMembership.objects.create(
        user=staff,
        tenant=tenant,
        role='staff',
        pan_number='111222333',
        is_active=True,
    )

    first = resolve_or_create_staff_party(membership)
    membership.refresh_from_db()

    assert first.action == 'created-and-linked'
    assert membership.party_id is not None
    assert membership.party.party_type == Party.TYPE_STAFF
    assert membership.party.account_id is not None
    assert membership.party.account.group.slug == 'current_liabilities'
    assert membership.party.account.parent.code == '2400'

    second = resolve_or_create_staff_party(membership)
    assert second.action == 'already-linked'
    assert Party.objects.filter(tenant=tenant, party_type=Party.TYPE_STAFF).count() == 1


@pytest.mark.django_db
def test_staff_created_listener_links_staff_party():
    tenant = _tenant('party-staff-listener')
    staff = _user('staff-listener@party.com')
    membership = TenantMembership.objects.create(
        user=staff,
        tenant=tenant,
        role='staff',
        is_active=True,
    )

    on_staff_created_link_party({'id': staff.id, 'tenant_id': tenant.id}, tenant)
    membership.refresh_from_db()

    assert membership.party_id is not None
    assert membership.party.party_type == Party.TYPE_STAFF
    assert membership.party.account_id is not None
    assert membership.party.account.parent.code == '2400'


@pytest.mark.django_db
def test_invite_staff_flow_creates_staff_party_link():
    tenant = _tenant('party-staff-invite')
    invite_staff(
        tenant=tenant,
        data={
            'email': 'invited.staff@party.com',
            'full_name': 'Invited Staff',
            'role': 'staff',
        },
    )

    membership = TenantMembership.objects.select_related('party').get(
        tenant=tenant,
        user__email='invited.staff@party.com',
    )
    assert membership.party_id is not None
    assert membership.party.party_type == Party.TYPE_STAFF
