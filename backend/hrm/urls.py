from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AttendancePolicyViewSet,
    AttendanceViewSet,
    HrmDashboardView,
    LeaveBalanceViewSet,
    LeaveRequestViewSet,
    LeaveTypeViewSet,
    ShiftAssignmentViewSet,
    ShiftViewSet,
    StaffProfileViewSet,
)

router = DefaultRouter()
router.register(r'leave-types', LeaveTypeViewSet, basename='hrm-leave-type')
router.register(r'leave-balances', LeaveBalanceViewSet, basename='hrm-leave-balance')
router.register(r'leave-requests', LeaveRequestViewSet, basename='hrm-leave-request')
router.register(r'profiles', StaffProfileViewSet, basename='hrm-staff-profile')
router.register(r'attendance', AttendanceViewSet, basename='hrm-attendance')
router.register(r'shifts', ShiftViewSet, basename='hrm-shift')
router.register(r'shift-assignments', ShiftAssignmentViewSet, basename='hrm-shift-assignment')

# AttendancePolicyViewSet is a singleton resource — GET and PUT both hit the
# same URL without a pk, so we use a manual path instead of the router.
_policy_view = AttendancePolicyViewSet.as_view({
    'get':   'retrieve',
    'put':   'update',
    'patch': 'partial_update',
})

urlpatterns = router.urls + [
    path('attendance-policy/', _policy_view, name='hrm-attendance-policy'),
    path('dashboard/',         HrmDashboardView.as_view(), name='hrm-dashboard'),
]
