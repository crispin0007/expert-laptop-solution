"""
Tenant-scoped JWT tokens.

Every token issued by NEXUS BMS carries a `tenant_id` claim that is
cryptographically signed into the payload at login time.

  tenant_id = <int>   — token is valid ONLY for that tenant
  tenant_id = None    — token is valid ONLY on the main / super-admin domain

This means:
  - A token stolen from tenant A cannot be used on tenant B.
  - A main-domain token cannot be replayed against any tenant workspace.
  - No frontend header, subdomain, or any client-side value can override this.
    The check lives entirely in TenantJWTAuthentication (accounts/authentication.py).

Additional security claims (Phase 4):

  tenant_sig  — HMAC-SHA256(tenant.jwt_signing_secret, jti + ":" + tenant_id)
                Present on all tenant tokens. Rotating jwt_signing_secret on the
                Tenant model instantly invalidates all outstanding tokens for that
                tenant without touching the global DJANGO_SECRET_KEY.

  domain_sig  — HMAC-SHA256(SUPERADMIN_JWT_SECRET, jti)
                Present on main-domain (superadmin) tokens only. Provides
                cryptographic isolation between admin and tenant sessions: even
                if DJANGO_SECRET_KEY leaks, forging admin tokens requires the
                separate SUPERADMIN_JWT_SECRET environment variable.
"""
import hashlib
import hmac

from django.conf import settings
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken, Token


def _tenant_sig(user_id: int, tenant_id: int, secret: str) -> str:
    """HMAC-SHA256 binding a user+tenant pair to a specific per-tenant secret.

    Uses user_id:tenant_id as the message (not jti) so the claim is stable
    across the refresh→access token promotion (both tokens share the same claim
    value). Rotating jwt_signing_secret invalidates ALL tokens for the tenant.
    """
    key     = secret.encode('utf-8')
    message = f'{user_id}:{tenant_id}'.encode('utf-8')
    return hmac.new(key, message, hashlib.sha256).hexdigest()


def _domain_sig(user_id: int) -> str:
    """HMAC-SHA256 that ties a main-domain token to SUPERADMIN_JWT_SECRET.

    Uses user_id as the message so the claim survives the refresh→access token
    promotion. Rotating SUPERADMIN_JWT_SECRET invalidates ALL admin tokens.
    """
    secret = getattr(settings, 'SUPERADMIN_JWT_SECRET', settings.SECRET_KEY)
    key     = secret.encode('utf-8')
    message = str(user_id).encode('utf-8')
    return hmac.new(key, message, hashlib.sha256).hexdigest()


class TenantMixin:
    """Mixin that adds tenant_id (+ security binding claims) to any SimpleJWT token class."""

    @classmethod
    def for_user_and_tenant(cls, user, tenant=None):
        """
        Issue a token for `user` scoped to `tenant`.

        Args:
            user:   Django User instance.
            tenant: Tenant instance, or None for the main / super-admin domain.

        Returns:
            Token instance with tenant_id embedded in payload, plus:
              - tenant_sig  (tenant tokens) — per-tenant HMAC binding
              - domain_sig  (main-domain tokens) — admin domain isolation HMAC
        """
        token = cls.for_user(user)
        # Extract user_id for HMAC (stable across refresh→access promotion)
        user_id = getattr(user, 'pk', getattr(user, 'id', 0))

        if tenant is not None:
            # Tenant-scoped token
            token['tenant_id'] = tenant.id
            token['tenant_sig'] = _tenant_sig(user_id, tenant.id, tenant.jwt_signing_secret)
        else:
            # Main-domain (super-admin) token
            token['tenant_id'] = None
            token['domain_sig'] = _domain_sig(user_id)

        return token


class TenantAccessToken(TenantMixin, AccessToken):
    pass


class TenantRefreshToken(TenantMixin, RefreshToken):
    # Point the paired access token class at our custom one
    access_token_class = TenantAccessToken

