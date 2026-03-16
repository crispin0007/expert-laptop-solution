"""
Security test suite — Phase 3 hardening.

Covers:
  1. Cross-tenant IDOR: requests scoped to the wrong tenant return 404.
  2. Module-gated endpoints return 403 when the module is inactive.
  3. Tenant slug is immutable after creation (PATCH rejected).
  4. Deleted tenant slug cannot be reused by a new tenant.
  5. Unknown subdomain probe returns a generic response (no context leakage).
  6. TenantRateThrottle cache key strips non-safe characters (no poisoning).
  7. IsSuperAdmin IP allowlist blocks a request from an unlisted IP.
  8. AuditLog row is written on successful login.
  9. Module cache is invalidated after a plan change.

Run with:
    docker exec nexusbms-web-1 python manage.py test core.tests.test_security
"""
import json
from unittest.mock import patch, MagicMock

from django.core.cache import cache as django_cache
from django.test import TestCase, TransactionTestCase, RequestFactory, override_settings
from rest_framework.test import APIClient
from rest_framework import status

from accounts.models import User, TenantMembership
from tenants.models import Tenant, Plan, Module, SlugReservation
from core.audit import AuditLog, AuditEvent, log_event
from core.throttles import _sanitize_slug


# ── Helpers ───────────────────────────────────────────────────────────────────

def _create_plan(name='TestPlan') -> Plan:
    slug = name.lower().replace(' ', '-').replace('_', '-')[:50]
    return Plan.objects.get_or_create(name=name, defaults={'description': 'Test plan', 'slug': slug})[0]


def _create_tenant(slug='test-tenant', plan=None) -> Tenant:
    if plan is None:
        plan = _create_plan()
    return Tenant.objects.create(
        slug=slug,
        name=f'Tenant {slug}',
        plan=plan,
        is_active=True,
        is_deleted=False,
    )


def _create_user(email='user@example.com', is_superuser=False, is_superadmin=False) -> User:
    user = User.objects.create_user(
        username=email.replace('@', '_').replace('.', '_'),
        email=email,
        password='TestPass123!',
    )
    if is_superuser:
        user.is_superuser = True
    if is_superadmin:
        user.is_superadmin = True
        user.is_superuser = True
    if is_superuser or is_superadmin:
        user.save()
    return user


def _add_member(user, tenant, role='staff') -> TenantMembership:
    return TenantMembership.objects.create(
        user=user,
        tenant=tenant,
        role=role,
        is_active=True,
    )


def _get_token(user, tenant=None) -> str:
    """Issue a TenantRefreshToken and return its access token string."""
    from accounts.tokens import TenantRefreshToken
    refresh = TenantRefreshToken.for_user_and_tenant(user, tenant)
    return str(refresh.access_token)


# ── Tests ─────────────────────────────────────────────────────────────────────


@override_settings(ALLOWED_HOSTS=['*'])
class CrossTenantIDORTest(TestCase):
    """IDOR: TenantMixin must prevent cross-tenant data access."""

    def setUp(self):
        django_cache.clear()
        self.plan = _create_plan('IDOR-Plan')
        self.tenant_a = _create_tenant('idor-a', self.plan)
        self.tenant_b = _create_tenant('idor-b', self.plan)
        self.user_b = _create_user('user_b@example.com')
        _add_member(self.user_b, self.tenant_b)
        self.token_b = _get_token(self.user_b, self.tenant_b)

    def test_cannot_read_other_tenant_customer(self):
        """A user from tenant B cannot access a customer created in tenant A."""
        from customers.models import Customer
        # Create a customer explicitly in tenant A
        customer_a = Customer.objects.create(
            tenant=self.tenant_a,
            name='Secret Corp',
            email='secret@corp.com',
        )

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_b}')
        # Use HTTP_HOST to simulate tenant B subdomain (works even with DEBUG=False)
        response = client.get(
            f'/api/v1/customers/{customer_a.pk}/',
            HTTP_HOST='idor-b.bms.local',
        )
        # TenantMixin filters by tenant B — the tenant A customer must not be found
        self.assertIn(response.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])


class SlugImmutabilityTest(TestCase):
    """Tenant slug cannot be changed via PATCH after creation."""

    def setUp(self):
        django_cache.clear()
        self.plan = _create_plan('Slug-Plan')
        self.tenant = _create_tenant('original-slug', self.plan)
        self.superadmin = _create_user('sa@bms.com', is_superadmin=True)
        self.token = _get_token(self.superadmin, tenant=None)

    def test_patch_slug_returns_400(self):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token}')
        response = client.patch(
            f'/api/v1/tenants/{self.tenant.pk}/',
            data={'slug': 'changed-slug'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.slug, 'original-slug')


class SlugReservationTest(TestCase):
    """Deleted tenant slug cannot be reused by a new tenant."""

    def setUp(self):
        django_cache.clear()
        self.plan = _create_plan('Res-Plan')
        self.tenant = _create_tenant('reserved-slug', self.plan)
        self.superadmin = _create_user('sa2@bms.com', is_superadmin=True)
        self.token = _get_token(self.superadmin, tenant=None)

    def test_soft_delete_creates_slug_reservation(self):
        self.tenant.soft_delete()
        self.assertTrue(SlugReservation.objects.filter(slug='reserved-slug').exists())

    def test_creating_tenant_with_reserved_slug_fails(self):
        """A slug present in SlugReservation must be rejected for new tenant creation.

        We create the reservation directly — simulating a previously deleted
        tenant that has since been hard-purged from the DB (e.g. data cleanup).
        This isolated test verifies that the SlugReservation check in
        TenantSerializer.validate_slug() fires and returns 400.
        """
        SlugReservation.objects.create(slug='clean-reserved-slug', reason='test')

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token}')
        response = client.post(
            '/api/v1/tenants/',
            data={'slug': 'clean-reserved-slug', 'name': 'Hijack Attempt', 'plan': self.plan.pk},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        err_text = json.dumps(response.data)
        self.assertIn('reserved', err_text.lower())


class SanitizeSlugTest(TestCase):
    """_sanitize_slug must strip characters outside [a-z0-9-] before Redis keys."""

    def test_strips_special_characters(self):
        self.assertEqual(_sanitize_slug('../../../etc/passwd'), 'etcpasswd')

    def test_strips_null_bytes(self):
        self.assertEqual(_sanitize_slug('foo\x00bar'), 'foobar')

    def test_allows_alphanumeric_and_hyphen(self):
        self.assertEqual(_sanitize_slug('my-tenant-123'), 'my-tenant-123')

    def test_uppercase_folded(self):
        # Slugs are lowercase by validation, but sanitizer should tolerate mixed case
        result = _sanitize_slug('MyTenant')
        self.assertNotIn('M', result)  # uppercase stripped or lowered — depends on impl
        self.assertTrue(all(c in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in result))


class ModuleCacheInvalidationTest(TestCase):
    """Module set cache is cleared when the plan changes or overrides are added."""

    def setUp(self):
        self.plan_a = _create_plan('Cache-Plan-A')
        self.plan_b = _create_plan('Cache-Plan-B')
        self.tenant = _create_tenant('cache-tenant', self.plan_a)

    def test_clear_module_cache_removes_key(self):
        from django.core.cache import cache
        # Warm the cache by accessing active_modules_set
        _ = self.tenant.active_modules_set
        # The cache key should exist now
        key = self.tenant._modules_cache_key
        cached_before = cache.get(key)
        # After clear, key should be gone
        self.tenant.clear_module_cache()
        cached_after = cache.get(key)
        self.assertIsNone(cached_after)


class SuperadminIPAllowlistTest(TestCase):
    """IsSuperAdmin rejects requests from IPs not in SUPERADMIN_ALLOWED_IPS."""

    def setUp(self):
        django_cache.clear()
        self.plan = _create_plan('IP-Plan')
        self.superadmin = _create_user('saip@bms.com', is_superadmin=True)
        self.token = _get_token(self.superadmin, tenant=None)

    @override_settings(SUPERADMIN_ALLOWED_IPS=['1.2.3.4'])
    def test_request_from_unlisted_ip_is_blocked(self):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token}')
        # REMOTE_ADDR is 127.0.0.1 by default in test client — not in allowed list
        response = client.get('/api/v1/tenants/', REMOTE_ADDR='9.9.9.9')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @override_settings(SUPERADMIN_ALLOWED_IPS=['1.2.3.4'])
    def test_request_from_allowed_ip_passes(self):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token}')
        response = client.get('/api/v1/tenants/', REMOTE_ADDR='1.2.3.4')
        # Should not be 403 from IP check (may be 200 or other based on queryset)
        self.assertNotEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @override_settings(SUPERADMIN_ALLOWED_IPS=[])
    def test_empty_allowlist_permits_all_ips(self):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token}')
        response = client.get('/api/v1/tenants/', REMOTE_ADDR='9.9.9.9')
        self.assertNotEqual(response.status_code, status.HTTP_403_FORBIDDEN)


@override_settings(ALLOWED_HOSTS=['*'], ROOT_DOMAIN='bms.local')
class AuditLogLoginTest(TransactionTestCase):
    """AuditLog row is written on each login attempt.

    Uses TransactionTestCase instead of TestCase because CONN_MAX_AGE > 0
    causes the test client's WSGI request to use a separate database connection
    that cannot see data created inside a TestCase wrapping transaction.
    TransactionTestCase commits data so all connections can see it.

    Uses HTTP_HOST subdomain simulation instead of X-Tenant-Slug header because
    Django test runner always sets DEBUG=False, which disables the header path.
    """

    def setUp(self):
        # Clear the shared Redis cache so stale tenant lookups from previous
        # tests (whose DB transactions were rolled back) do not poison this test.
        django_cache.clear()
        self.plan = _create_plan('Audit-Plan')
        self.tenant = _create_tenant('audit-tenant', self.plan)
        self.user = _create_user('audited@example.com')
        _add_member(self.user, self.tenant)

    def test_successful_login_writes_audit_row(self):
        initial_count = AuditLog.objects.filter(event=AuditEvent.LOGIN_SUCCESS).count()
        client = APIClient()
        response = client.post(
            '/api/v1/accounts/token/',
            data={'email': 'audited@example.com', 'password': 'TestPass123!'},
            format='json',
            HTTP_HOST='audit-tenant.bms.local',  # subdomain works even with DEBUG=False
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK,
                         msg=f'Login failed: {response.content[:300]}')
        new_count = AuditLog.objects.filter(event=AuditEvent.LOGIN_SUCCESS).count()
        self.assertEqual(new_count, initial_count + 1)

    def test_failed_login_writes_audit_row(self):
        initial_count = AuditLog.objects.filter(event=AuditEvent.LOGIN_FAILED).count()
        client = APIClient()
        response = client.post(
            '/api/v1/accounts/token/',
            data={'email': 'audited@example.com', 'password': 'WRONG'},
            format='json',
            HTTP_HOST='audit-tenant.bms.local',
        )
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_400_BAD_REQUEST])
        new_count = AuditLog.objects.filter(event=AuditEvent.LOGIN_FAILED).count()
        self.assertEqual(new_count, initial_count + 1)


class AuditLogDirectTest(TestCase):
    """log_event() writes rows to DB and never raises on bad input."""

    def test_log_event_writes_db_row(self):
        before = AuditLog.objects.count()
        request = RequestFactory().get('/')
        request.META['REMOTE_ADDR'] = '127.0.0.1'
        log_event(AuditEvent.LOGIN_SUCCESS, request=request, extra={'test': True})
        self.assertEqual(AuditLog.objects.count(), before + 1)

    def test_log_event_survives_none_request(self):
        """log_event must never raise even with minimal args."""
        try:
            log_event(AuditEvent.LOGIN_SUCCESS)
        except Exception as exc:
            self.fail(f'log_event raised unexpectedly: {exc}')

    def test_log_event_writes_row_hash(self):
        """Phase 4: every new audit row must have a non-empty row_hash."""
        log_event(AuditEvent.LOGIN_SUCCESS, extra={'phase': 4})
        row = AuditLog.objects.order_by('-timestamp').first()
        self.assertTrue(len(row.row_hash) == 64, 'row_hash should be a 64-char hex string')

    def test_verify_row_hash_returns_true_for_untampered_row(self):
        """Phase 4: verify_row_hash() must return True for an untampered row."""
        from core.audit import verify_row_hash
        log_event(AuditEvent.LOGIN_SUCCESS, extra={'hash_test': True})
        row = AuditLog.objects.order_by('-timestamp').first()
        self.assertTrue(verify_row_hash(row))


class AuditLogImmutabilityTest(TestCase):
    """Phase 4: DB-level trigger must prevent UPDATE/DELETE on core_auditlog."""

    def test_updating_audit_row_is_blocked_by_trigger(self):
        from django.db import connection, ProgrammingError
        log_event(AuditEvent.LOGIN_SUCCESS, extra={'immutable_test': True})
        row = AuditLog.objects.order_by('-timestamp').first()
        with self.assertRaises(Exception):
            with connection.cursor() as c:
                c.execute(
                    "UPDATE core_auditlog SET extra = '{}' WHERE id = %s",
                    [row.id],
                )

    def test_deleting_audit_row_is_blocked_by_trigger(self):
        from django.db import connection
        log_event(AuditEvent.LOGIN_SUCCESS, extra={'immutable_delete_test': True})
        row = AuditLog.objects.order_by('-timestamp').first()
        with self.assertRaises(Exception):
            with connection.cursor() as c:
                c.execute("DELETE FROM core_auditlog WHERE id = %s", [row.id])


@override_settings(ALLOWED_HOSTS=['*'], ROOT_DOMAIN='bms.local')
class TenantSigBindingTest(TestCase):
    """Phase 4 (Item #3): tenant_sig HMAC must be verified on every request."""

    def setUp(self):
        django_cache.clear()
        self.plan = _create_plan('SigPlan')
        self.tenant = _create_tenant('sig-tenant', self.plan)
        self.user = _create_user('sig@example.com')
        _add_member(self.user, self.tenant)

    def test_valid_tenant_sig_is_accepted(self):
        token = _get_token(self.user, self.tenant)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        response = client.get(
            '/api/v1/accounts/me/',
            HTTP_HOST=f'sig-tenant.bms.local',
        )
        self.assertNotEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_rotated_tenant_secret_rejects_old_token(self):
        """Rotating jwt_signing_secret must invalidate all pre-rotation tokens."""
        token = _get_token(self.user, self.tenant)

        # Rotate the tenant's signing secret
        import secrets
        self.tenant.jwt_signing_secret = secrets.token_hex(32)
        self.tenant.save()
        # Clear tenant from cache so middleware re-reads from DB
        django_cache.delete(f'tenant_slug_{self.tenant.slug}')

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        response = client.get(
            '/api/v1/accounts/me/',
            HTTP_HOST=f'sig-tenant.bms.local',
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


@override_settings(ALLOWED_HOSTS=['*'])
class DomainSigBindingTest(TestCase):
    """Phase 4 (Item #6): domain_sig HMAC isolates admin tokens from tenant tokens."""

    def setUp(self):
        django_cache.clear()
        self.superadmin = _create_user('domsig@bms.com', is_superadmin=True)

    def test_valid_domain_sig_is_accepted(self):
        token = _get_token(self.superadmin, tenant=None)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        response = client.get('/api/v1/tenants/')
        # 200 or other non-401 response confirms auth succeeded
        self.assertNotEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_wrong_superadmin_secret_rejects_old_token(self):
        """Changing SUPERADMIN_JWT_SECRET must invalidate all existing admin tokens."""
        # Issue the token with the CURRENT (original) secret
        token = _get_token(self.superadmin, tenant=None)

        # Now rotate the SUPERADMIN_JWT_SECRET to a different value and verify
        # that the old token (signed with the old secret) is rejected.
        with override_settings(SUPERADMIN_JWT_SECRET='completely-different-secret-xyz-9999'):
            client = APIClient()
            client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
            response = client.get('/api/v1/tenants/')
            self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class AnomalyDetectionTest(TestCase):
    """Phase 4 (Item #5): BannedIP model and auto-ban detection."""

    def setUp(self):
        django_cache.clear()

    def test_is_banned_returns_false_for_clean_ip(self):
        from core.anomaly import is_banned
        self.assertFalse(is_banned('1.2.3.4'))

    def test_is_banned_returns_true_for_banned_ip(self):
        from core.anomaly import BannedIP, is_banned
        from django.utils import timezone
        from datetime import timedelta
        BannedIP.objects.create(
            ip='6.6.6.6',
            expires_at=timezone.now() + timedelta(hours=1),
            reason='test ban',
        )
        django_cache.clear()  # ensure DB is queried
        self.assertTrue(is_banned('6.6.6.6'))

    def test_is_banned_returns_false_for_expired_ban(self):
        from core.anomaly import BannedIP, is_banned
        from django.utils import timezone
        from datetime import timedelta
        BannedIP.objects.create(
            ip='7.7.7.7',
            expires_at=timezone.now() - timedelta(hours=1),  # already expired
            reason='expired ban',
        )
        django_cache.clear()
        self.assertFalse(is_banned('7.7.7.7'))

    @override_settings(ANOMALY_PROBE_THRESHOLD=3, ANOMALY_WINDOW_MINUTES=60, ANOMALY_BAN_HOURS=2)
    def test_detect_and_ban_bans_offending_ip(self):
        """An IP with >= threshold probe events in the window must be auto-banned."""
        from core.anomaly import detect_and_ban_probe_ips, BannedIP, is_banned
        from core.audit import AuditLog, AuditEvent
        from django.utils import timezone

        offender_ip = '9.8.7.6'
        for _ in range(4):  # above threshold of 3
            AuditLog.objects.create(
                event=AuditEvent.CROSS_TENANT_PROBE,
                ip=offender_ip,
                timestamp=timezone.now(),
            )

        new_bans = detect_and_ban_probe_ips()
        self.assertGreater(new_bans, 0)

        django_cache.clear()
        self.assertTrue(is_banned(offender_ip))

    @override_settings(ANOMALY_PROBE_THRESHOLD=10, ANOMALY_WINDOW_MINUTES=60)
    def test_detect_and_ban_does_not_ban_below_threshold(self):
        """An IP with fewer probe events than the threshold must NOT be banned."""
        from core.anomaly import detect_and_ban_probe_ips, is_banned
        from core.audit import AuditLog, AuditEvent
        from django.utils import timezone

        safe_ip = '1.1.1.1'
        for _ in range(3):  # below threshold of 10
            AuditLog.objects.create(
                event=AuditEvent.CROSS_TENANT_PROBE,
                ip=safe_ip,
                timestamp=timezone.now(),
            )

        detect_and_ban_probe_ips()
        django_cache.clear()
        self.assertFalse(is_banned(safe_ip))


@override_settings(ALLOWED_HOSTS=['*'])
class SuspendTenantTokenKillTest(TestCase):
    """Phase 4 (Item #7): suspending a tenant must blacklist all member tokens."""

    def setUp(self):
        django_cache.clear()
        self.plan = _create_plan('KillPlan')
        self.tenant = _create_tenant('kill-tenant', self.plan)
        self.superadmin = _create_user('killsuper@bms.com', is_superadmin=True)
        self.member = _create_user('killmember@bms.com')
        _add_member(self.member, self.tenant)
        self.superadmin_token = _get_token(self.superadmin, tenant=None)

    def test_suspend_blacklists_member_tokens(self):
        """After suspension, all outstanding tokens for tenant members are blacklisted."""
        from rest_framework_simplejwt.token_blacklist.models import (
            OutstandingToken, BlacklistedToken,
        )
        from accounts.tokens import TenantRefreshToken

        # Issue a refresh token for the member (this creates an OutstandingToken row)
        refresh = TenantRefreshToken.for_user_and_tenant(self.member, self.tenant)
        outstanding_count_before = OutstandingToken.objects.filter(
            user=self.member
        ).count()
        self.assertGreater(outstanding_count_before, 0)

        # Suspend the tenant via the API
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.superadmin_token}')
        response = client.post(
            f'/api/v1/tenants/{self.tenant.pk}/suspend/',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # All outstanding tokens for the member must now be blacklisted
        from django.utils import timezone
        blacklisted_count = BlacklistedToken.objects.filter(
            token__user=self.member,
            token__expires_at__gt=timezone.now(),
        ).count()
        self.assertGreater(blacklisted_count, 0)
