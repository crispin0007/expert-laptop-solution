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
from core.audit import log_event, AuditEvent


class LoginRateThrottle(AnonRateThrottle):
    """Strict per-IP rate limit on the token endpoint.
    Rate is configured via DEFAULT_THROTTLE_RATES['login'] in settings.
    Dev settings raise this to 1000/min to allow unrestricted testing.
    This is a Django-layer defence; nginx applies limit_req zone=auth_limit
    (5/min) as a first layer so direct-to-gunicorn calls are also covered."""
    scope = 'login'


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
    # Login endpoint must NOT authenticate the incoming request — the caller
    # is unauthenticated by definition.  Without this, DRF's default auth
    # classes (TenantJWTAuthentication) try to validate any stale Bearer token
    # that the browser attached from a previous session and return 401 before
    # the view even reads the credentials in the POST body.
    authentication_classes = []
    permission_classes = []
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
            log_event(
                AuditEvent.LOGIN_FAILED,
                request=request,
                tenant=getattr(request, 'tenant', None),
                extra={
                    'email': request.data.get('email', ''),
                    'reason': 'invalid_credentials',
                },
            )
            raise AuthenticationFailed('Invalid email or password.')

        user = serializer.user
        tenant = getattr(request, 'tenant', None)

        # Step 2: domain / membership gate
        if tenant is None:
            # Root domain — superusers only. Staff must use their workspace URL.
            if not user.is_superuser:
                log_event(
                    AuditEvent.LOGIN_FAILED,
                    request=request,
                    actor=user,
                    extra={'email': user.email, 'reason': 'staff_on_root_domain'},
                )
                raise AuthenticationFailed(
                    'Staff accounts must log in via your workspace URL. '
                    'Please use <your-company>.nexusbms.com to sign in.'
                )
        else:
            # Tenant subdomain — superusers are root-domain accounts and must
            # NOT log in here. Only active workspace members may log in.
            if user.is_superuser:
                log_event(
                    AuditEvent.LOGIN_FAILED,
                    request=request,
                    actor=user,
                    tenant=tenant,
                    extra={'email': user.email, 'reason': 'superuser_on_tenant'},
                )
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
                log_event(
                    AuditEvent.LOGIN_FAILED,
                    request=request,
                    actor=user,
                    tenant=tenant,
                    extra={'email': user.email, 'reason': 'not_a_member'},
                )
                raise AuthenticationFailed(
                    'You are not a member of this workspace. '
                    'Contact your administrator.'
                )

        # Step 3: 2FA gate — if enabled, pause and return a short-lived partial
        # token. The client must verify the OTP at POST /auth/2fa/verify/ to
        # receive the actual JWT pair. The partial token is a UUID stored in
        # Redis for 5 minutes; it carries no sensitive data itself.
        if user.is_2fa_enabled:
            import uuid as _uuid
            partial_token = str(_uuid.uuid4())
            cache.set(
                f'2fa_partial_{partial_token}',
                {'user_id': user.pk, 'tenant_id': tenant.id if tenant else None},
                timeout=300,
            )
            return Response({
                'requires_2fa': True,
                'two_factor_token': partial_token,
            })

        # Step 4: issue tenant-scoped tokens
        # tenant_id is embedded in the JWT payload and validated on every request
        # by TenantJWTAuthentication — no client-side value can override this.
        refresh = TenantRefreshToken.for_user_and_tenant(user, tenant)

        log_event(
            AuditEvent.LOGIN_SUCCESS,
            request=request,
            actor=user,
            tenant=tenant,
            extra={'email': user.email, 'is_superuser': user.is_superuser},
        )

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
    authentication_classes = []
    permission_classes = []

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
            new_refresh = _rotate_refresh(old_refresh, request_tenant)
            data['refresh'] = str(new_refresh)

        return Response(data)


def _rotate_refresh(old_token: TenantRefreshToken, tenant) -> TenantRefreshToken:
    """Create a rotated refresh token preserving the tenant_id claim."""
    from django.contrib.auth import get_user_model
    from rest_framework_simplejwt.exceptions import TokenError
    User = get_user_model()
    try:
        user_id = old_token['user_id']
        user = User.objects.get(pk=user_id)
    except (User.DoesNotExist, KeyError):
        # The user no longer exists — this token must not be rotated.
        # Raise so the refresh view returns 401 rather than silently
        # re-issuing a new refresh token for a deleted/deactivated account.
        raise TokenError('User account no longer exists.')
    if not user.is_active:
        raise TokenError('User account is deactivated.')
    return TenantRefreshToken.for_user_and_tenant(user, tenant)


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
        tenant = getattr(request, 'tenant', None)
        # Guard: this endpoint requires a tenant workspace. Without it the cache
        # key degenerates to 'staff_availability_global' and any tenant's data
        # could leak to main-domain callers.
        if tenant is None:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('This endpoint requires a tenant workspace context.')
        cache_key = f'staff_availability_{tenant.pk}'
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
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*MANAGER_ROLES, permission_key='staff.view')]

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
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*ADMIN_ROLES, permission_key='staff.manage')]

    def get_queryset(self):
        qs = super().get_queryset()
        tenant = getattr(self, 'tenant', None) or getattr(self.request, 'tenant', None)
        if tenant is not None:
            return qs.filter(tenant=tenant)
        return qs.none()

    def perform_create(self, serializer):
        """Inject tenant server-side — never accept it from request body."""
        self.ensure_tenant()
        serializer.save(tenant=self.tenant)


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
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES, permission_key='staff.view')()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES, permission_key='staff.manage')()]

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
        from accounts import services as staff_service
        user = staff_service.invite_staff(tenant=self.tenant, data=request.data)
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
        from accounts import services as staff_service
        staff_service.update_staff(tenant=self.tenant, user=membership.user, data=request.data)
        out = StaffSerializer(membership.user, context={'tenant': self.tenant, 'request': request})
        return Response(out.data)

    def update(self, request, pk=None):
        return self.partial_update(request, pk=pk)

    @action(detail=False, methods=['get'], url_path='generate_employee_id')
    def generate_employee_id(self, request):
        """GET /api/v1/staff/generate_employee_id/ — return a unique EMP-XXXX for this tenant."""
        # Use secrets (CSPRNG) instead of random — employee IDs are exposed to
        # users and predictability could allow enumeration / social engineering.
        import secrets
        self.ensure_tenant()
        existing = set(
            TenantMembership.objects.filter(tenant=self.tenant)
            .exclude(employee_id='')
            .values_list('employee_id', flat=True)
        )
        for _ in range(100):
            candidate = f'EMP-{secrets.randbelow(9000) + 1000}'
            if candidate not in existing:
                return Response({'employee_id': candidate})
        # Extremely unlikely fallback — widen range
        return Response({'employee_id': f'EMP-{secrets.randbelow(90000) + 10000}'})

    @action(detail=True, methods=['post'], url_path='deactivate')
    def deactivate(self, request, pk=None):
        """POST /api/v1/staff/{id}/deactivate/ — disable login for this staff member."""
        self.ensure_tenant()
        try:
            membership = TenantMembership.objects.get(user_id=pk, tenant=self.tenant)
        except TenantMembership.DoesNotExist:
            return Response(self._NOT_FOUND, status=status.HTTP_404_NOT_FOUND)
        from accounts import services as staff_service
        try:
            staff_service.deactivate_staff(tenant=self.tenant, membership=membership)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
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
        from accounts import services as staff_service
        try:
            staff_service.reactivate_staff(tenant=self.tenant, membership=membership)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
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

        # SECURITY: never pass the plaintext password to Celery — task args are
        # serialised and stored in Redis broker in plaintext. Instead, pass only
        # the new_password to the synchronous email function directly, which sends
        # it over TLS-encrypted SMTP and never persists it beyond the call stack.
        try:
            from notifications.email import send_staff_password_reset
            send_staff_password_reset(user, self.tenant, new_password)
        except Exception:
            pass  # email failure must not block the password reset itself

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

        from accounts import services as staff_service
        try:
            membership = staff_service.assign_role(
                tenant=self.tenant,
                membership=membership,
                role=role,
                custom_role_id=request.data.get('custom_role_id'),
            )
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except LookupError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_404_NOT_FOUND)

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


# ── Two-Factor Authentication views ──────────────────────────────────────────

class TwoFASetupView(APIView):
    """
    GET /api/v1/accounts/2fa/setup/

    Generate a TOTP secret, persist it as *pending* (not yet active), and
    return the provisioning URI for the authenticator app to scan.
    Call POST /auth/2fa/confirm-setup/ with the first valid code to activate.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        import pyotp
        import qrcode
        import io
        import base64
        secret = pyotp.random_base32()
        # Persist the pending secret — confirm-setup will verify against it
        request.user.totp_secret = secret
        request.user.save(update_fields=['totp_secret'])
        totp = pyotp.TOTP(secret)
        provisioning_uri = totp.provisioning_uri(
            name=request.user.email,
            issuer_name='NEXUS BMS',
        )
        # Generate QR code as base64 PNG data URI
        qr = qrcode.make(provisioning_uri)
        buf = io.BytesIO()
        qr.save(buf, format='PNG')
        qr_code_url = 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()
        return Response({
            'secret': secret,
            'provisioning_uri': provisioning_uri,
            'qr_code_url': qr_code_url,
            'is_2fa_enabled': request.user.is_2fa_enabled,
        })


class TwoFAConfirmSetupView(APIView):
    """
    POST /api/v1/accounts/2fa/confirm-setup/
    Body: { "code": "123456" }

    Verifies the first TOTP code from the authenticator app to activate 2FA.
    Returns 8 one-time backup codes (shown exactly once — store them safely).
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        import pyotp
        from .serializers import TwoFAConfirmSerializer

        ser = TwoFAConfirmSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        code = ser.validated_data['code']

        user = request.user
        if not user.totp_secret:
            return Response(
                {'detail': 'No pending 2FA setup. Call GET /2fa/setup/ first.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if user.is_2fa_enabled:
            return Response(
                {'detail': '2FA is already enabled. Disable it first to re-configure.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        totp = pyotp.TOTP(user.totp_secret)
        if not totp.verify(code, valid_window=1):
            return Response(
                {'detail': 'Invalid code. Please try again or ensure your device clock is accurate.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        plain_codes = user.generate_backup_codes(count=8)
        user.is_2fa_enabled = True
        user.save(update_fields=['is_2fa_enabled', 'totp_secret', 'backup_codes'])

        log_event(
            AuditEvent.TWO_FA_ENABLED,
            request=request,
            actor=user,
            tenant=getattr(request, 'tenant', None),
        )
        return Response({
            'detail': '2FA enabled successfully.',
            'backup_codes': plain_codes,
        }, status=status.HTTP_200_OK)


class TwoFAVerifyView(APIView):
    """
    POST /api/v1/accounts/2fa/verify/
    Body: { "two_factor_token": "<uuid>", "code": "123456" }

    Step 2 of the 2FA login flow. Validates the TOTP code (or a backup code)
    against the pending partial token issued at login. On success returns the
    full JWT pair and invalidates the partial token (single-use).
    """
    permission_classes = [permissions.AllowAny]   # pre-auth — no token yet
    authentication_classes = []                    # skip JWT auth entirely — prevent AuthenticationFailed on stale tokens
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        import pyotp
        from .serializers import TwoFAVerifySerializer
        from django.contrib.auth import get_user_model as _get_user_model

        ser = TwoFAVerifySerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        two_factor_token = ser.validated_data['two_factor_token']
        code             = ser.validated_data['code']

        # Validate the partial token stored in cache
        cache_key = f'2fa_partial_{two_factor_token}'
        cached    = cache.get(cache_key)
        if not cached:
            return Response(
                {'detail': 'Invalid or expired two_factor_token. Please log in again.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        _User  = _get_user_model()
        tenant = None
        try:
            user = _User.objects.get(pk=cached['user_id'])
        except _User.DoesNotExist:
            cache.delete(cache_key)
            return Response({'detail': 'User not found.'}, status=status.HTTP_401_UNAUTHORIZED)

        tenant_id = cached.get('tenant_id')
        if tenant_id:
            from tenants.models import Tenant as _Tenant
            try:
                tenant = _Tenant.objects.get(pk=tenant_id)
            except _Tenant.DoesNotExist:
                pass

        # Verify TOTP or backup code
        verified = False
        if user.totp_secret:
            verified = pyotp.TOTP(user.totp_secret).verify(code, valid_window=1)

        if not verified:
            # Fallback: single-use backup code
            if user.verify_backup_code(code):
                user.save(update_fields=['backup_codes'])
                verified = True

        if not verified:
            log_event(
                AuditEvent.LOGIN_FAILED,
                request=request,
                actor=user,
                tenant=tenant,
                extra={'email': user.email, 'reason': 'invalid_2fa_code'},
            )
            return Response(
                {'detail': 'Invalid 2FA code.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Partial token is single-use — invalidate immediately after success
        cache.delete(cache_key)

        refresh = TenantRefreshToken.for_user_and_tenant(user, tenant)
        log_event(
            AuditEvent.LOGIN_SUCCESS,
            request=request,
            actor=user,
            tenant=tenant,
            extra={'email': user.email, 'two_fa': True},
        )
        return Response({
            'access':  str(refresh.access_token),
            'refresh': str(refresh),
        })


class TwoFADisableView(APIView):
    """
    POST /api/v1/accounts/2fa/disable/
    Body: { "code": "123456", "password": "current-password" }

    Disables 2FA. Requires both the current TOTP code and the account password
    to prevent an attacker who has hijacked a session from silently removing 2FA.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        import pyotp
        from .serializers import TwoFADisableSerializer

        ser = TwoFADisableSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        code     = ser.validated_data['code']
        password = ser.validated_data['password']

        user = request.user
        if not user.is_2fa_enabled:
            return Response(
                {'detail': '2FA is not enabled on this account.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not user.check_password(password):
            return Response(
                {'detail': 'Incorrect password.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not pyotp.TOTP(user.totp_secret).verify(code, valid_window=1):
            return Response(
                {'detail': 'Invalid 2FA code.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.is_2fa_enabled = False
        user.totp_secret    = ''
        user.backup_codes   = []
        user.save(update_fields=['is_2fa_enabled', 'totp_secret', 'backup_codes'])

        log_event(
            AuditEvent.TWO_FA_DISABLED,
            request=request,
            actor=user,
            tenant=getattr(request, 'tenant', None),
        )
        return Response({'detail': '2FA disabled.'})


class TwoFABackupCodesView(APIView):
    """
    GET /api/v1/accounts/2fa/backup-codes/
    Returns the count of remaining backup codes (not the codes themselves).
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not request.user.is_2fa_enabled:
            return Response(
                {'detail': '2FA is not enabled on this account.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({'remaining_backup_codes': len(request.user.backup_codes or [])})


class TwoFARegenerateBackupCodesView(APIView):
    """
    POST /api/v1/accounts/2fa/backup-codes/regenerate/
    Body: { "code": "123456" }

    Regenerates all 8 backup codes. Invalidates all previous backup codes.
    Requires a valid current TOTP code. Returns new plain codes exactly once.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        import pyotp
        from .serializers import TwoFAConfirmSerializer

        ser = TwoFAConfirmSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        code = ser.validated_data['code']

        user = request.user
        if not user.is_2fa_enabled:
            return Response(
                {'detail': '2FA is not enabled on this account.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not pyotp.TOTP(user.totp_secret).verify(code, valid_window=1):
            return Response(
                {'detail': 'Invalid 2FA code.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        plain_codes = user.generate_backup_codes(count=8)
        user.save(update_fields=['backup_codes'])

        return Response({
            'backup_codes': plain_codes,
            'detail': '8 new backup codes generated. Store them safely — they will not be shown again.',
        })
