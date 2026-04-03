"""
hrm/views.py

Four viewsets covering Leave Types, Leave Balances, Leave Requests, and Staff Profiles.

All viewsets extend NexusViewSet (TenantMixin + JWT + modular access).
- tenant is NEVER accepted from request body — always request.tenant
- All queries scoped via self.tenant (set by TenantMixin.ensure_tenant)
- Business logic delegated to hrm/services/
"""
import logging

from rest_framework import permissions, status
from rest_framework.decorators import action

from core.permissions import (
    ADMIN_ROLES,
    ALL_ROLES,
    MANAGER_ROLES,
    STAFF_ROLES,
    make_role_permission,
)
from core.response import ApiResponse
from core.views import NexusViewSet
from core.pagination import NexusPageNumberPagination

from .models import LeaveBalance, LeaveRequest, LeaveType, StaffProfile
from .serializers import (
    LeaveBalanceSerializer,
    LeaveRejectSerializer,
    LeaveRequestListSerializer,
    LeaveRequestSerializer,
    LeaveRequestWriteSerializer,
    LeaveTypeMinimalSerializer,
    LeaveTypeSerializer,
    StaffProfileListSerializer,
    StaffProfileSerializer,
    StaffProfileWriteSerializer,
)
from . import services as hrm_services
from .services import leave_service, profile_service

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Leave Type
# ─────────────────────────────────────────────────────────────────────────────

class LeaveTypeViewSet(NexusViewSet):
    """
    GET    /api/v1/hrm/leave-types/             — list
    POST   /api/v1/hrm/leave-types/             — create
    GET    /api/v1/hrm/leave-types/{id}/        — retrieve
    PUT    /api/v1/hrm/leave-types/{id}/        — update
    DELETE /api/v1/hrm/leave-types/{id}/        — delete
    POST   /api/v1/hrm/leave-types/seed_defaults/ — seed Nepal defaults
    """
    required_module = 'hrm'
    serializer_class = LeaveTypeSerializer
    pagination_class = NexusPageNumberPagination

    def get_permissions(self):
        if self.action in ('list', 'retrieve', 'seed_defaults'):
            return [
                permissions.IsAuthenticated(),
                make_role_permission(*MANAGER_ROLES, permission_key='hrm.view')(),
            ]
        return [
            permissions.IsAuthenticated(),
            make_role_permission(*ADMIN_ROLES, permission_key='hrm.manage')(),
        ]

    def get_queryset(self):
        self.ensure_tenant()
        return LeaveType.objects.filter(tenant=self.tenant).order_by('name')

    def perform_create(self, serializer):
        serializer.save(tenant=self.tenant)

    @action(detail=False, methods=['post'], url_path='seed_defaults')
    def seed_defaults(self, request):
        """Seed the 6 Nepal default leave types for this tenant."""
        self.ensure_tenant()
        types = leave_service.seed_leave_types(self.tenant)
        serializer = LeaveTypeSerializer(types, many=True)
        return ApiResponse.success(
            data=serializer.data,
            message=f'{len(types)} leave type(s) seeded.',
        )


# ─────────────────────────────────────────────────────────────────────────────
# Leave Balance
# ─────────────────────────────────────────────────────────────────────────────

class LeaveBalanceViewSet(NexusViewSet):
    """
    GET    /api/v1/hrm/leave-balances/               — list (own or all for admin)
    GET    /api/v1/hrm/leave-balances/{id}/           — retrieve
    POST   /api/v1/hrm/leave-balances/seed_year/      — seed for all staff for a year
    """
    required_module = 'hrm'
    serializer_class = LeaveBalanceSerializer
    pagination_class = NexusPageNumberPagination
    http_method_names = ['get', 'head', 'options', 'post']

    def get_permissions(self):
        return [
            permissions.IsAuthenticated(),
            make_role_permission(*ALL_ROLES, permission_key='hrm.view')(),
        ]

    def get_queryset(self):
        self.ensure_tenant()
        qs = LeaveBalance.objects.filter(tenant=self.tenant).select_related(
            'staff', 'leave_type'
        )

        # Staff see only their own balances; managers/admins see everyone
        if self.request.user.tenantmemberships.filter(
            tenant=self.tenant, role__in=MANAGER_ROLES
        ).exists():
            staff_id = self.request.query_params.get('staff_id')
            if staff_id:
                qs = qs.filter(staff_id=staff_id)
        else:
            qs = qs.filter(staff=self.request.user)

        year = self.request.query_params.get('year')
        if year:
            qs = qs.filter(year=year)

        return qs.order_by('-year', 'leave_type__name')

    @action(detail=False, methods=['post'], url_path='seed_year')
    def seed_year(self, request):
        """Seed leave balances for all active staff for the given BS year.

        Query param: ?year=<BS year integer>
        """
        self.ensure_tenant()
        year = request.query_params.get('year') or request.data.get('year')
        if not year:
            return ApiResponse.error(message='year is required (e.g. ?year=2081)')
        try:
            year_int = int(year)
        except (TypeError, ValueError):
            return ApiResponse.error(message='year must be an integer.')

        # Only admins/managers can seed
        if not request.user.tenantmemberships.filter(
            tenant=self.tenant, role__in=MANAGER_ROLES
        ).exists():
            return ApiResponse.error(message='Permission denied.', status_code=403)

        total = leave_service.seed_all_balances_for_year(self.tenant, year_int)
        return ApiResponse.success(
            data={'year': year_int, 'balances_created_or_existing': total},
            message=f'Seeded {total} leave balance record(s) for BS {year_int}.',
        )


# ─────────────────────────────────────────────────────────────────────────────
# Leave Request
# ─────────────────────────────────────────────────────────────────────────────

class LeaveRequestViewSet(NexusViewSet):
    """
    GET    /api/v1/hrm/leave-requests/              — list
    POST   /api/v1/hrm/leave-requests/              — apply for leave
    GET    /api/v1/hrm/leave-requests/{id}/         — retrieve
    POST   /api/v1/hrm/leave-requests/{id}/approve/ — approve
    POST   /api/v1/hrm/leave-requests/{id}/reject/  — reject
    POST   /api/v1/hrm/leave-requests/{id}/cancel/  — cancel
    """
    required_module = 'hrm'
    serializer_class = LeaveRequestSerializer
    pagination_class = NexusPageNumberPagination
    http_method_names = ['get', 'head', 'options', 'post']

    def get_permissions(self):
        if self.action in ('approve', 'reject'):
            return [
                permissions.IsAuthenticated(),
                make_role_permission(*MANAGER_ROLES, permission_key='hrm.leave.approve')(),
            ]
        return [
            permissions.IsAuthenticated(),
            make_role_permission(*ALL_ROLES, permission_key='hrm.leave.apply')(),
        ]

    def get_serializer_class(self):
        if self.action == 'list':
            return LeaveRequestListSerializer
        if self.action == 'create':
            return LeaveRequestWriteSerializer
        return LeaveRequestSerializer

    def get_queryset(self):
        self.ensure_tenant()
        qs = LeaveRequest.objects.filter(tenant=self.tenant).select_related(
            'staff', 'leave_type', 'approved_by'
        )

        request = self.request
        is_manager = request.user.tenantmemberships.filter(
            tenant=self.tenant, role__in=MANAGER_ROLES
        ).exists()

        if is_manager:
            staff_id = request.query_params.get('staff_id')
            if staff_id:
                qs = qs.filter(staff_id=staff_id)
        else:
            qs = qs.filter(staff=request.user)

        status_filter = request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        return qs.order_by('-start_date')

    def create(self, request, *args, **kwargs):
        self.ensure_tenant()
        serializer = LeaveRequestWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        v = serializer.validated_data

        leave_request = leave_service.request_leave(
            tenant=self.tenant,
            staff=request.user,
            leave_type_id=v['leave_type_id'],
            start_date=v['start_date'],
            end_date=v['end_date'],
            reason=v.get('reason', ''),
            attachments=v.get('attachments', []),
        )
        out = LeaveRequestSerializer(leave_request, context=self.get_serializer_context())
        return ApiResponse.success(data=out.data, message='Leave request submitted.', status_code=201)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        self.ensure_tenant()
        leave_request = self.get_object()
        updated = leave_service.approve_leave(
            tenant=self.tenant,
            leave_request=leave_request,
            approved_by=request.user,
        )
        out = LeaveRequestSerializer(updated, context=self.get_serializer_context())
        return ApiResponse.success(data=out.data, message='Leave request approved.')

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        self.ensure_tenant()
        serializer = LeaveRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        leave_request = self.get_object()
        updated = leave_service.reject_leave(
            tenant=self.tenant,
            leave_request=leave_request,
            rejected_by=request.user,
            reason=serializer.validated_data.get('reason', ''),
        )
        out = LeaveRequestSerializer(updated, context=self.get_serializer_context())
        return ApiResponse.success(data=out.data, message='Leave request rejected.')

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        self.ensure_tenant()
        leave_request = self.get_object()
        # Staff can cancel own; admin/manager can cancel any
        is_manager = request.user.tenantmemberships.filter(
            tenant=self.tenant, role__in=MANAGER_ROLES
        ).exists()
        if not is_manager and leave_request.staff != request.user:
            return ApiResponse.error(
                message='You can only cancel your own leave requests.',
                status_code=403,
            )
        updated = leave_service.cancel_leave(
            tenant=self.tenant,
            leave_request=leave_request,
            cancelled_by=request.user,
        )
        out = LeaveRequestSerializer(updated, context=self.get_serializer_context())
        return ApiResponse.success(data=out.data, message='Leave request cancelled.')


# ─────────────────────────────────────────────────────────────────────────────
# Staff Profile
# ─────────────────────────────────────────────────────────────────────────────

class StaffProfileViewSet(NexusViewSet):
    """
    GET    /api/v1/hrm/profiles/        — staff directory (manager+)
    GET    /api/v1/hrm/profiles/{id}/   — retrieve own or any (manager+)
    PUT    /api/v1/hrm/profiles/{id}/   — update own (limited) or admin (all fields)
    PATCH  /api/v1/hrm/profiles/{id}/   — partial update
    """
    required_module = 'hrm'
    serializer_class = StaffProfileSerializer
    pagination_class = NexusPageNumberPagination
    http_method_names = ['get', 'head', 'options', 'put', 'patch']

    def get_permissions(self):
        return [
            permissions.IsAuthenticated(),
            make_role_permission(*ALL_ROLES, permission_key='hrm.view')(),
        ]

    def get_serializer_class(self):
        if self.action == 'list':
            return StaffProfileListSerializer
        if self.action in ('update', 'partial_update'):
            return StaffProfileWriteSerializer
        return StaffProfileSerializer

    def get_queryset(self):
        self.ensure_tenant()
        qs = StaffProfile.objects.filter(tenant=self.tenant).select_related(
            'membership__user', 'membership__department'
        )

        is_manager = self.request.user.tenantmemberships.filter(
            tenant=self.tenant, role__in=MANAGER_ROLES
        ).exists()

        if not is_manager:
            # Staff can only retrieve their own profile in the directory
            qs = qs.filter(membership__user=self.request.user)

        search = self.request.query_params.get('search', '').strip()
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(membership__user__email__icontains=search)
                | Q(designation__icontains=search)
            )

        return qs

    def update(self, request, *args, **kwargs):
        self.ensure_tenant()
        profile = self.get_object()

        is_admin = request.user.tenantmemberships.filter(
            tenant=self.tenant, role__in=ADMIN_ROLES
        ).exists()
        is_own = profile.membership.user == request.user

        if not is_admin and not is_own:
            return ApiResponse.error(
                message='You can only update your own profile.',
                status_code=403,
            )

        serializer = StaffProfileWriteSerializer(data=request.data, partial=kwargs.get('partial', False))
        serializer.is_valid(raise_exception=True)

        updated = profile_service.update_profile(profile, serializer.validated_data)
        out = StaffProfileSerializer(updated, context=self.get_serializer_context())
        return ApiResponse.success(data=out.data, message='Profile updated.')

    def partial_update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)
