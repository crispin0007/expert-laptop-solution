"""
Tenant-aware JWT authentication backend.

Replaces rest_framework_simplejwt.authentication.JWTAuthentication.

Every incoming request is validated in two steps:
  1. Standard SimpleJWT validation — signature, expiry, blacklist.
  2. Tenant claim check — token's tenant_id MUST match request.tenant.

This runs at the Django authentication layer, before any view or permission
class executes. No frontend, no header, no proxy trick can bypass it.

Claim rules
-----------
  token tenant_id   │  request.tenant   │  Result
  ──────────────────┼───────────────────┼────────────────────────────────
  None              │  None             │  ✅ Main-domain access allowed
  None              │  <Tenant>         │  ❌ 401 — main-domain token on tenant
  <id>              │  None             │  ❌ 401 — tenant token on main domain
  <id>  == tenant   │  <same Tenant>    │  ✅ Correct tenant
  <id>  != tenant   │  <other Tenant>   │  ❌ 401 — wrong tenant (cross-tenant attack)
"""
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, AuthenticationFailed


def _log_auth_event(event, request, extra=None):
    """Best-effort audit log call — never allows exceptions to surface."""
    try:
        from core.audit import log_event
        log_event(event, request=request, extra=extra or {})
    except Exception:
        pass


class TenantJWTAuthentication(JWTAuthentication):
    """
    Drop-in replacement for JWTAuthentication that enforces tenant_id,
    tenant_sig (per-tenant key binding), and domain_sig (admin isolation).

    Registered in settings.REST_FRAMEWORK['DEFAULT_AUTHENTICATION_CLASSES'].
    """

    def authenticate(self, request):
        # Step 1: run standard SimpleJWT auth (validates signature, expiry, blacklist)
        result = super().authenticate(request)
        if result is None:
            return None

        user, validated_token = result

        # Step 2: enforce tenant binding
        request_tenant = getattr(request, 'tenant', None)
        token_tenant_id = validated_token.get('tenant_id', 'MISSING')

        if token_tenant_id == 'MISSING':
            from core.audit import AuditEvent
            _log_auth_event(AuditEvent.TOKEN_REJECTED, request,
                            extra={'reason': 'missing_tenant_claim',
                                   'user_id': getattr(user, 'id', None)})
            raise InvalidToken('Token is missing the tenant_id claim. Please log in again.')

        if request_tenant is None:
            if token_tenant_id is not None:
                from core.audit import AuditEvent
                _log_auth_event(AuditEvent.CROSS_TENANT_PROBE, request, extra={
                    'reason': 'tenant_token_on_main_domain',
                    'token_tenant_id': token_tenant_id,
                    'user_id': getattr(user, 'id', None),
                })
                raise AuthenticationFailed(
                    'This token is scoped to a tenant workspace and cannot be '
                    'used on the main domain. Please log in here.'
                )
            # Step 3a: verify admin domain isolation HMAC (domain_sig)
            self._verify_domain_sig(validated_token, user, request)
        else:
            if token_tenant_id is None:
                from core.audit import AuditEvent
                _log_auth_event(AuditEvent.CROSS_TENANT_PROBE, request, extra={
                    'reason': 'main_domain_token_on_tenant',
                    'request_tenant_id': request_tenant.id,
                    'user_id': getattr(user, 'id', None),
                })
                raise AuthenticationFailed(
                    'This token is a main-domain token and cannot be used '
                    'inside a tenant workspace. Please log in to this workspace.'
                )
            if token_tenant_id != request_tenant.id:
                from core.audit import AuditEvent
                _log_auth_event(AuditEvent.CROSS_TENANT_PROBE, request, extra={
                    'reason': 'token_tenant_mismatch',
                    'token_tenant_id': token_tenant_id,
                    'request_tenant_id': request_tenant.id,
                    'user_id': getattr(user, 'id', None),
                })
                raise AuthenticationFailed('This token belongs to a different workspace.')
            # Step 3b: verify per-tenant HMAC binding (tenant_sig)
            self._verify_tenant_sig(validated_token, request_tenant, user, request)

        return user, validated_token

    # -- Binding claim verification -------------------------------------------

    def _verify_tenant_sig(self, token, tenant, user, request):
        """
        Verify the tenant_sig HMAC claim against the tenant's jwt_signing_secret.

        Tokens missing tenant_sig were issued before Phase 4 -- reject them so
        users re-authenticate and get properly signed tokens.
        Rotating tenant.jwt_signing_secret instantly invalidates all old tokens
        for that tenant without touching the global DJANGO_SECRET_KEY.
        """
        import hashlib
        import hmac as _hmac
        from core.audit import AuditEvent

        tenant_sig = token.get('tenant_sig', None)
        if tenant_sig is None:
            _log_auth_event(AuditEvent.TOKEN_REJECTED, request, extra={
                'reason': 'missing_tenant_sig',
                'user_id': getattr(user, 'id', None),
                'tenant_id': tenant.id,
            })
            raise InvalidToken('Token is missing the tenant binding claim. Please log in again.')

        signing_secret = getattr(tenant, 'jwt_signing_secret', '') or ''
        if not signing_secret:
            raise InvalidToken('Tenant JWT signing secret is not configured.')

        user_id = getattr(user, 'pk', getattr(user, 'id', 0))
        key = signing_secret.encode('utf-8')
        message = f'{user_id}:{tenant.id}'.encode('utf-8')
        expected = _hmac.new(key, message, hashlib.sha256).hexdigest()

        if not _hmac.compare_digest(tenant_sig, expected):
            _log_auth_event(AuditEvent.TOKEN_REJECTED, request, extra={
                'reason': 'tenant_sig_mismatch',
                'user_id': getattr(user, 'id', None),
                'tenant_id': tenant.id,
            })
            raise AuthenticationFailed(
                'Token binding is invalid for this workspace. Please log in again.'
            )

    def _verify_domain_sig(self, token, user, request):
        """
        Verify the domain_sig HMAC claim for main-domain (superadmin) tokens.

        Provides admin domain isolation: even if DJANGO_SECRET_KEY leaks, an
        attacker cannot forge admin tokens without knowing SUPERADMIN_JWT_SECRET.
        Set SUPERADMIN_JWT_SECRET env var to a different value from DJANGO_SECRET_KEY
        in production for maximum isolation.
        """
        import hashlib
        import hmac as _hmac
        from django.conf import settings
        from core.audit import AuditEvent

        domain_sig = token.get('domain_sig', None)
        if domain_sig is None:
            _log_auth_event(AuditEvent.TOKEN_REJECTED, request, extra={
                'reason': 'missing_domain_sig',
                'user_id': getattr(user, 'id', None),
            })
            raise InvalidToken('Token is missing the domain binding claim. Please log in again.')

        secret = getattr(settings, 'SUPERADMIN_JWT_SECRET', settings.SECRET_KEY)
        user_id = getattr(user, 'pk', getattr(user, 'id', 0))
        key = secret.encode('utf-8')
        message = str(user_id).encode('utf-8')
        expected = _hmac.new(key, message, hashlib.sha256).hexdigest()

        if not _hmac.compare_digest(domain_sig, expected):
            _log_auth_event(AuditEvent.TOKEN_REJECTED, request, extra={
                'reason': 'domain_sig_mismatch',
                'user_id': getattr(user, 'id', None),
            })
            raise AuthenticationFailed(
                'Admin domain token binding is invalid. Please log in again.'
            )
