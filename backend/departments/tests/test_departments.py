"""
departments/tests/test_departments.py
=======================================
Unit tests for the departments module including the staff.deleted listener.

Run inside Docker:
    docker exec nexus_bms-web-1 python -m pytest departments/tests/test_departments.py -v
"""
import pytest

from tenants.models import Tenant, Plan
from accounts.models import User, TenantMembership
from departments.models import Department
from core.events import EventBus


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _plan():
    return Plan.objects.get_or_create(
        slug='basic', defaults={'name': 'Basic', 'description': 'Test plan'},
    )[0]


def _tenant(slug='depttest'):
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


def _dept(tenant, name, head=None):
    return Department.objects.create(tenant=tenant, name=name, head=head)


# ─── Creation ─────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_create_department_saves_record():
    """Department can be created with a name and optional head."""
    tenant = _tenant('dept-create')
    admin = _user('admin@dept-create.com')
    _member(admin, tenant, role='admin')

    dept = _dept(tenant, 'Engineering', head=admin)

    assert dept.pk is not None
    assert dept.tenant == tenant
    assert dept.name == 'Engineering'
    assert dept.head == admin


@pytest.mark.django_db
def test_department_name_unique_per_tenant():
    """Creating two departments with the same name in one tenant fails."""
    from django.db import IntegrityError

    tenant = _tenant('dept-unique')
    admin = _user('admin@dept-unique.com')
    _member(admin, tenant, role='admin')

    _dept(tenant, 'HR')
    with pytest.raises(IntegrityError):
        _dept(tenant, 'HR')


# ─── staff.deleted listener ───────────────────────────────────────────────────

@pytest.mark.django_db
def test_staff_deleted_clears_department_head():
    """When staff.deleted fires, the department head FK is set to None."""
    tenant = _tenant('dept-staff-del')
    staff = _user('staff@dept-staff-del.com')
    admin = _user('admin@dept-staff-del.com')
    _member(admin, tenant, role='admin')
    _member(staff, tenant, role='staff')

    dept = _dept(tenant, 'Support', head=staff)
    assert dept.head == staff

    EventBus.publish(
        'staff.deleted',
        {'id': staff.pk, 'tenant_id': tenant.pk},
        tenant=tenant,
    )

    dept.refresh_from_db()
    assert dept.head is None


@pytest.mark.django_db
def test_staff_deleted_only_affects_own_tenant():
    """staff.deleted from tenant A does not clear department head in tenant B."""
    tenantA = _tenant('dept-del-A')
    tenantB = _tenant('dept-del-B')
    staffA = _user('staff@dept-del-A.com')
    staffB = _user('staff@dept-del-B.com')
    _member(staffA, tenantA, role='staff')
    _member(staffB, tenantB, role='staff')

    deptA = _dept(tenantA, 'Sales', head=staffA)
    deptB = _dept(tenantB, 'Sales', head=staffB)

    # Fire event scoped to tenantA
    EventBus.publish(
        'staff.deleted',
        {'id': staffA.pk, 'tenant_id': tenantA.pk},
        tenant=tenantA,
    )

    deptA.refresh_from_db()
    deptB.refresh_from_db()

    assert deptA.head is None      # Cleared in A
    assert deptB.head == staffB    # Untouched in B


@pytest.mark.django_db
def test_staff_deleted_with_no_head_is_noop():
    """staff.deleted on a user who is not a head of any department does nothing."""
    tenant = _tenant('dept-del-noop')
    admin = _user('admin@dept-del-noop.com')
    other = _user('other@dept-del-noop.com')
    _member(admin, tenant, role='admin')
    _member(other, tenant, role='staff')

    dept = _dept(tenant, 'Ops', head=admin)

    # Fire event for 'other' who is not a dept head
    EventBus.publish(
        'staff.deleted',
        {'id': other.pk, 'tenant_id': tenant.pk},
        tenant=tenant,
    )

    dept.refresh_from_db()
    assert dept.head == admin  # unchanged
