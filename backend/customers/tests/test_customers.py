"""
customers/tests/test_customers.py
===================================
Unit tests for customer service functions and EventBus publishing.

Run inside Docker:
    docker exec nexus_bms-web-1 python -m pytest customers/tests/test_customers.py -v
"""
import pytest
from decimal import Decimal

from tenants.models import Tenant, Plan
from accounts.models import User, TenantMembership
from customers.models import Customer
from unittest.mock import patch, call
from customers import services as customer_svc


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _plan():
    return Plan.objects.get_or_create(
        slug='basic', defaults={'name': 'Basic', 'description': 'Test plan'},
    )[0]


def _tenant(slug='custtest'):
    return Tenant.objects.create(
        name=f'Tenant {slug}', slug=slug, plan=_plan(), is_active=True,
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


# ─── Create ───────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_create_customer_saves_record():
    """create_customer persists a Customer with correct tenant binding."""
    tenant = _tenant('cust-create')
    admin = _user('admin@cust-create.com')
    _member(admin, tenant, role='admin')

    customer = customer_svc.create_customer(
        tenant=tenant,
        created_by=admin,
        data={'name': 'Acme Corp', 'email': 'acme@corp.com', 'type': 'individual'},
    )

    assert customer.pk is not None
    assert customer.tenant == tenant
    assert customer.name == 'Acme Corp'
    assert customer.is_active is True


@pytest.mark.django_db
def test_create_customer_publishes_event():
    """create_customer fires customer.created via EventBus."""
    from core.events import EventBus
    from unittest.mock import patch

    tenant = _tenant('cust-event')
    admin = _user('admin@cust-event.com')
    _member(admin, tenant, role='admin')

    published = []
    original_publish = EventBus.publish

    def _capture(event, payload, **kwargs):
        published.append((event, payload))
        return original_publish(event, payload, **kwargs)

    with patch.object(EventBus, 'publish', side_effect=_capture):
        customer = customer_svc.create_customer(
            tenant=tenant,
            created_by=admin,
            data={'name': 'Test Customer'},
        )

    events = [e for e, _ in published]
    assert 'customer.created' in events
    payload = next(p for e, p in published if e == 'customer.created')
    assert payload['id'] == customer.pk
    assert payload['tenant_id'] == tenant.pk


# ─── Update ───────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_update_customer_changes_fields():
    """update_customer applies changes and publishes customer.updated."""
    tenant = _tenant('cust-update')
    admin = _user('admin@cust-update.com')
    _member(admin, tenant, role='admin')

    customer = customer_svc.create_customer(
        tenant=tenant,
        created_by=admin,
        data={'name': 'Old Name'},
    )

    updated = customer_svc.update_customer(
        instance=customer,
        tenant=tenant,
        data={'name': 'New Name'},
    )

    assert updated.name == 'New Name'
    customer.refresh_from_db()
    assert customer.name == 'New Name'


# ─── Soft Delete ──────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_delete_customer_soft_deletes():
    """soft_delete_customer sets is_deleted=True, record still in DB."""
    tenant = _tenant('cust-del')
    admin = _user('admin@cust-del.com')
    _member(admin, tenant, role='admin')

    customer = customer_svc.create_customer(
        tenant=tenant,
        created_by=admin,
        data={'name': 'To Delete'},
    )
    pk = customer.pk

    customer_svc.soft_delete_customer(instance=customer, tenant=tenant)

    raw = Customer.objects.filter(pk=pk).first()
    # TenantModel.soft_delete() sets is_deleted=True; record must still exist
    assert raw is not None
    assert raw.is_deleted is True


@pytest.mark.django_db
def test_delete_customer_rejected_if_wrong_tenant():
    """soft_delete_customer raises ValueError if tenant mismatch."""
    tenantA = _tenant('cust-delA')
    tenantB = _tenant('cust-delB')
    admin = _user('admin@cust-delA.com')
    _member(admin, tenantA, role='admin')

    customer = customer_svc.create_customer(
        tenant=tenantA,
        created_by=admin,
        data={'name': 'Alice'},
    )

    with pytest.raises(ValueError):
        customer_svc.soft_delete_customer(instance=customer, tenant=tenantB)


@pytest.mark.django_db
def test_delete_customer_publishes_event():
    """soft_delete_customer fires customer.deleted via EventBus."""
    from core.events import EventBus
    from unittest.mock import patch

    tenant = _tenant('cust-del-ev')
    admin = _user('admin@cust-del-ev.com')
    _member(admin, tenant, role='admin')

    customer = customer_svc.create_customer(
        tenant=tenant,
        created_by=admin,
        data={'name': 'Eve'},
    )

    published = []
    original_publish = EventBus.publish

    def _capture(event, payload, **kwargs):
        published.append((event, payload))
        return original_publish(event, payload, **kwargs)

    with patch.object(EventBus, 'publish', side_effect=_capture):
        customer_svc.soft_delete_customer(instance=customer, tenant=tenant)

    events = [e for e, _ in published]
    assert 'customer.deleted' in events
    payload = next(p for e, p in published if e == 'customer.deleted')
    assert payload['id'] == customer.pk
    assert payload['tenant_id'] == tenant.pk
