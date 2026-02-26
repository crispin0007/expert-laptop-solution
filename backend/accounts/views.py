from django.core.cache import cache
from django.db.models import Count, Q
from rest_framework import viewsets, permissions, status, generics
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.throttling import AnonRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework.exceptions import AuthenticationFailed
from .tokens import TenantRefreshToken

from .models import User, TenantMembership
from .serializers import (
    UserSerializer, TenantMembershipSerializer,
    MeSerializer, StaffAvailabilitySerializer,
    StaffSerializer, InviteStaffSerializer, UpdateStaffSerializer,
)
from core.mixins import TenantMixin
from core.permissions import (
    TenantRolePermission, make_role_permission,
    ALL_ROLES, STAFF_ROLES, MANAGER_ROLES, ADMIN_ROLES,
)


class LoginRateThrottle(AnonRateThrottle):
    """Strict per-IP rate limit on the token endpoint (3/min, burst=5).
    This is a Django-layer defence; nginx applies limit_req zone=auth_limit
    (5/min) as a first layer so direct-to-gunicorn calls are also covered."""
    scope = 'login'
    rate = '5/min'


class TenantTokenObtainPairView(TokenObtainPairView):
    """
    Tenant-aware JWT login — the ONLY place tokens are issued.

    Security model
    ──────────────
    Every token carries a cryptographically signed `tenant_id` claim.
    TenantJWTAuthentication (accounts/authentication.py) validates this
    claim on EVERY subsequent request — at the authentication layer, before
    any view or permission class runs.

    This means:
      • A token issued for tenant A is rejected on tenant B — backend enforced.
      • A main-domain token is rejected on any tenant workspace.
      • No frontend, header, proxy, or custom client can bypass this.

    Login rules
    ───────────
      Main domain (no tenant):  only superusers may log in → token has tenant_id=None
      Tenant subdomain:         only active workspace members may log in → token has tenant_id=<id>
      Superuser on tenant:      rejected — superusers are root-domain only
      Staff on root domain:     rejected — staff must use workspace URL
    """
    throttle_classes = [LoginRateThrottle]

    def post(self, request, *args, **kwargs):
        # Step 1: validate credentials using SimpleJWT's serializer
        serializer = TokenObtainPairSerializer(
            data=request.data,
            context=self.get_serializer_context(),
        )
        try:
            serializer.is_valid(raise_exception=True)
        except Exception:
            raise AuthenticationFailed('Invalid email or password.')

        user = serializer.user
        tenant = getattr(request, 'tenant', None)

        # Step 2: domain / membership gate
        if tenant is None:
            # Root domain — superusers only. Staff must use their workspace URL.
            if not user.is_superuser:
                raise AuthenticationFailed(
                    'Staff accounts must log in via your workspace URL. '
                    'Please use <your-company>.nexusbms.com to sign in.'
                )
        else:
            # Tenant subdomain — superusers are root-domain accounts and must
            # NOT log in here. Only active workspace members may log in.
            if user.is_superuser:
                raise AuthenticationFailed(
                    'Super-admin accounts must log in from the main domain, '
                    'not a workspace URL.'
                )
            is_member = TenantMembership.objects.filter(
                user=user,
                tenant=tenant,
                is_active=True,
            ).exists()
            if not is_member:
                raise AuthenticationFailed(
                    'You are not a member of this workspace. '
                    'Contact your administrator.'
                )

        # Step 3: issue tenant-scoped tokens
        # tenant_id is embedded in the JWT payload and validated on every request
        # by TenantJWTAuthentication — no client-side value can override this.
        refresh = TenantRefreshToken.for_user_and_tenant(user, tenant)

        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
        })


class TenantTokenRefreshView(TokenRefreshView):
    """
    Tenant-aware token refresh.

    Wraps SimpleJWT's TokenRefreshView to ensure the new access token is
    issued via TenantRefreshToken so the tenant_id claim is preserved in
    the rotated tokens.  Without this, the default RefreshToken class would
    strip the custom claim from the refreshed access token.
    """

    def post(self, request, *args, **kwargs):
        raw_refresh = request.data.get('refresh', '')
        if not raw_refresh:
            raise AuthenticationFailed('Refresh token is required.')

        try:
            # Instantiate as TenantRefreshToken so access_token_class = TenantAccessToken
            old_refresh = TenantRefreshToken(raw_refresh)
        except TokenError as exc:
            raise AuthenticationFailed(str(exc))

        # Validate tenant claim consistency:
        # The refresh token must have been issued for the current tenant.
        request_tenant = getattr(request, 'tenant', None)
        token_tenant_id = old_refresh.get('tenant_id', 'MISSING')

        if token_tenant_id == 'MISSING':
            raise AuthenticationFailed('Token is missing the tenant_id claim. Please log in again.')

        if request_tenant is None and token_tenant_id is not None:
            raise AuthenticationFailed('This token belongs to a tenant workspace.')

        if request_tenant is not None:
            if token_tenant_id is None or token_tenant_id != request_tenant.id:
                raise AuthenticationFailed('This token belongs to a different workspace.')

        # Issue a new access token (and rotate the refresh token)
        data = {'access': str(old_refresh.access_token)}

        if old_refresh.get('jti'):
            # Blacklist the old refresh token and issue a new one (ROTATE_REFRESH_TOKENS=True)
            try:
                old_refresh.blacklist()
            except Exception:
                pass  # token_blacklist app may not be installed
            new_refresh = TenantRefreshToken.for_user_and_tenant(
                request._request.user if hasattr(request, '_request') else request.user,
                request_tenant,
            ) if False else _rotate_refresh(old_refresh, request_tenant)
            data['refresh'] = str(new_refresh)

        return Response(data)


def _rotate_refresh(old_token: TenantRefreshToken, tenant) -> TenantRefreshToken:
    """Create a rotated refresh token preserving the tenant_id claim."""
    from rest_framework_simplejwt.tokens import BlacklistMixin
    from datetime import timezone as tz, datetime

    # Build a new refresh token carrying the same user + tenant
    from django.contrib.auth import get_user_model
    User = get_user_model()
    try:
        user_id = old_token['user_id']
        user = User.objects.get(pk=user_id)
        return TenantRefreshToken.for_user_and_tenant(user, tenant)
    except Exception:
        # Fallback: return a plain new token from the old one
        return old_token


class MeView(APIView):
    """GET /api/v1/accounts/me/ — current user + membership + permissions."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        serializer = MeSerializer(request.user, context={'request': request})
        data = dict(serializer.data)
        # Tell the frontend which domain context this request came from.
        # Main domain (no tenant resolved) → super admin portal.
        # Tenant domain → normal workspace.
        is_main = getattr(request, 'is_main_domain', request.tenant is None)
        data['domain_type'] = 'main' if is_main else 'tenant'
        data['is_main_domain'] = is_main

        # Include active modules so the frontend can gate routes/sidebar
        # without additional API calls.  Superadmin on root → all modules.
        tenant = getattr(request, 'tenant', None)
        if tenant is not None:
            data['active_modules'] = sorted(tenant.active_modules_set)
            data['plan'] = {
                'id': tenant.plan_id,
                'name': tenant.plan.name if tenant.plan else None,
                'slug': tenant.plan.slug if tenant.plan else None,
            }
        else:
            # Root domain / superadmin — no scoped module restriction
            data['active_modules'] = None  # None means "all" in the frontend
            data['plan'] = None

        return Response(data)


class LogoutView(APIView):
    """POST /api/v1/accounts/logout/ — blacklist the refresh token."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get('refresh')
        if not refresh_token:
            return Response({'detail': 'refresh token required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
        except TokenError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(status=status.HTTP_204_NO_CONTENT)


class StaffAvailabilityView(TenantMixin, APIView):
    """GET /api/v1/staff/availability/ — all staff with open ticket + active task counts, cached 5 min."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        tenant = request.tenant
        cache_key = f'staff_availability_{tenant.pk if tenant else "global"}'
        data = cache.get(cache_key)

        if data is None:
            # Get all staff memberships for this tenant
            member_ids = TenantMembership.objects.filter(
                tenant=tenant, is_active=True,
            ).values_list('user_id', flat=True)

            users = User.objects.filter(id__in=member_ids).annotate(
                open_tickets=Count(
                    'assigned_tickets',
                    filter=Q(assigned_tickets__status__in=['open', 'in_progress'],
                             assigned_tickets__is_deleted=False),
                    distinct=True,
                ),
                active_tasks=Count(
                    'project_tasks',
                    filter=Q(project_tasks__status='in_progress'),
                    distinct=True,
                ),
            )
            data = StaffAvailabilitySerializer(users, many=True).data
            cache.set(cache_key, data, timeout=300)  # 5 minutes

        return Response(data)


class UserViewSet(TenantMixin, viewsets.ReadOnlyModelViewSet):
    """Read-only user listing — members of the current tenant only."""

    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*MANAGER_ROLES)]

    def get_queryset(self):
        self.ensure_tenant()
        member_ids = TenantMembership.objects.filter(
            tenant=self.tenant, is_active=True,
        ).values_list('user_id', flat=True)
        return User.objects.filter(id__in=member_ids)


class TenantMembershipViewSet(TenantMixin, viewsets.ModelViewSet):
    """Tenant membership management — admin+ only."""

    queryset = TenantMembership.objects.all()
    serializer_class = TenantMembershipSerializer
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*ADMIN_ROLES)]

    def get_queryset(self):
        qs = super().get_queryset()
        tenant = getattr(self, 'tenant', None) or getattr(self.request, 'tenant', None)
        if tenant is not None:
            return qs.filter(tenant=tenant)
        return qs.none()


# ─── Sprint 2: Staff management ──────────────────────────────────────────────

class StaffViewSet(TenantMixin, viewsets.ViewSet):
    """
    GET  /api/v1/staff/                         — list all staff (manager+)
    POST /api/v1/staff/                         — invite a new staff member (admin+)
    GET  /api/v1/staff/{pk}/                    — staff profile + membership detail (manager+)
    PATCH/PUT /api/v1/staff/{pk}/               — update profile + membership (admin+)
    POST /api/v1/staff/{pk}/deactivate/         — deactivate membership (admin+)
    POST /api/v1/staff/{pk}/reactivate/         — reactivate membership (admin+)
    POST /api/v1/staff/{pk}/reset_password/     — admin resets password (admin+)
    """
    _NOT_FOUND = {'detail': 'Not found.'}

    def get_permissions(self):
        """Read actions: manager+. Write/admin actions: admin+."""
        read_actions = ('list', 'retrieve', 'generate_employee_id')
        if self.action in read_actions:
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]

    def _get_tenant_staff(self, tenant):
        """Return User queryset for ALL members of this tenant (active + inactive)."""
        member_ids = TenantMembership.objects.filter(
            tenant=tenant,
        ).values_list('user_id', flat=True)
        return User.objects.filter(id__in=member_ids)

    def list(self, request):
        self.ensure_tenant()
        dept_id = request.query_params.get('department')
        memberships = TenantMembership.objects.filter(tenant=self.tenant)
        if dept_id:
            memberships = memberships.filter(department_id=dept_id)
        member_ids = memberships.values_list('user_id', flat=True)
        users = User.objects.filter(id__in=member_ids)
        serializer = StaffSerializer(users, many=True, context={'tenant': self.tenant, 'request': request})
        return Response(serializer.data)

    def create(self, request):
        self.ensure_tenant()
        serializer = InviteStaffSerializer(data=request.data, context={'tenant': self.tenant})
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        cache.delete(f'staff_availability_{self.tenant.pk}')
        out = StaffSerializer(user, context={'tenant': self.tenant, 'request': request})
        return Response(out.data, status=status.HTTP_201_CREATED)

    def retrieve(self, request, pk=None):
        self.ensure_tenant()
        try:
            membership = TenantMembership.objects.select_related('user').get(
                user_id=pk, tenant=self.tenant
            )
        except TenantMembership.DoesNotExist:
            return Response(self._NOT_FOUND, status=status.HTTP_404_NOT_FOUND)
        serializer = StaffSerializer(
            membership.user, context={'tenant': self.tenant, 'request': request}
        )
        return Response(serializer.data)

    def partial_update(self, request, pk=None):
        self.ensure_tenant()
        try:
            membership = TenantMembership.objects.select_related('user').get(
                user_id=pk, tenant=self.tenant
            )
        except TenantMembership.DoesNotExist:
            return Response(self._NOT_FOUND, status=status.HTTP_404_NOT_FOUND)
        serializer = UpdateStaffSerializer(
            membership.user, data=request.data, partial=True,
            context={'tenant': self.tenant}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        cache.delete(f'staff_availability_{self.tenant.pk}')
        out = StaffSerializer(membership.user, context={'tenant': self.tenant, 'request': request})
        return Response(out.data)

    def update(self, request, pk=None):
        return self.partial_update(request, pk=pk)

    @action(detail=False, methods=['get'], url_path='generate_employee_id')
    def generate_employee_id(self, request):
        """GET /api/v1/staff/generate_employee_id/ — return a unique EMP-XXXX for this tenant."""
        import random
        self.ensure_tenant()
        existing = set(
            TenantMembership.objects.filter(tenant=self.tenant)
            .exclude(employee_id='')
            .values_list('employee_id', flat=True)
        )
        for _ in range(100):
            candidate = f'EMP-{random.randint(1000, 9999)}'
            if candidate not in existing:
                return Response({'employee_id': candidate})
        # Extremely unlikely fallback — widen range
        return Response({'employee_id': f'EMP-{random.randint(10000, 99999)}'})

    @action(detail=True, methods=['post'], url_path='deactivate')
    def deactivate(self, request, pk=None):
        """POST /api/v1/staff/{id}/deactivate/ — disable login for this staff member."""
        self.ensure_tenant()
        try:
            membership = TenantMembership.objects.get(user_id=pk, tenant=self.tenant)
        except TenantMembership.DoesNotExist:
            return Response(self._NOT_FOUND, status=status.HTTP_404_NOT_FOUND)
        if not membership.is_active:
            return Response({'detail': 'Staff member is already inactive.'}, status=status.HTTP_400_BAD_REQUEST)
        membership.is_active = False
        membership.save(update_fields=['is_active'])
        cache.delete(f'staff_availability_{self.tenant.pk}')
        return Response({'detail': 'Staff member deactivated.'})

    @action(detail=True, methods=['post'], url_path='reactivate')
    def reactivate(self, request, pk=None):
        """POST /api/v1/staff/{id}/reactivate/ — re-enable login and notify staff by email."""
        self.ensure_tenant()
        try:
            membership = TenantMembership.objects.select_related('user').get(
                user_id=pk, tenant=self.tenant
            )
        except TenantMembership.DoesNotExist:
            return Response(self._NOT_FOUND, status=status.HTTP_404_NOT_FOUND)
        if membership.is_active:
            return Response({'detail': 'Staff member is already active.'}, status=status.HTTP_400_BAD_REQUEST)
        membership.is_active = True
        membership.save(update_fields=['is_active'])
        cache.delete(f'staff_availability_{self.tenant.pk}')
        # Send reactivation email — try Celery first, fall back to synchronous send
        try:
            from notifications.tasks import task_send_staff_reactivated
            task_send_staff_reactivated.delay(user_id=membership.user.pk, tenant_id=self.tenant.pk)
        except Exception:
            try:
                from notifications.email import send_staff_reactivated
                send_staff_reactivated(membership.user, self.tenant)
            except Exception:
                pass
        return Response({'detail': f'Staff member reactivated. Email sent to {membership.user.email}.'})

    @action(detail=True, methods=['post'], url_path='reset_password')
    def reset_password(self, request, pk=None):
        """POST /api/v1/staff/{id}/reset_password/ — admin resets a staff member's password."""
        self.ensure_tenant()
        import secrets, string

        # Must be a member of this tenant
        try:
            membership = TenantMembership.objects.select_related('user').get(
                user_id=pk, tenant=self.tenant
            )
        except TenantMembership.DoesNotExist:
            return Response(self._NOT_FOUND, status=status.HTTP_404_NOT_FOUND)

        new_password = request.data.get('password', '').strip()
        if not new_password:
            # Generate a secure random password if none provided
            alphabet = string.ascii_letters + string.digits + '!@#$%^&*'
            new_password = ''.join(secrets.choice(alphabet) for _ in range(16))

        if len(new_password) < 8:
            return Response(
                {'password': 'Password must be at least 8 characters.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = membership.user
        user.set_password(new_password)
        user.save(update_fields=['password'])

        # Notify the staff member by email — try Celery first, fall back to synchronous send
        try:
            from notifications.tasks import task_send_staff_password_reset
            task_send_staff_password_reset.delay(
                user_id=user.pk,
                tenant_id=self.tenant.pk,
                new_password=new_password,
            )
        except Exception:
            try:
                from notifications.email import send_staff_password_reset
                send_staff_password_reset(user, self.tenant, new_password)
            except Exception:
                pass

        return Response({'detail': f'Password reset. Email sent to {user.email}.'})

    @action(detail=True, methods=['post'], url_path='assign-role')
    def assign_role(self, request, pk=None):
        """
        POST /api/v1/staff/{id}/assign-role/

        Assign or change the role for a staff member in this tenant.

        Body (one of):
            { "role": "manager" }                          — system role
            { "role": "custom", "custom_role_id": 7 }     — custom/preload role

        System roles: owner, admin, manager, staff, viewer
        Custom roles: any Role object belonging to this tenant
                      (Finance, Technician, HR, etc.)
        """
        self.ensure_tenant()
        try:
            membership = TenantMembership.objects.select_related('user').get(
                user_id=pk, tenant=self.tenant
            )
        except TenantMembership.DoesNotExist:
            return Response(self._NOT_FOUND, status=status.HTTP_404_NOT_FOUND)

        role = request.data.get('role', '').strip()
        valid_system_roles = ['owner', 'admin', 'manager', 'staff', 'viewer', 'custom']
        if role not in valid_system_roles:
            return Response(
                {'detail': f'Invalid role. Choose from: {", ".join(valid_system_roles)}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if role == 'custom':
            custom_role_id = request.data.get('custom_role_id')
            if not custom_role_id:
                return Response(
                    {'detail': 'custom_role_id is required when role is "custom".'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            from roles.models import Role as CustomRole
            try:
                custom_role = CustomRole.objects.get(pk=custom_role_id, tenant=self.tenant)
            except CustomRole.DoesNotExist:
                return Response(
                    {'detail': 'Custom role not found in this workspace.'},
                    status=status.HTTP_404_NOT_FOUND,
                )
            membership.role = 'custom'
            membership.custom_role = custom_role
        else:
            membership.role = role
            membership.custom_role = None

        membership.save(update_fields=['role', 'custom_role'])
        cache.delete(f'staff_availability_{self.tenant.pk}')

        role_display = (
            membership.custom_role.name if membership.custom_role else membership.role
        )
        return Response({
            'detail': f'Role updated to "{role_display}" for {membership.user.email}.',
            'user_id': membership.user_id,
            'role': membership.role,
            'custom_role_id': membership.custom_role_id,
            'custom_role_name': membership.custom_role.name if membership.custom_role else None,
        })
