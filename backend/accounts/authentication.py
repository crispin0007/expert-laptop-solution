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


class TenantJWTAuthentication(JWTAuthentication):
    """
    Drop-in replacement for JWTAuthentication that enforces the tenant_id claim.

    Registered in settings.REST_FRAMEWORK['DEFAULT_AUTHENTICATION_CLASSES'].
    """

    def authenticate(self, request):
        # Step 1: run standard SimpleJWT auth (validates signature, expiry, blacklist)
        result = super().authenticate(request)
        if result is None:
            # No token presented — let DRF permission classes handle it (e.g. 401 for protected views)
            return None

        user, validated_token = result

        # Step 2: enforce tenant binding
        request_tenant = getattr(request, 'tenant', None)
        token_tenant_id = validated_token.get('tenant_id', 'MISSING')

        # 'MISSING' means the token predates this feature (issued before the upgrade).
        # Reject it so old tokens cannot be replayed — users must log in again.
        if token_tenant_id == 'MISSING':
            raise InvalidToken(
                'Token is missing the tenant_id claim. Please log in again.'
            )

        if request_tenant is None:
            # Main domain request — only main-domain tokens (tenant_id=None) are valid
            if token_tenant_id is not None:
                raise AuthenticationFailed(
                    'This token is scoped to a tenant workspace and cannot be '
                    'used on the main domain. Please log in here.'
                )
        else:
            # Tenant workspace request — token must carry this exact tenant's ID
            if token_tenant_id is None:
                raise AuthenticationFailed(
                    'This token is a main-domain token and cannot be used '
                    'inside a tenant workspace. Please log in to this workspace.'
                )
            if token_tenant_id != request_tenant.id:
                raise AuthenticationFailed(
                    'This token belongs to a different workspace.'
                )

        return user, validated_token
