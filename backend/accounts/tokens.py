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
"""
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken, Token


class TenantMixin:
    """Mixin that adds tenant_id to any SimpleJWT token class."""

    @classmethod
    def for_user_and_tenant(cls, user, tenant=None):
        """
        Issue a token for `user` scoped to `tenant`.

        Args:
            user:   Django User instance.
            tenant: Tenant instance, or None for the main / super-admin domain.

        Returns:
            Token instance with tenant_id embedded in payload.
        """
        token = cls.for_user(user)
        # None means "main domain — no tenant". Store explicitly so we can
        # distinguish an absent claim from a deliberately None one.
        token['tenant_id'] = tenant.id if tenant is not None else None
        return token


class TenantAccessToken(TenantMixin, AccessToken):
    pass


class TenantRefreshToken(TenantMixin, RefreshToken):
    # Point the paired access token class at our custom one
    access_token_class = TenantAccessToken
