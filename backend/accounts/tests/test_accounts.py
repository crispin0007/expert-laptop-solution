"""
accounts/tests/test_accounts.py
================================
Unit and integration tests for the accounts module.

Run inside Docker:
    docker exec nexus_bms-web-1 python -m pytest accounts/tests/test_accounts.py -v
"""

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from tenants.models import Tenant, Plan
from accounts.models import User, TenantMembership


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


def _user(email, password='Pass1234!', is_superadmin=False):
    user = User.objects.create_user(
        username=email.replace('@', '_').replace('.', '_'),
        email=email,
        password=password,
    )
    if is_superadmin:
        user.is_superadmin = True
        user.is_superuser = True
        user.save()
    return user


def _member(user, tenant, role='staff'):
    return TenantMembership.objects.create(
        user=user, tenant=tenant, role=role, is_active=True,
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


# ─── Login tests ─────────────────────────────────────────────────────────────

@override_settings(ALLOWED_HOSTS=['*'], ROOT_DOMAIN='bms.local')
class LoginSecurityTests(TestCase):
    """TenantTokenObtainPairView login gating."""

    def setUp(self):
        self.plan = _plan()
        self.tenant = _tenant('logintest', self.plan)
        self.admin = _user('admin@logintest.com')
        _member(self.admin, self.tenant, role='admin')

    def test_valid_credentials_returns_tokens(self):
        client = APIClient()
        resp = client.post(
            '/api/v1/accounts/token/',
            {'email': 'admin@logintest.com', 'password': 'Pass1234!'},
            format='json',
            HTTP_HOST='logintest.bms.local',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIn('access', resp.data)
        self.assertIn('refresh', resp.data)

    def test_wrong_password_returns_401(self):
        client = APIClient()
        resp = client.post(
            '/api/v1/accounts/token/',
            {'email': 'admin@logintest.com', 'password': 'wrongpassword'},
            format='json',
            HTTP_HOST='logintest.bms.local',
        )
        self.assertEqual(resp.status_code, 401)

    def test_staff_on_root_domain_rejected(self):
        """Non-superadmin user must not log in on the root domain."""
        client = APIClient()
        resp = client.post(
            '/api/v1/accounts/token/',
            {'email': 'admin@logintest.com', 'password': 'Pass1234!'},
            format='json',
            HTTP_HOST='bms.local',
        )
        self.assertEqual(resp.status_code, 401)

    def test_superuser_on_tenant_subdomain_rejected(self):
        superuser = _user('super@nexus.com', is_superadmin=True)
        client = APIClient()
        resp = client.post(
            '/api/v1/accounts/token/',
            {'email': 'super@nexus.com', 'password': 'Pass1234!'},
            format='json',
            HTTP_HOST='logintest.bms.local',
        )
        self.assertEqual(resp.status_code, 401)

    def test_user_with_no_membership_rejected(self):
        outsider = _user('outsider@nowhere.com')
        client = APIClient()
        resp = client.post(
            '/api/v1/accounts/token/',
            {'email': 'outsider@nowhere.com', 'password': 'Pass1234!'},
            format='json',
            HTTP_HOST='logintest.bms.local',
        )
        self.assertEqual(resp.status_code, 401)

    def test_inactive_membership_rejected(self):
        inactive_user = _user('inactive@logintest.com')
        TenantMembership.objects.create(
            user=inactive_user, tenant=self.tenant, role='staff', is_active=False,
        )
        client = APIClient()
        resp = client.post(
            '/api/v1/accounts/token/',
            {'email': 'inactive@logintest.com', 'password': 'Pass1234!'},
            format='json',
            HTTP_HOST='logintest.bms.local',
        )
        self.assertEqual(resp.status_code, 401)

    def test_enabled_2fa_returns_partial_response(self):
        """Login with 2FA enabled must return requires_2fa flag, no full access token."""
        self.admin.is_2fa_enabled = True
        self.admin.save(update_fields=['is_2fa_enabled'])
        client = APIClient()
        resp = client.post(
            '/api/v1/accounts/token/',
            {'email': 'admin@logintest.com', 'password': 'Pass1234!'},
            format='json',
            HTTP_HOST='logintest.bms.local',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data.get('requires_2fa'))
        self.assertIn('two_factor_token', resp.data)
        self.assertNotIn('access', resp.data)


# ─── Token refresh tests ──────────────────────────────────────────────────────

@override_settings(ALLOWED_HOSTS=['*'], ROOT_DOMAIN='bms.local')
class TokenRefreshTests(TestCase):
    """TenantTokenRefreshView cross-tenant validation."""

    def setUp(self):
        plan = _plan()
        self.tenant_a = _tenant('refresher-a', plan)
        self.tenant_b = _tenant('refresher-b', plan)
        self.user = _user('refresh@a.com')
        _member(self.user, self.tenant_a)
        _member(self.user, self.tenant_b)

    def test_valid_refresh_returns_new_access(self):
        _, refresh = _token(self.user, self.tenant_a)
        client = APIClient()
        resp = client.post(
            '/api/v1/accounts/token/refresh/',
            {'refresh': refresh},
            format='json',
            HTTP_HOST='refresher-a.bms.local',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIn('access', resp.data)

    def test_cross_tenant_token_rejected(self):
        """Token issued for tenant A must be rejected on tenant B's endpoint."""
        _, refresh_a = _token(self.user, self.tenant_a)
        client = APIClient()
        resp = client.post(
            '/api/v1/accounts/token/refresh/',
            {'refresh': refresh_a},
            format='json',
            HTTP_HOST='refresher-b.bms.local',
        )
        self.assertIn(resp.status_code, [400, 401])


# ─── Logout tests ─────────────────────────────────────────────────────────────

@override_settings(ALLOWED_HOSTS=['*'], ROOT_DOMAIN='bms.local')
class LogoutTests(TestCase):

    def setUp(self):
        self.tenant = _tenant('logoutsuite')
        self.user = _user('logout@suite.com')
        _member(self.user, self.tenant)

    def test_logout_blacklists_token(self):
        client = _authed_client(self.user, self.tenant)
        _, refresh = _token(self.user, self.tenant)
        resp = client.post(
            '/api/v1/accounts/logout/',
            {'refresh': refresh},
            format='json',
            HTTP_HOST='logoutsuite.bms.local',
        )
        self.assertEqual(resp.status_code, 204)
        # Refreshing must fail after logout
        client2 = APIClient()
        resp2 = client2.post(
            '/api/v1/accounts/token/refresh/',
            {'refresh': refresh},
            format='json',
            HTTP_HOST='logoutsuite.bms.local',
        )
        self.assertIn(resp2.status_code, [400, 401])


# ─── Me endpoint tests ────────────────────────────────────────────────────────

@override_settings(ALLOWED_HOSTS=['*'], ROOT_DOMAIN='bms.local')
class MeViewTests(TestCase):
    """MeView returns correct membership and permissions."""

    def setUp(self):
        self.tenant = _tenant('mesuite')
        self.staff_user = _user('staff@mesuite.com')
        _member(self.staff_user, self.tenant, role='staff')
        self.admin_user = _user('admin@mesuite.com')
        _member(self.admin_user, self.tenant, role='admin')

    def test_me_returns_staff_membership(self):
        client = _authed_client(self.staff_user, self.tenant)
        resp = client.get('/api/v1/accounts/me/', HTTP_HOST='mesuite.bms.local')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['membership']['role'], 'staff')

    def test_me_staff_cannot_manage_settings(self):
        client = _authed_client(self.staff_user, self.tenant)
        resp = client.get('/api/v1/accounts/me/', HTTP_HOST='mesuite.bms.local')
        self.assertEqual(resp.status_code, 200)
        perms = resp.data['membership']['permissions']
        self.assertFalse(perms.get('can_manage_settings', True))

    def test_me_admin_has_management_permissions(self):
        client = _authed_client(self.admin_user, self.tenant)
        resp = client.get('/api/v1/accounts/me/', HTTP_HOST='mesuite.bms.local')
        self.assertEqual(resp.status_code, 200)
        perms = resp.data['membership']['permissions']
        self.assertTrue(perms.get('can_manage_settings'))
        self.assertTrue(perms.get('can_manage_staff'))

    def test_me_requires_authentication(self):
        client = APIClient()
        resp = client.get('/api/v1/accounts/me/', HTTP_HOST='mesuite.bms.local')
        self.assertEqual(resp.status_code, 401)


# ─── Staff list permission gate tests ────────────────────────────────────────

@override_settings(ALLOWED_HOSTS=['*'], ROOT_DOMAIN='bms.local')
class StaffListPermissionTests(TestCase):

    def setUp(self):
        self.tenant = _tenant('stafflist')
        self.manager = _user('manager@stafflist.com')
        _member(self.manager, self.tenant, role='manager')
        self.viewer = _user('viewer@stafflist.com')
        _member(self.viewer, self.tenant, role='viewer')

    def test_manager_can_list_staff(self):
        client = _authed_client(self.manager, self.tenant)
        resp = client.get('/api/v1/staff/', HTTP_HOST='stafflist.bms.local')
        self.assertEqual(resp.status_code, 200)

    def test_viewer_blocked_from_staff_list(self):
        client = _authed_client(self.viewer, self.tenant)
        resp = client.get('/api/v1/staff/', HTTP_HOST='stafflist.bms.local')
        self.assertEqual(resp.status_code, 403)

    def test_unauthenticated_returns_401(self):
        client = APIClient()
        resp = client.get('/api/v1/staff/', HTTP_HOST='stafflist.bms.local')
        self.assertEqual(resp.status_code, 401)


# ─── Staff invite tests ───────────────────────────────────────────────────────

@override_settings(ALLOWED_HOSTS=['*'], ROOT_DOMAIN='bms.local')
class StaffInviteTests(TestCase):

    def setUp(self):
        self.tenant = _tenant('staffinvite')
        self.admin = _user('admin@staffinvite.com')
        _member(self.admin, self.tenant, role='admin')
        self.manager = _user('manager@staffinvite.com')
        _member(self.manager, self.tenant, role='manager')
        self.existing_staff = _user('existing@staffinvite.com')
        _member(self.existing_staff, self.tenant, role='staff')

    def test_admin_can_invite_staff(self):
        client = _authed_client(self.admin, self.tenant)
        resp = client.post(
            '/api/v1/staff/',
            {'email': 'newbie@staffinvite.com', 'full_name': 'New Staff', 'role': 'staff'},
            format='json',
            HTTP_HOST='staffinvite.bms.local',
        )
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(User.objects.filter(email='newbie@staffinvite.com').exists())

    def test_manager_cannot_invite_staff(self):
        client = _authed_client(self.manager, self.tenant)
        resp = client.post(
            '/api/v1/staff/',
            {'email': 'blocked@staffinvite.com', 'full_name': 'Blocked', 'role': 'staff'},
            format='json',
            HTTP_HOST='staffinvite.bms.local',
        )
        self.assertEqual(resp.status_code, 403)

    def test_duplicate_email_rejected(self):
        client = _authed_client(self.admin, self.tenant)
        resp = client.post(
            '/api/v1/staff/',
            {'email': 'existing@staffinvite.com', 'full_name': 'Dupe', 'role': 'staff'},
            format='json',
            HTTP_HOST='staffinvite.bms.local',
        )
        self.assertEqual(resp.status_code, 400)


# ─── Staff deactivate / reactivate tests ──────────────────────────────────────

@override_settings(ALLOWED_HOSTS=['*'], ROOT_DOMAIN='bms.local')
class StaffActivationTests(TestCase):

    def setUp(self):
        self.tenant = _tenant('staffactive')
        self.admin = _user('admin@staffactive.com')
        _member(self.admin, self.tenant, role='admin')
        self.staff = _user('staff@staffactive.com')
        _member(self.staff, self.tenant, role='staff')

    def test_admin_can_deactivate_staff(self):
        client = _authed_client(self.admin, self.tenant)
        resp = client.post(
            f'/api/v1/staff/{self.staff.pk}/deactivate/',
            HTTP_HOST='staffactive.bms.local',
        )
        self.assertEqual(resp.status_code, 200)
        membership = TenantMembership.objects.get(user=self.staff, tenant=self.tenant)
        self.assertFalse(membership.is_active)

    def test_admin_can_reactivate_staff(self):
        membership = TenantMembership.objects.get(user=self.staff, tenant=self.tenant)
        membership.is_active = False
        membership.save()

        client = _authed_client(self.admin, self.tenant)
        resp = client.post(
            f'/api/v1/staff/{self.staff.pk}/reactivate/',
            HTTP_HOST='staffactive.bms.local',
        )
        self.assertEqual(resp.status_code, 200)
        membership.refresh_from_db()
        self.assertTrue(membership.is_active)


# ─── Staff IDOR tests ─────────────────────────────────────────────────────────

@override_settings(ALLOWED_HOSTS=['*'], ROOT_DOMAIN='bms.local')
class StaffIDORTests(TestCase):

    def setUp(self):
        plan = _plan()
        self.tenant_a = _tenant('idor-staff-a', plan)
        self.tenant_b = _tenant('idor-staff-b', plan)
        self.admin_a = _user('admin@idor-staff-a.com')
        _member(self.admin_a, self.tenant_a, role='admin')
        self.user_b = _user('staff@idor-staff-b.com')
        _member(self.user_b, self.tenant_b, role='staff')

    def test_staff_from_other_tenant_not_in_list(self):
        client = _authed_client(self.admin_a, self.tenant_a)
        resp = client.get('/api/v1/staff/', HTTP_HOST='idor-staff-a.bms.local')
        self.assertEqual(resp.status_code, 200)
        staff_list = resp.data if isinstance(resp.data, list) else resp.data.get('results', resp.data)
        emails = [s['email'] if isinstance(s, dict) else s for s in staff_list]
        self.assertNotIn('staff@idor-staff-b.com', emails)

    def test_retrieve_other_tenant_staff_returns_404(self):
        client = _authed_client(self.admin_a, self.tenant_a)
        resp = client.get(
            f'/api/v1/staff/{self.user_b.pk}/',
            HTTP_HOST='idor-staff-a.bms.local',
        )
        self.assertEqual(resp.status_code, 404)

    def test_deactivate_other_tenant_staff_returns_404(self):
        client = _authed_client(self.admin_a, self.tenant_a)
        resp = client.post(
            f'/api/v1/staff/{self.user_b.pk}/deactivate/',
            HTTP_HOST='idor-staff-a.bms.local',
        )
        self.assertEqual(resp.status_code, 404)


# ─── assign-role tests ────────────────────────────────────────────────────────

@override_settings(ALLOWED_HOSTS=['*'], ROOT_DOMAIN='bms.local')
class AssignRoleTests(TestCase):

    def setUp(self):
        plan = _plan()
        self.tenant = _tenant('assignrole', plan)
        self.tenant_b = _tenant('assignrole-b', plan)
        self.admin = _user('admin@assignrole.com')
        _member(self.admin, self.tenant, role='admin')
        self.staff = _user('staff@assignrole.com')
        _member(self.staff, self.tenant, role='staff')

    def test_assign_system_role(self):
        client = _authed_client(self.admin, self.tenant)
        resp = client.post(
            f'/api/v1/staff/{self.staff.pk}/assign-role/',
            {'role': 'manager'},
            format='json',
            HTTP_HOST='assignrole.bms.local',
        )
        self.assertEqual(resp.status_code, 200)
        membership = TenantMembership.objects.get(user=self.staff, tenant=self.tenant)
        self.assertEqual(membership.role, 'manager')

    def test_assign_custom_role(self):
        from roles.models import Role
        custom_role, _ = Role.objects.get_or_create(
            tenant=self.tenant, name='Technician', defaults={'permissions': {}},
        )
        client = _authed_client(self.admin, self.tenant)
        resp = client.post(
            f'/api/v1/staff/{self.staff.pk}/assign-role/',
            {'role': 'custom', 'custom_role_id': custom_role.pk},
            format='json',
            HTTP_HOST='assignrole.bms.local',
        )
        self.assertEqual(resp.status_code, 200)
        membership = TenantMembership.objects.get(user=self.staff, tenant=self.tenant)
        self.assertEqual(membership.role, 'custom')
        self.assertEqual(membership.custom_role_id, custom_role.pk)

    def test_cross_tenant_custom_role_rejected(self):
        from roles.models import Role
        role_b = Role.objects.create(tenant=self.tenant_b, name='Beta Role', permissions={})
        client = _authed_client(self.admin, self.tenant)
        resp = client.post(
            f'/api/v1/staff/{self.staff.pk}/assign-role/',
            {'role': 'custom', 'custom_role_id': role_b.pk},
            format='json',
            HTTP_HOST='assignrole.bms.local',
        )
        self.assertIn(resp.status_code, [400, 404])


# ─── TenantMembership ViewSet tests ──────────────────────────────────────────

@override_settings(ALLOWED_HOSTS=['*'], ROOT_DOMAIN='bms.local')
class MembershipViewSetTests(TestCase):

    def setUp(self):
        plan = _plan()
        self.tenant = _tenant('memberships', plan)
        self.tenant_b = _tenant('memberships-b', plan)
        self.admin = _user('admin@memberships.com')
        _member(self.admin, self.tenant, role='admin')
        self.user_b = _user('user@memberships-b.com')
        _member(self.user_b, self.tenant_b, role='staff')

    def test_tenant_injected_server_side_on_create(self):
        """POST body tenant value must be ignored; request.tenant is used instead."""
        new_user = _user('new@memberships.com')
        client = _authed_client(self.admin, self.tenant)
        resp = client.post(
            '/api/v1/accounts/memberships/',
            {'tenant': self.tenant_b.pk, 'role': 'staff', 'user': new_user.pk},
            format='json',
            HTTP_HOST='memberships.bms.local',
        )
        if resp.status_code in (200, 201):
            self.assertFalse(
                TenantMembership.objects.filter(user=new_user, tenant=self.tenant_b).exists(),
                'Membership was created in wrong tenant — body tenant was not ignored.',
            )

    def test_list_scoped_to_tenant(self):
        client = _authed_client(self.admin, self.tenant)
        resp = client.get('/api/v1/accounts/memberships/', HTTP_HOST='memberships.bms.local')
        self.assertEqual(resp.status_code, 200)
        # Paginated response wraps items in resp.data['data']; fallback to plain list
        raw = resp.data
        if isinstance(raw, dict):
            rows = raw.get('data', raw.get('results', []))
        else:
            rows = raw
        tenant_ids = set()
        for row in rows:
            t = row.get('tenant') if isinstance(row, dict) else None
            if isinstance(t, dict):
                tenant_ids.add(t['id'])
            elif t is not None:
                tenant_ids.add(t)
        self.assertNotIn(self.tenant_b.pk, tenant_ids)


# ─── reset_password tests ─────────────────────────────────────────────────────

@override_settings(ALLOWED_HOSTS=['*'], ROOT_DOMAIN='bms.local')
class ResetPasswordTests(TestCase):

    def setUp(self):
        self.tenant = _tenant('resetpwd')
        self.admin = _user('admin@resetpwd.com')
        _member(self.admin, self.tenant, role='admin')
        self.staff = _user('staff@resetpwd.com')
        _member(self.staff, self.tenant, role='staff')

    def test_admin_can_reset_password(self):
        client = _authed_client(self.admin, self.tenant)
        resp = client.post(
            f'/api/v1/staff/{self.staff.pk}/reset_password/',
            {'password': 'NewPass999!'},
            format='json',
            HTTP_HOST='resetpwd.bms.local',
        )
        self.assertEqual(resp.status_code, 200)
        self.staff.refresh_from_db()
        self.assertTrue(self.staff.check_password('NewPass999!'))

    def test_short_password_rejected(self):
        client = _authed_client(self.admin, self.tenant)
        resp = client.post(
            f'/api/v1/staff/{self.staff.pk}/reset_password/',
            {'password': 'abc'},
            format='json',
            HTTP_HOST='resetpwd.bms.local',
        )
        self.assertEqual(resp.status_code, 400)


# ─── Service layer unit tests ─────────────────────────────────────────────────

class ServiceLayerTests(TestCase):
    """Directly test accounts.services for correct ValueError/LookupError raises."""

    def setUp(self):
        plan = _plan()
        self.tenant = _tenant('services-suite', plan)
        self.tenant_b = _tenant('services-suite-b', plan)
        self.staff_user = _user('staff@services.com')
        self.membership = _member(self.staff_user, self.tenant, role='staff')

    def test_deactivate_already_inactive_raises(self):
        from accounts import services
        self.membership.is_active = False
        self.membership.save()
        with self.assertRaisesRegex(ValueError, 'already inactive'):
            services.deactivate_staff(tenant=self.tenant, membership=self.membership)

    def test_reactivate_already_active_raises(self):
        from accounts import services
        with self.assertRaisesRegex(ValueError, 'already active'):
            services.reactivate_staff(tenant=self.tenant, membership=self.membership)

    def test_assign_role_invalid_string_raises(self):
        from accounts import services
        with self.assertRaisesRegex(ValueError, 'Invalid role'):
            services.assign_role(
                tenant=self.tenant, membership=self.membership, role='superhero',
            )

    def test_assign_custom_role_without_id_raises(self):
        from accounts import services
        with self.assertRaisesRegex(ValueError, 'custom_role_id is required'):
            services.assign_role(
                tenant=self.tenant, membership=self.membership, role='custom',
            )

    def test_assign_cross_tenant_custom_role_raises(self):
        from accounts import services
        from roles.models import Role
        role_b = Role.objects.create(tenant=self.tenant_b, name='Foreign', permissions={})
        with self.assertRaisesRegex(LookupError, 'not found in this workspace'):
            services.assign_role(
                tenant=self.tenant, membership=self.membership,
                role='custom', custom_role_id=role_b.pk,
            )

    def test_last_owner_demotion_raises(self):
        """assign_role must prevent demoting the last/sole owner."""
        from accounts import services
        owner = _user('owner@services.com')
        membership = TenantMembership.objects.create(
            user=owner, tenant=self.tenant, role='owner', is_active=True,
        )
        with self.assertRaisesRegex(ValueError, 'last owner'):
            services.assign_role(
                tenant=self.tenant, membership=membership, role='admin',
            )


# ─── Backup code tests ────────────────────────────────────────────────────────

class BackupCodeTests(TestCase):
    """User.verify_backup_code ensures single-use."""

    def setUp(self):
        self.user = _user('backup@codes.com')

    def test_valid_code_accepted_once(self):
        codes = self.user.generate_backup_codes(count=3)
        self.user.save()
        first = codes[0]
        self.assertTrue(self.user.verify_backup_code(first))
        self.assertFalse(self.user.verify_backup_code(first))

    def test_invalid_code_rejected(self):
        self.user.generate_backup_codes(count=4)
        self.user.save()
        self.assertFalse(self.user.verify_backup_code('DEADBEEF'))


# ─── InviteStaffSerializer tests ─────────────────────────────────────────────

class InviteStaffSerializerTests(TestCase):

    def setUp(self):
        plan = _plan()
        self.tenant = _tenant('invite-ser', plan)
        self.tenant_b = _tenant('invite-ser-b', plan)

    def test_cross_tenant_department_rejected(self):
        from accounts.serializers import InviteStaffSerializer
        from departments.models import Department
        dept_b = Department.objects.create(tenant=self.tenant_b, name='Beta Dept')
        serializer = InviteStaffSerializer(
            data={'email': 'x@alpha.com', 'department': dept_b.pk},
            context={'tenant': self.tenant},
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn('department', serializer.errors)

    def test_missing_email_rejected(self):
        from accounts.serializers import InviteStaffSerializer
        serializer = InviteStaffSerializer(
            data={'full_name': 'No Email'},
            context={'tenant': self.tenant},
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn('email', serializer.errors)
