"""
roles/tests/test_roles.py
==========================
Unit and integration tests for the roles module.

Run inside Docker:
    docker exec nexus_bms-web-1 python -m pytest roles/tests/test_roles.py -v
"""

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from tenants.models import Tenant, Plan
from accounts.models import User, TenantMembership
from roles.models import Role


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _plan():
    return Plan.objects.get_or_create(
        slug='basic', defaults={'name': 'Basic', 'description': 'Test plan'},
    )[0]


def _tenant(slug, plan=None):
    from django.core.cache import cache
    from core.throttles import _sanitize_slug
    tenant = Tenant.objects.create(
        name=f'Tenant {slug}', slug=slug, plan=plan or _plan(), is_active=True,
    )
    # Flush Redis cache so the middleware fetches this fresh tenant on every request
    cache.delete(f'tenant_slug_{_sanitize_slug(slug)}')
    return tenant


def _user(email, username=None, password='Pass1234!'):
    return User.objects.create_user(
        username=username or email.replace('@', '_').replace('.', '_'),
        email=email,
        password=password,
    )


def _member(user, tenant, role='staff', custom_role=None):
    return TenantMembership.objects.create(
        user=user, tenant=tenant, role=role, custom_role=custom_role, is_active=True,
    )


def _token(user, tenant=None):
    from accounts.tokens import TenantRefreshToken
    refresh = TenantRefreshToken.for_user_and_tenant(user, tenant)
    return str(refresh.access_token), str(refresh)


def _authed_client(user, tenant):
    access, _ = _token(user, tenant)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')
    return client


# ─── List permission tests ────────────────────────────────────────────────────

@override_settings(ALLOWED_HOSTS=['*'], ROOT_DOMAIN='bms.local')
class RoleListPermissionTests(TestCase):

    def setUp(self):
        plan = _plan()
        self.tenant = _tenant('roles-list', plan)
        self.admin = _user('admin@roles-list.com')
        _member(self.admin, self.tenant, role='admin')
        self.manager = _user('manager@roles-list.com')
        _member(self.manager, self.tenant, role='manager')
        # Technician is already seeded by the tenant creation signal — no need to create it

    def test_admin_can_list_roles(self):
        client = _authed_client(self.admin, self.tenant)
        resp = client.get('/api/v1/roles/', HTTP_HOST='roles-list.bms.local')
        self.assertEqual(resp.status_code, 200)

    def test_manager_cannot_list_roles(self):
        client = _authed_client(self.manager, self.tenant)
        resp = client.get('/api/v1/roles/', HTTP_HOST='roles-list.bms.local')
        self.assertEqual(resp.status_code, 403)

    def test_unauthenticated_returns_401(self):
        client = APIClient()
        resp = client.get('/api/v1/roles/', HTTP_HOST='roles-list.bms.local')
        self.assertEqual(resp.status_code, 401)


# ─── IDOR tests ───────────────────────────────────────────────────────────────

@override_settings(ALLOWED_HOSTS=['*'], ROOT_DOMAIN='bms.local')
class RoleIDORTests(TestCase):

    def setUp(self):
        plan = _plan()
        self.tenant_a = _tenant('idor-roles-a', plan)
        self.tenant_b = _tenant('idor-roles-b', plan)
        self.admin = _user('admin@idor-roles-a.com')
        _member(self.admin, self.tenant_a, role='admin')
        self.role_b = Role.objects.create(
            tenant=self.tenant_b, name='Beta Only Role', permissions={},
        )

    def test_only_own_tenant_roles_in_list(self):
        client = _authed_client(self.admin, self.tenant_a)
        resp = client.get('/api/v1/roles/', HTTP_HOST='idor-roles-a.bms.local')
        self.assertEqual(resp.status_code, 200)
        roles_data = resp.data['data'] if isinstance(resp.data, dict) else resp.data
        names = [r['name'] for r in roles_data]
        self.assertNotIn('Beta Only Role', names)

    def test_cross_tenant_retrieve_returns_404(self):
        client = _authed_client(self.admin, self.tenant_a)
        resp = client.get(
            f'/api/v1/roles/{self.role_b.pk}/',
            HTTP_HOST='idor-roles-a.bms.local',
        )
        self.assertEqual(resp.status_code, 404)


# ─── Create tests ─────────────────────────────────────────────────────────────

@override_settings(ALLOWED_HOSTS=['*'], ROOT_DOMAIN='bms.local')
class RoleCreateTests(TestCase):

    def setUp(self):
        plan = _plan()
        self.tenant = _tenant('roles-create', plan)
        self.tenant_b = _tenant('roles-create-b', plan)
        self.admin = _user('admin@roles-create.com')
        _member(self.admin, self.tenant, role='admin')

    def test_tenant_injected_server_side(self):
        """POST /roles/ must assign request.tenant; body tenant value ignored."""
        client = _authed_client(self.admin, self.tenant)
        resp = client.post(
            '/api/v1/roles/',
            {'name': 'My New Role', 'permissions': {}, 'tenant': self.tenant_b.pk},
            format='json',
            HTTP_HOST='roles-create.bms.local',
        )
        self.assertEqual(resp.status_code, 201)
        role = Role.objects.get(pk=resp.data['id'])
        self.assertEqual(
            role.tenant_id, self.tenant.pk,
            f'Role assigned to {role.tenant_id} instead of {self.tenant.pk}',
        )


# ─── Update tests ─────────────────────────────────────────────────────────────

@override_settings(ALLOWED_HOSTS=['*'], ROOT_DOMAIN='bms.local')
class RoleUpdateTests(TestCase):

    def setUp(self):
        self.tenant = _tenant('roles-update')
        self.admin = _user('admin@roles-update.com')
        _member(self.admin, self.tenant, role='admin')
        self.custom_role, _ = Role.objects.get_or_create(
            tenant=self.tenant, name='Custom Field Role',
            defaults={'permissions': {'tickets.view': True, 'tickets.create': False}},
        )
        self.system_role = Role.objects.create(
            tenant=self.tenant, name='System Staff',
            permissions={}, is_system_role=True,
        )

    def test_update_custom_role_name_and_permissions(self):
        client = _authed_client(self.admin, self.tenant)
        resp = client.patch(
            f'/api/v1/roles/{self.custom_role.pk}/',
            {'name': 'Senior Field Role', 'permissions': {'tickets.view': True, 'tickets.create': True}},
            format='json', HTTP_HOST='roles-update.bms.local',
        )
        self.assertEqual(resp.status_code, 200)
        self.custom_role.refresh_from_db()
        self.assertEqual(self.custom_role.name, 'Senior Field Role')
        self.assertTrue(self.custom_role.permissions['tickets.create'])

    def test_update_system_role_permissions_allowed(self):
        client = _authed_client(self.admin, self.tenant)
        resp = client.patch(
            f'/api/v1/roles/{self.system_role.pk}/',
            {'permissions': {'reports.view': True}},
            format='json',
            HTTP_HOST='roles-update.bms.local',
        )
        self.assertEqual(resp.status_code, 200)
        self.system_role.refresh_from_db()
        self.assertTrue(self.system_role.permissions.get('reports.view'))


# ─── Delete tests ─────────────────────────────────────────────────────────────

@override_settings(ALLOWED_HOSTS=['*'], ROOT_DOMAIN='bms.local')
class RoleDeleteTests(TestCase):

    def setUp(self):
        self.tenant = _tenant('roles-delete')
        self.admin = _user('admin@roles-delete.com')
        _member(self.admin, self.tenant, role='admin')
        self.custom_role = Role.objects.create(
            tenant=self.tenant, name='Deletable Role', permissions={},
        )
        self.system_role = Role.objects.create(
            tenant=self.tenant, name='Protected System Role',
            permissions={}, is_system_role=True,
        )

    def test_delete_custom_role_succeeds(self):
        client = _authed_client(self.admin, self.tenant)
        resp = client.delete(
            f'/api/v1/roles/{self.custom_role.pk}/',
            HTTP_HOST='roles-delete.bms.local',
        )
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(Role.objects.filter(pk=self.custom_role.pk).exists())

    def test_delete_system_role_returns_400(self):
        client = _authed_client(self.admin, self.tenant)
        resp = client.delete(
            f'/api/v1/roles/{self.system_role.pk}/',
            HTTP_HOST='roles-delete.bms.local',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertTrue(Role.objects.filter(pk=self.system_role.pk).exists())


# ─── permission-map action tests ─────────────────────────────────────────────

@override_settings(ALLOWED_HOSTS=['*'], ROOT_DOMAIN='bms.local')
class PermissionMapTests(TestCase):

    def setUp(self):
        self.tenant = _tenant('perm-map')
        self.admin = _user('admin@perm-map.com')
        _member(self.admin, self.tenant, role='admin')

    def test_returns_expected_keys(self):
        from roles.permissions_map import PERMISSION_MAP
        client = _authed_client(self.admin, self.tenant)
        resp = client.get('/api/v1/roles/permission-map/', HTTP_HOST='perm-map.bms.local')
        self.assertEqual(resp.status_code, 200)
        returned_keys = set(resp.data.get('keys', {}).keys())
        expected_keys = set(PERMISSION_MAP.keys())
        self.assertTrue(
            expected_keys.issubset(returned_keys),
            f'Missing permission keys: {expected_keys - returned_keys}',
        )

    def test_consistent_with_permission_groups(self):
        from roles.permissions_map import PERMISSION_MAP, PERMISSION_GROUPS
        client = _authed_client(self.admin, self.tenant)
        resp = client.get('/api/v1/roles/permission-map/', HTTP_HOST='perm-map.bms.local')
        self.assertEqual(resp.status_code, 200)
        all_group_keys = set()
        for group in PERMISSION_GROUPS:
            for key in group.get('keys', []):
                all_group_keys.add(key)
        map_keys = set(PERMISSION_MAP.keys())
        unknown = all_group_keys - map_keys
        self.assertFalse(unknown, f'GROUPS keys missing from MAP: {unknown}')


# ─── seed-preloads action tests ───────────────────────────────────────────────

@override_settings(ALLOWED_HOSTS=['*'], ROOT_DOMAIN='bms.local')
class SeedPreloadsTests(TestCase):

    def setUp(self):
        self.tenant = _tenant('seed-suite')
        self.admin = _user('admin@seed-suite.com')
        _member(self.admin, self.tenant, role='admin')

    def test_creates_system_roles(self):
        client = _authed_client(self.admin, self.tenant)
        resp = client.post('/api/v1/roles/seed-preloads/', HTTP_HOST='seed-suite.bms.local')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(Role.objects.filter(tenant=self.tenant, is_system_role=True).exists())

    def test_idempotent(self):
        client = _authed_client(self.admin, self.tenant)
        client.post('/api/v1/roles/seed-preloads/', HTTP_HOST='seed-suite.bms.local')
        count_first = Role.objects.filter(tenant=self.tenant, is_system_role=True).count()

        client.post('/api/v1/roles/seed-preloads/', HTTP_HOST='seed-suite.bms.local')
        count_second = Role.objects.filter(tenant=self.tenant, is_system_role=True).count()

        self.assertEqual(count_first, count_second, 'seed-preloads is not idempotent.')


# ─── Custom role permission resolution tests ──────────────────────────────────

@override_settings(ALLOWED_HOSTS=['*'], ROOT_DOMAIN='bms.local')
class CustomRolePermissionTests(TestCase):

    def setUp(self):
        self.tenant = _tenant('custom-perms')
        self.admin = _user('admin@custom-perms.com')
        _member(self.admin, self.tenant, role='admin')

    def test_matching_permission_key_grants_access(self):
        """Custom role with can_list_staff=True must be allowed on the staff list endpoint."""
        user = _user('can-list@custom-perms.com')
        role = Role.objects.create(
            tenant=self.tenant, name='Limited Viewer',
            permissions={'staff.view': True},
        )
        _member(user, self.tenant, role='custom', custom_role=role)
        client = _authed_client(user, self.tenant)
        resp = client.get('/api/v1/staff/', HTTP_HOST='custom-perms.bms.local')
        self.assertEqual(resp.status_code, 200)

    def test_missing_permission_key_blocks_access(self):
        """Custom role without the required key must be blocked."""
        user = _user('no-perm@custom-perms.com')
        empty_role = Role.objects.create(
            tenant=self.tenant, name='Empty Role',
            permissions={'can_view_dashboard': True},
        )
        _member(user, self.tenant, role='custom', custom_role=empty_role)
        client = _authed_client(user, self.tenant)
        resp = client.get('/api/v1/staff/', HTTP_HOST='custom-perms.bms.local')
        self.assertEqual(resp.status_code, 403)


