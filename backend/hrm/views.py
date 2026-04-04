"""
hrm/views.py

Four viewsets covering Leave Types, Leave Balances, Leave Requests, and Staff Profiles.

All viewsets extend NexusViewSet (TenantMixin + JWT + modular access).
- tenant is NEVER accepted from request body — always request.tenant
- All queries scoped via self.tenant (set by TenantMixin.ensure_tenant)
- Business logic delegated to hrm/services/
"""
import logging

from django.db.models import Count
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.decorators import action
from rest_framework.views import APIView

from core.mixins import TenantMixin
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

from .models import (
    AttendancePolicy, AttendanceRecord, LeaveBalance, LeaveRequest, LeaveType,
    Shift, ShiftAssignment, StaffProfile,
)
from .serializers import (
    AttendanceAdminUpdateSerializer,
    AttendanceDailyReportQuerySerializer,
    AttendanceMonthlyReportQuerySerializer,
    AttendancePolicySerializer,
    AttendanceRecordListSerializer,
    AttendanceRecordSerializer,
    AttendanceSummaryQuerySerializer,
    ClockInSerializer,
    ClockOutSerializer,
    ManualMarkSerializer,
    LeaveBalanceSerializer,
    LeaveRejectSerializer,
    LeaveRequestListSerializer,
    LeaveRequestSerializer,
    LeaveRequestWriteSerializer,
    LeaveTypeMinimalSerializer,
    LeaveTypeSerializer,
    ShiftAssignmentSerializer,
    ShiftAssignmentWriteSerializer,
    ShiftListSerializer,
    ShiftSerializer,
    StaffProfileListSerializer,
    StaffProfileSerializer,
    StaffProfileWriteSerializer,
)
from . import services as hrm_services
from .services import attendance_service, leave_service, profile_service

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
        if self.action in ('list', 'retrieve'):
            # All roles can list/view leave types (needed for the Apply form)
            return [
                permissions.IsAuthenticated(),
                make_role_permission(*ALL_ROLES, permission_key='hrm.view')(),
            ]
        # create, update, delete, seed_defaults — admin/manager only
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

        # mine=true forces self-scoping regardless of role (used by "My Leaves" tab)
        if self.request.query_params.get('mine') == 'true':
            qs = qs.filter(staff=self.request.user)
        # Staff see only their own balances; managers/admins can filter by staff
        elif not self.request.user.memberships.filter(
            tenant=self.tenant, role__in=MANAGER_ROLES
        ).exists():
            qs = qs.filter(staff=self.request.user)
        else:
            staff_id = self.request.query_params.get('staff_id')
            if staff_id:
                qs = qs.filter(staff_id=staff_id)

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
        if not request.user.memberships.filter(
            tenant=self.tenant, role__in=MANAGER_ROLES
        ).exists():
            return ApiResponse.error(message='Permission denied.', status=403)

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
        # mine=true forces self-scoping regardless of role (used by "My Leaves" tab)
        if request.query_params.get('mine') == 'true':
            qs = qs.filter(staff=request.user)
        else:
            is_manager = request.user.memberships.filter(
                tenant=self.tenant, role__in=MANAGER_ROLES
            ).exists()
            if not is_manager:
                qs = qs.filter(staff=request.user)
            elif request.query_params.get('staff_id'):
                qs = qs.filter(staff_id=request.query_params['staff_id'])

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
        return ApiResponse.success(data=out.data, message='Leave request submitted.', status=201)

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
        is_manager = request.user.memberships.filter(
            tenant=self.tenant, role__in=MANAGER_ROLES
        ).exists()
        if not is_manager and leave_request.staff != request.user:
            return ApiResponse.error(
                message='You can only cancel your own leave requests.',
                status=403,
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

        is_manager = self.request.user.memberships.filter(
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

        is_admin = request.user.memberships.filter(
            tenant=self.tenant, role__in=ADMIN_ROLES
        ).exists()
        is_own = profile.membership.user == request.user

        if not is_admin and not is_own:
            return ApiResponse.error(
                message='You can only update your own profile.',
                status=403,
            )

        serializer = StaffProfileWriteSerializer(data=request.data, partial=kwargs.get('partial', False))
        serializer.is_valid(raise_exception=True)

        updated = profile_service.update_profile(profile, serializer.validated_data)
        out = StaffProfileSerializer(updated, context=self.get_serializer_context())
        return ApiResponse.success(data=out.data, message='Profile updated.')

    def partial_update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)


# ─────────────────────────────────────────────────────────────────────────────
# Attendance Policy  (singleton per tenant)
# ─────────────────────────────────────────────────────────────────────────────

class AttendancePolicyViewSet(NexusViewSet):
    """
    GET   /api/v1/hrm/attendance-policy/  — retrieve (or auto-create) the tenant policy
    PUT   /api/v1/hrm/attendance-policy/  — update the policy
    PATCH /api/v1/hrm/attendance-policy/  — partial update

    Registered via a manual path (not the DefaultRouter) so that GET and PUT
    both resolve to /attendance-policy/ without requiring a pk.
    The manual mapping: {'get': 'retrieve', 'put': 'update', 'patch': 'partial_update'}
    """
    required_module = 'hrm'
    serializer_class = AttendancePolicySerializer
    # Stub queryset required by NexusViewSet base — actual data is fetched by
    # get_or_create_policy() in each method.
    queryset = AttendancePolicy.objects.none()
    # No pagination — singleton object per tenant

    def get_permissions(self):
        if self.action in ('retrieve', 'list'):
            return [
                permissions.IsAuthenticated(),
                make_role_permission(*ALL_ROLES, permission_key='hrm.view')(),
            ]
        return [
            permissions.IsAuthenticated(),
            make_role_permission(*ADMIN_ROLES, permission_key='hrm.manage')(),
        ]

    def retrieve(self, request, *args, **kwargs):
        """GET /api/v1/hrm/attendance-policy/ — returns (or creates) the policy."""
        self.ensure_tenant()
        policy = attendance_service.get_or_create_policy(self.tenant)
        return ApiResponse.success(data=AttendancePolicySerializer(policy).data)

    def update(self, request, *args, **kwargs):
        """PUT /api/v1/hrm/attendance-policy/ — update the policy."""
        self.ensure_tenant()
        policy = attendance_service.get_or_create_policy(self.tenant)
        ser = AttendancePolicySerializer(policy, data=request.data, partial=kwargs.get('partial', False))
        ser.is_valid(raise_exception=True)
        for attr, val in ser.validated_data.items():
            setattr(policy, attr, val)
        policy.save()
        return ApiResponse.success(data=AttendancePolicySerializer(policy).data, message='Policy updated.')

    def partial_update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)


# ─────────────────────────────────────────────────────────────────────────────
# Attendance Record
# ─────────────────────────────────────────────────────────────────────────────

class AttendanceViewSet(NexusViewSet):
    """
    POST /api/v1/hrm/attendance/clock-in/        — staff clock in
    POST /api/v1/hrm/attendance/clock-out/       — staff clock out
    POST /api/v1/hrm/attendance/manual-mark/     — admin/manager override
    PATCH/PUT /api/v1/hrm/attendance/{id}/       — admin full record override
    GET  /api/v1/hrm/attendance/today/            — today's record for calling user
    GET  /api/v1/hrm/attendance/summary/          — summary counts by status
    GET  /api/v1/hrm/attendance/daily_report/     — daily summary for all staff
    GET  /api/v1/hrm/attendance/monthly_report/   — monthly report
    GET  /api/v1/hrm/attendance/                  — paginated list (admin/manager)
    """
    required_module = 'hrm'
    serializer_class = AttendanceRecordSerializer
    pagination_class = NexusPageNumberPagination

    def get_queryset(self):
        self.ensure_tenant()
        qs = AttendanceRecord.objects.filter(tenant=self.tenant).select_related(
            'staff', 'clocked_in_by', 'shift',
        )

        # Non-managers can only see their own records
        is_manager = self.request.user.memberships.filter(
            tenant=self.tenant, role__in=MANAGER_ROLES
        ).exists()
        if not is_manager:
            qs = qs.filter(staff=self.request.user)

        staff_id   = self.request.query_params.get('staff_id')
        date_from  = self.request.query_params.get('date_from')
        date_to    = self.request.query_params.get('date_to')
        status_f   = self.request.query_params.get('status')
        if staff_id and is_manager:
            qs = qs.filter(staff_id=staff_id)
        if date_from:
            qs = qs.filter(date__gte=date_from)
        if date_to:
            qs = qs.filter(date__lte=date_to)
        if status_f:
            qs = qs.filter(status=status_f)

        dept_id = self.request.query_params.get('dept_id')
        if dept_id and is_manager:
            qs = qs.filter(
                staff__memberships__tenant=self.tenant,
                staff__memberships__department_id=dept_id,
            )

        return qs.order_by('-date')

    def get_permissions(self):
        if self.action in ('clock_in', 'clock_out', 'today', 'summary'):
            return [
                permissions.IsAuthenticated(),
                make_role_permission(*ALL_ROLES, permission_key='hrm.attendance.view')(),
            ]
        if self.action in (
            'list', 'retrieve', 'daily_report', 'monthly_report',
        ):
            return [
                permissions.IsAuthenticated(),
                make_role_permission(*MANAGER_ROLES, permission_key='hrm.attendance.view')(),
            ]
        # manual_mark, update, partial_update, admin_override → admin only
        return [
            permissions.IsAuthenticated(),
            make_role_permission(*ADMIN_ROLES, permission_key='hrm.attendance.manage')(),
        ]

    def list(self, request, *args, **kwargs):
        """GET /api/v1/hrm/attendance/ — paginated list (admin/manager)."""
        self.ensure_tenant()
        qs  = self.get_queryset()
        page = self.paginate_queryset(qs)
        if page is not None:
            ser = AttendanceRecordListSerializer(page, many=True)
            return self.get_paginated_response(ser.data)
        return ApiResponse.success(data=AttendanceRecordListSerializer(qs, many=True).data)

    def update(self, request, *args, **kwargs):
        """PATCH/PUT /api/v1/hrm/attendance/{id}/ — admin full override of any record."""
        self.ensure_tenant()
        record = self.get_object()
        ser = AttendanceAdminUpdateSerializer(data=request.data, partial=kwargs.get('partial', False))
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        updated = attendance_service.admin_override_record(
            self.tenant,
            record.pk,
            admin_user=request.user,
            clock_in=d.get('clock_in'),
            clock_out=d.get('clock_out'),
            status=d.get('status'),
            note=d.get('note'),
            admin_remarks=d.get('admin_remarks'),
            break_minutes=d.get('break_minutes'),
            shift_id=d.get('shift_id'),
        )
        return ApiResponse.success(
            data=AttendanceRecordSerializer(updated, context=self.get_serializer_context()).data,
            message='Attendance record updated.',
        )

    def partial_update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)

    @action(detail=False, methods=['post'], url_path='clock_in')
    def clock_in(self, request):
        """POST .../clock-in/ — record clock-in for the calling user."""
        self.ensure_tenant()
        ser = ClockInSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d   = ser.validated_data
        record = attendance_service.clock_in(
            self.tenant, request.user,
            source=d.get('source', 'web'),
            lat=d.get('lat'),
            lng=d.get('lng'),
            note=d.get('note', ''),
        )
        return ApiResponse.success(
            data=AttendanceRecordSerializer(record).data,
            message='Clocked in.',
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=['post'], url_path='clock_out')
    def clock_out(self, request):
        """POST .../clock-out/ — record clock-out for the calling user."""
        self.ensure_tenant()
        ser = ClockOutSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        record = attendance_service.clock_out(
            self.tenant, request.user,
            source=d.get('source', 'web'),
            lat=d.get('lat'),
            lng=d.get('lng'),
            note=d.get('note', ''),
        )
        return ApiResponse.success(data=AttendanceRecordSerializer(record).data, message='Clocked out.')

    @action(detail=False, methods=['post'], url_path='manual_mark')
    def manual_mark(self, request):
        """POST .../manual-mark/ — admin/manager override."""
        self.ensure_tenant()
        ser = ManualMarkSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        from django.contrib.auth import get_user_model
        User    = get_user_model()
        try:
            staff = User.objects.get(pk=d['staff_id'])
        except User.DoesNotExist:
            return ApiResponse.error(message='Staff not found.', status=404)

        record = attendance_service.manual_mark(
            self.tenant, staff,
            target_date=d['date'],
            status=d['status'],
            marked_by=request.user,
            note=d.get('note', ''),
        )
        return ApiResponse.success(data=AttendanceRecordSerializer(record).data, message='Attendance recorded.')

    @action(detail=False, methods=['get'], url_path='today')
    def today(self, request):
        """GET .../today/ — today's attendance record for the calling user."""
        self.ensure_tenant()
        from django.utils import timezone
        today = timezone.localdate()
        try:
            record = AttendanceRecord.objects.get(
                tenant=self.tenant, staff=request.user, date=today,
            )
            data = AttendanceRecordSerializer(record).data
        except AttendanceRecord.DoesNotExist:
            data = None
        return ApiResponse.success(data=data)

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        """GET .../summary/?start_date=Y&end_date=Z[&staff_id=X]
        When staff_id is omitted, defaults to the requesting user.
        """
        self.ensure_tenant()
        qser = AttendanceSummaryQuerySerializer(data=request.query_params)
        qser.is_valid(raise_exception=True)
        d = qser.validated_data

        from django.contrib.auth import get_user_model
        User = get_user_model()
        staff_pk = d.get('staff_id') or request.user.pk
        try:
            staff = User.objects.get(pk=staff_pk)
        except User.DoesNotExist:
            return ApiResponse.error(message='Staff not found.', status=404)

        result = attendance_service.get_summary(
            self.tenant, staff,
            start_date=d['start_date'],
            end_date=d['end_date'],
        )
        return ApiResponse.success(data=result)

    @action(detail=False, methods=['get'], url_path='daily_report')
    def daily_report(self, request):
        """GET .../daily_report/?date=YYYY-MM-DD[&dept_id=X] — attendance summary for one day."""
        self.ensure_tenant()
        qser = AttendanceDailyReportQuerySerializer(data=request.query_params)
        qser.is_valid(raise_exception=True)
        d = qser.validated_data
        result = attendance_service.get_daily_report(
            self.tenant, d['date'], dept_id=d.get('dept_id'),
        )
        return ApiResponse.success(data=result)

    @action(detail=False, methods=['get'], url_path='monthly_report')
    def monthly_report(self, request):
        """GET .../monthly_report/?year=2024&month=1[&staff_id=X&dept_id=X] — monthly summary."""
        self.ensure_tenant()
        qser = AttendanceMonthlyReportQuerySerializer(data=request.query_params)
        qser.is_valid(raise_exception=True)
        d = qser.validated_data
        staff = None
        if d.get('staff_id'):
            from django.contrib.auth import get_user_model
            User = get_user_model()
            try:
                staff = User.objects.get(pk=d['staff_id'])
            except User.DoesNotExist:
                return ApiResponse.error(message='Staff not found.', status=404)
        result = attendance_service.get_monthly_report(
            self.tenant, d['year'], d['month'],
            staff=staff, dept_id=d.get('dept_id'),
        )
        return ApiResponse.success(data=result)


# ─────────────────────────────────────────────────────────────────────────────
# NOTE: AttendancePolicyViewSet URL is registered manually in urls.py (not via
# the router) so that GET and PUT both work on /attendance-policy/ without a pk.


# ─────────────────────────────────────────────────────────────────────────────
# HRM Dashboard  (unified stats for the HRM landing page)
# ─────────────────────────────────────────────────────────────────────────────

class HrmDashboardView(TenantMixin, APIView):
    """GET /api/v1/hrm/dashboard/

    Returns dashboard stats for the HRM section.
    - Managers/admins: org-wide headcounts, today's attendance breakdown,
      pending leave counts, and the 10 most recent leave requests.
    - All users: own today record, own leave balances, own recent requests.
    """
    required_module = 'hrm'

    def get_permissions(self):
        return [
            permissions.IsAuthenticated(),
            make_role_permission(*ALL_ROLES, permission_key='hrm.view')(),
        ]

    def get(self, request):
        self.ensure_tenant()
        today  = timezone.localdate()
        tenant = self.tenant
        user   = request.user

        is_manager = user.memberships.filter(
            tenant=tenant, role__in=MANAGER_ROLES
        ).exists()

        result = {'is_manager': is_manager}

        # ── Manager-only aggregate data ───────────────────────────────────────
        if is_manager:
            from accounts.models import TenantMembership
            total_staff = TenantMembership.objects.filter(
                tenant=tenant, is_active=True,
            ).count()

            today_rows = (
                AttendanceRecord.objects
                .filter(tenant=tenant, date=today)
                .values('status')
                .annotate(n=Count('id'))
            )
            att = {row['status']: row['n'] for row in today_rows}
            recorded = sum(att.values())

            pending_count = LeaveRequest.objects.filter(
                tenant=tenant, status='pending',
            ).count()

            on_leave_today = LeaveRequest.objects.filter(
                tenant=tenant,
                status='approved',
                start_date__lte=today,
                end_date__gte=today,
            ).count()

            recent_qs = (
                LeaveRequest.objects
                .filter(tenant=tenant)
                .select_related('staff', 'leave_type', 'approved_by')
                .order_by('-created_at')[:10]
            )

            result.update({
                'total_staff': total_staff,
                'today_attendance': {
                    'present':      att.get('present', 0),
                    'absent':       att.get('absent', 0),
                    'late':         att.get('late', 0),
                    'half_day':     att.get('half_day', 0),
                    'on_leave':     att.get('on_leave', 0) + on_leave_today,
                    'wfh':          att.get('wfh', 0),
                    'holiday':      att.get('holiday', 0),
                    'not_recorded': max(0, total_staff - recorded),
                },
                'pending_leave_requests': pending_count,
                'on_leave_today':         on_leave_today,
                'recent_requests': LeaveRequestListSerializer(
                    recent_qs, many=True, context={'request': request},
                ).data,
            })

        # ── Personal data — always included ───────────────────────────────────
        try:
            my_rec    = AttendanceRecord.objects.get(tenant=tenant, staff=user, date=today)
            my_today  = AttendanceRecordSerializer(my_rec, context={'request': request}).data
        except AttendanceRecord.DoesNotExist:
            my_today = None

        # Approximate BS year (AD month < 4 → still in previous BS year)
        bs_year = today.year + (56 if today.month < 4 else 57)

        my_bals = (
            LeaveBalance.objects
            .filter(tenant=tenant, staff=user, year=bs_year)
            .select_related('leave_type')
            .order_by('leave_type__name')
        )
        my_reqs = (
            LeaveRequest.objects
            .filter(tenant=tenant, staff=user)
            .select_related('leave_type', 'approved_by')
            .order_by('-created_at')[:5]
        )

        result.update({
            'my_today':          my_today,
            'my_balances':       LeaveBalanceSerializer(my_bals, many=True).data,
            'my_recent_requests': LeaveRequestListSerializer(
                my_reqs, many=True, context={'request': request},
            ).data,
            'my_pending_count': LeaveRequest.objects.filter(
                tenant=tenant, staff=user, status='pending',
            ).count(),
        })

        return ApiResponse.success(data=result)


# ─────────────────────────────────────────────────────────────────────────────
# Shift management
# ─────────────────────────────────────────────────────────────────────────────

class ShiftViewSet(NexusViewSet):
    """CRUD for work Shifts.

    GET    /hrm/shifts/          — list (all roles with hrm.view)
    POST   /hrm/shifts/          — create (admin only)
    GET    /hrm/shifts/{id}/     — retrieve
    PATCH  /hrm/shifts/{id}/     — partial update (admin only)
    DELETE /hrm/shifts/{id}/     — soft delete (admin only)
    """

    required_module = 'hrm'
    serializer_class = ShiftSerializer
    pagination_class = NexusPageNumberPagination

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [
                permissions.IsAuthenticated(),
                make_role_permission(*ALL_ROLES, permission_key='hrm.view')(),
            ]
        return [
            permissions.IsAuthenticated(),
            make_role_permission(*ADMIN_ROLES, permission_key='hrm.manage')(),
        ]

    def get_queryset(self):
        self.ensure_tenant()
        qs = Shift.objects.filter(tenant=self.tenant)
        if self.request.query_params.get('active') == 'true':
            qs = qs.filter(is_active=True)
        return qs.order_by('name')

    def get_serializer_class(self):
        if self.action == 'list':
            return ShiftListSerializer
        return ShiftSerializer

    def perform_create(self, serializer):
        self.ensure_tenant()
        if serializer.validated_data.get('is_default'):
            Shift.objects.filter(tenant=self.tenant, is_default=True).update(is_default=False)
        serializer.save(tenant=self.tenant)

    def perform_update(self, serializer):
        if serializer.validated_data.get('is_default'):
            Shift.objects.filter(
                tenant=self.tenant, is_default=True,
            ).exclude(pk=serializer.instance.pk).update(is_default=False)
        serializer.save()


# ─────────────────────────────────────────────────────────────────────────────
# Shift assignment — link a staff member to a shift for a date range
# ─────────────────────────────────────────────────────────────────────────────

class ShiftAssignmentViewSet(NexusViewSet):
    """Manage per-staff shift assignments.

    GET    /hrm/shift-assignments/          — list (manager+)
    POST   /hrm/shift-assignments/          — create (manager+)
    DELETE /hrm/shift-assignments/{id}/     — remove (manager+)
    """

    required_module = 'hrm'
    pagination_class = NexusPageNumberPagination

    def get_permissions(self):
        return [
            permissions.IsAuthenticated(),
            make_role_permission(*MANAGER_ROLES, permission_key='hrm.manage')(),
        ]

    def get_queryset(self):
        self.ensure_tenant()
        qs = ShiftAssignment.objects.filter(
            tenant=self.tenant,
        ).select_related('staff', 'shift')
        staff_id = self.request.query_params.get('staff_id')
        if staff_id:
            qs = qs.filter(staff_id=staff_id)
        return qs.order_by('-effective_from')

    def get_serializer_class(self):
        if self.action == 'create':
            return ShiftAssignmentWriteSerializer
        return ShiftAssignmentSerializer

    def create(self, request, *args, **kwargs):
        self.ensure_tenant()
        ser = ShiftAssignmentWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        from django.contrib.auth import get_user_model
        User = get_user_model()
        try:
            staff = User.objects.get(pk=d['staff_id'])
        except User.DoesNotExist:
            return ApiResponse.error(message='Staff not found.', status=404)
        try:
            shift = Shift.objects.get(tenant=self.tenant, pk=d['shift_id'])
        except Shift.DoesNotExist:
            return ApiResponse.error(message='Shift not found.', status=404)

        assignment = ShiftAssignment.objects.create(
            tenant=self.tenant,
            staff=staff,
            shift=shift,
            effective_from=d['effective_from'],
            effective_to=d.get('effective_to'),
        )
        return ApiResponse.success(
            data=ShiftAssignmentSerializer(assignment).data,
            message='Shift assignment created.',
            status=status.HTTP_201_CREATED,
        )
