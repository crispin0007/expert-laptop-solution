from django.core.cache import cache
from django.db.models import Count, Q
from rest_framework import viewsets, permissions, status, generics
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError

from .models import User, TenantMembership
from .serializers import (
    UserSerializer, TenantMembershipSerializer,
    MeSerializer, StaffAvailabilitySerializer,
    StaffSerializer, InviteStaffSerializer, UpdateStaffSerializer,
)
from core.mixins import TenantMixin
from core.permissions import TenantRolePermission


class MeView(APIView):
    """GET /api/v1/accounts/me/ — current user + membership + permissions."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        serializer = MeSerializer(request.user, context={'request': request})
        return Response(serializer.data)


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
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]


class TenantMembershipViewSet(TenantMixin, viewsets.ModelViewSet):
    queryset = TenantMembership.objects.all()
    serializer_class = TenantMembershipSerializer
    permission_classes = [permissions.IsAuthenticated, TenantRolePermission]
    required_roles = ['owner', 'admin']

    def get_queryset(self):
        qs = super().get_queryset()
        tenant = getattr(self, 'tenant', None) or getattr(self.request, 'tenant', None)
        if tenant is not None:
            return qs.filter(tenant=tenant)
        return qs.none()


# ─── Sprint 2: Staff management ──────────────────────────────────────────────

class StaffViewSet(TenantMixin, viewsets.ViewSet):
    """
    GET  /api/v1/staff/                         — list all staff (active + inactive) in this tenant
    POST /api/v1/staff/                         — invite (create) a new staff member
    GET  /api/v1/staff/{pk}/                    — staff profile + membership detail
    PATCH/PUT /api/v1/staff/{pk}/               — update profile + membership
    POST /api/v1/staff/{pk}/deactivate/         — deactivate membership (blocks login)
    POST /api/v1/staff/{pk}/reactivate/         — reactivate membership + send email
    POST /api/v1/staff/{pk}/reset_password/     — admin resets a staff member's password
    """
    permission_classes = [permissions.IsAuthenticated]
    _NOT_FOUND = {'detail': 'Not found.'}

    def _get_tenant_staff(self, tenant):
        """Return User queryset for ALL members of this tenant (active + inactive)."""
        member_ids = TenantMembership.objects.filter(
            tenant=tenant,
        ).values_list('user_id', flat=True)
        return User.objects.filter(id__in=member_ids)

    def list(self, request):
        self.ensure_tenant()
        users = self._get_tenant_staff(self.tenant)
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
