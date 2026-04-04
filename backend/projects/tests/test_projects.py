"""
projects/tests/test_projects.py
=================================
Unit tests for project and task service functions, including EventBus events.

Run inside Docker:
    docker exec nexus_bms-web-1 python -m pytest projects/tests/test_projects.py -v
"""
import pytest
from decimal import Decimal

from tenants.models import Tenant, Plan
from accounts.models import User, TenantMembership
from projects.models import Project, ProjectTask
from projects import services as project_svc


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _plan():
    return Plan.objects.get_or_create(
        slug='basic', defaults={'name': 'Basic', 'description': 'Test plan'},
    )[0]


def _tenant(slug='projtest'):
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


def _make_project(tenant, admin, name='Test Project', status='planning'):
    return project_svc.create_project(
        tenant=tenant,
        created_by=admin,
        validated_data={
            'name': name,
            'status': status,
        },
    )


def _make_task(project, tenant, admin, title='Task A'):
    return project_svc.create_task(
        project=project,
        tenant=tenant,
        created_by=admin,
        validated_data={'title': title},
    )


# ─── Project Create ───────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_create_project_saves_record():
    """create_project persists a Project with correct tenant and status."""
    tenant = _tenant('proj-create')
    admin = _user('admin@proj-create.com')
    _member(admin, tenant, role='admin')

    project = _make_project(tenant, admin)

    assert project.pk is not None
    assert project.tenant == tenant
    assert project.name == 'Test Project'
    assert project.status == Project.STATUS_PLANNING


@pytest.mark.django_db
def test_create_project_publishes_event():
    """create_project fires project.created via EventBus."""
    from core.events import EventBus
    from unittest.mock import patch

    tenant = _tenant('proj-event')
    admin = _user('admin@proj-event.com')
    _member(admin, tenant, role='admin')

    published = []
    original = EventBus.publish

    def _capture(event, payload, **kwargs):
        published.append((event, payload))
        return original(event, payload, **kwargs)

    with patch.object(EventBus, 'publish', side_effect=_capture):
        project = _make_project(tenant, admin)

    events = [e for e, _ in published]
    assert 'project.created' in events
    payload = next(p for e, p in published if e == 'project.created')
    assert payload['id'] == project.pk
    assert payload['tenant_id'] == tenant.pk


# ─── Project Complete ─────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_project_completed_sets_completed_at():
    """Transitioning to completed sets completed_at timestamp."""
    tenant = _tenant('proj-complete')
    admin = _user('admin@proj-complete.com')
    _member(admin, tenant, role='admin')

    project = _make_project(tenant, admin)
    assert project.completed_at is None

    updated = project_svc.update_project(
        instance=project,
        tenant=tenant,
        validated_data={'status': Project.STATUS_COMPLETED},
    )

    assert updated.status == Project.STATUS_COMPLETED
    assert updated.completed_at is not None


@pytest.mark.django_db
def test_project_completed_publishes_event():
    """update_project fires project.completed when status → completed."""
    from core.events import EventBus
    from unittest.mock import patch

    tenant = _tenant('proj-comp-ev')
    admin = _user('admin@proj-comp-ev.com')
    _member(admin, tenant, role='admin')
    project = _make_project(tenant, admin)

    published = []
    original = EventBus.publish

    def _capture(event, payload, **kwargs):
        published.append((event, payload))
        return original(event, payload, **kwargs)

    with patch.object(EventBus, 'publish', side_effect=_capture):
        project_svc.update_project(
            instance=project,
            tenant=tenant,
            validated_data={'status': Project.STATUS_COMPLETED},
        )

    events = [e for e, _ in published]
    assert 'project.completed' in events


@pytest.mark.django_db
def test_project_complete_idempotent():
    """Completing an already-completed project does not re-fire project.completed."""
    from core.events import EventBus

    tenant = _tenant('proj-comp-idem')
    admin = _user('admin@proj-comp-idem.com')
    _member(admin, tenant, role='admin')
    project = _make_project(tenant, admin)

    project_svc.update_project(
        instance=project,
        tenant=tenant,
        validated_data={'status': Project.STATUS_COMPLETED},
    )
    project.refresh_from_db()

    fire_count = []
    original = EventBus.publish
    EventBus.publish = lambda e, p, **kw: (fire_count.append(1) if e == 'project.completed' else None) or original(e, p, **kw)
    try:
        project_svc.update_project(
            instance=project,
            tenant=tenant,
            validated_data={'status': Project.STATUS_COMPLETED},
        )
    finally:
        EventBus.publish = original

    assert len(fire_count) == 0  # old_status == 'completed', so no re-fire


# ─── Project Cancel ───────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_project_cancelled_publishes_event():
    """update_project fires project.cancelled when status → cancelled."""
    from core.events import EventBus
    from unittest.mock import patch

    tenant = _tenant('proj-cancel-ev')
    admin = _user('admin@proj-cancel-ev.com')
    _member(admin, tenant, role='admin')
    project = _make_project(tenant, admin)

    published = []
    original = EventBus.publish

    def _capture(event, payload, **kwargs):
        published.append((event, payload))
        return original(event, payload, **kwargs)

    with patch.object(EventBus, 'publish', side_effect=_capture):
        project_svc.update_project(
            instance=project,
            tenant=tenant,
            validated_data={'status': Project.STATUS_CANCELLED},
        )

    events = [e for e, _ in published]
    assert 'project.cancelled' in events


# ─── Task Create & Complete ───────────────────────────────────────────────────

@pytest.mark.django_db
def test_create_task_saves_record():
    """create_task persists a ProjectTask linked to its project."""
    tenant = _tenant('task-create')
    admin = _user('admin@task-create.com')
    _member(admin, tenant, role='admin')
    project = _make_project(tenant, admin)

    task = _make_task(project, tenant, admin, title='Do the thing')

    assert task.pk is not None
    assert task.project == project
    assert task.tenant == tenant
    assert task.status == ProjectTask.STATUS_TODO


@pytest.mark.django_db
def test_complete_task_sets_status_and_timestamp():
    """update_task_status to done sets completed_at."""
    tenant = _tenant('task-complete')
    admin = _user('admin@task-complete.com')
    _member(admin, tenant, role='admin')
    project = _make_project(tenant, admin)
    task = _make_task(project, tenant, admin)

    updated = project_svc.update_task_status(
        task=task,
        new_status=ProjectTask.STATUS_DONE,
    )

    assert updated.status == ProjectTask.STATUS_DONE
    assert updated.completed_at is not None


@pytest.mark.django_db
def test_complete_task_publishes_event():
    """update_task_status to done fires task.completed."""
    from core.events import EventBus
    from unittest.mock import patch

    tenant = _tenant('task-done-ev')
    admin = _user('admin@task-done-ev.com')
    _member(admin, tenant, role='admin')
    project = _make_project(tenant, admin)
    task = _make_task(project, tenant, admin)

    published = []
    original = EventBus.publish

    def _capture(event, payload, **kwargs):
        published.append((event, payload))
        return original(event, payload, **kwargs)

    with patch.object(EventBus, 'publish', side_effect=_capture):
        project_svc.update_task_status(task=task, new_status=ProjectTask.STATUS_DONE)

    events = [e for e, _ in published]
    assert 'task.completed' in events
    payload = next(p for e, p in published if e == 'task.completed')
    assert payload['project_id'] == project.pk
    assert payload['tenant_id'] == tenant.pk


@pytest.mark.django_db
def test_invalid_task_status_raises():
    """update_task_status raises ValueError for unknown status."""
    tenant = _tenant('task-invalid')
    admin = _user('admin@task-invalid.com')
    _member(admin, tenant, role='admin')
    project = _make_project(tenant, admin)
    task = _make_task(project, tenant, admin)

    with pytest.raises(ValueError):
        project_svc.update_task_status(task=task, new_status='flying')


# ─── Round-2 fix tests ────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_update_task_status_advances_updated_at():
    """update_task_status includes updated_at in save so the column advances."""
    import time
    tenant = _tenant('task-updat')
    admin = _user('admin@task-updat.com')
    _member(admin, tenant, role='admin')
    project = _make_project(tenant, admin)
    task = _make_task(project, tenant, admin)

    before = task.updated_at
    time.sleep(0.05)
    updated = project_svc.update_task_status(task=task, new_status=ProjectTask.STATUS_IN_PROGRESS)
    updated.refresh_from_db()

    assert updated.updated_at > before


@pytest.mark.django_db
def test_update_task_assignee_advances_updated_at():
    """update_task_assignee includes updated_at in save."""
    import time
    tenant = _tenant('task-assign-up')
    admin = _user('admin@task-assign-up.com')
    assignee = _user('staff@task-assign-up.com')
    _member(admin, tenant, role='admin')
    _member(assignee, tenant, role='staff')
    project = _make_project(tenant, admin)
    task = _make_task(project, tenant, admin)

    before = task.updated_at
    time.sleep(0.05)
    updated = project_svc.update_task_assignee(task=task, new_assignee_id=assignee.pk)
    updated.refresh_from_db()

    assert updated.updated_at > before


@pytest.mark.django_db
def test_coin_reward_reads_from_tenant():
    """Completing a task uses tenant.task_coin_reward, not the hardcoded 1."""
    from accounting.models import CoinTransaction
    tenant = _tenant('coin-reward')
    tenant.task_coin_reward = 5
    tenant.save(update_fields=['task_coin_reward'])
    admin = _user('admin@coin-reward.com')
    assignee = _user('staff@coin-reward.com')
    _member(admin, tenant, role='admin')
    _member(assignee, tenant, role='staff')
    project = _make_project(tenant, admin)
    task = _make_task(project, tenant, admin, title='Rewarded task')
    task.assigned_to = assignee
    task.save(update_fields=['assigned_to'])

    project_svc.update_task_status(task=task, new_status=ProjectTask.STATUS_DONE)

    txn = CoinTransaction.objects.filter(source_type='task', source_id=task.pk).first()
    assert txn is not None
    assert int(txn.amount) == 5


@pytest.mark.django_db
def test_file_attachment_rejects_oversized():
    """ProjectAttachmentSerializer rejects files > 20 MB."""
    from unittest.mock import MagicMock
    from projects.serializers import ProjectAttachmentSerializer
    from rest_framework import serializers as drf_serializers

    big_file = MagicMock()
    big_file.size = 21 * 1024 * 1024  # 21 MB
    big_file.content_type = 'application/pdf'

    serializer = ProjectAttachmentSerializer()
    with pytest.raises(drf_serializers.ValidationError):
        serializer.validate_file(big_file)


@pytest.mark.django_db
def test_file_attachment_rejects_disallowed_type():
    """ProjectAttachmentSerializer rejects executable content types."""
    from unittest.mock import MagicMock
    from projects.serializers import ProjectAttachmentSerializer
    from rest_framework import serializers as drf_serializers

    exe_file = MagicMock()
    exe_file.size = 1024
    exe_file.content_type = 'application/x-msdownload'

    serializer = ProjectAttachmentSerializer()
    with pytest.raises(drf_serializers.ValidationError):
        serializer.validate_file(exe_file)


@pytest.mark.django_db
def test_from_db_sets_pre_state_on_project():
    """Project.from_db() sets _pre_manager_id and _pre_status without extra query."""
    tenant = _tenant('proj-fromdb')
    admin = _user('admin@proj-fromdb.com')
    _member(admin, tenant, role='admin')
    project = _make_project(tenant, admin, status='active')

    fetched = Project.objects.get(pk=project.pk)
    assert fetched._pre_status == 'active'
    assert fetched._pre_manager_id == fetched.manager_id


@pytest.mark.django_db
def test_from_db_sets_pre_state_on_task():
    """ProjectTask.from_db() sets _pre_assigned_to_id and _pre_status."""
    tenant = _tenant('task-fromdb')
    admin = _user('admin@task-fromdb.com')
    assignee = _user('staff@task-fromdb.com')
    _member(admin, tenant, role='admin')
    _member(assignee, tenant, role='staff')
    project = _make_project(tenant, admin)
    task = _make_task(project, tenant, admin)
    task.assigned_to = assignee
    task.save(update_fields=['assigned_to'])

    fetched = ProjectTask.objects.get(pk=task.pk)
    assert fetched._pre_status == ProjectTask.STATUS_TODO
    assert fetched._pre_assigned_to_id == assignee.pk
