import pytest
from django.core.management import call_command

from accounts.models import User
from customers.models import Customer
from inventory.models import Supplier
from parties.models import Party
from parties.services import (
    resolve_or_create_customer_party,
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

    assert first.action == 'created-and-linked'
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

    assert first.action == 'created-and-linked'
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

    call_command('backfill_parties', '--dry-run', '--limit', '100')

    customer.refresh_from_db()
    supplier.refresh_from_db()

    assert customer.party_id is None
    assert supplier.party_id is None
    assert Party.objects.filter(tenant=tenant).count() == 0
