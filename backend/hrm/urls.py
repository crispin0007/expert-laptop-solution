from rest_framework.routers import DefaultRouter

from .views import LeaveBalanceViewSet, LeaveRequestViewSet, LeaveTypeViewSet, StaffProfileViewSet

router = DefaultRouter()
router.register(r'leave-types', LeaveTypeViewSet, basename='hrm-leave-type')
router.register(r'leave-balances', LeaveBalanceViewSet, basename='hrm-leave-balance')
router.register(r'leave-requests', LeaveRequestViewSet, basename='hrm-leave-request')
router.register(r'profiles', StaffProfileViewSet, basename='hrm-staff-profile')

urlpatterns = router.urls
