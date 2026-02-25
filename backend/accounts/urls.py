from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    UserViewSet, TenantMembershipViewSet, MeView, LogoutView,
    StaffAvailabilityView, StaffViewSet,
    TenantTokenObtainPairView, TenantTokenRefreshView,
)

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')
router.register(r'memberships', TenantMembershipViewSet, basename='membership')

staff_router = DefaultRouter()
staff_router.register(r'', StaffViewSet, basename='staff')

urlpatterns = [
    # JWT auth — tenant-aware login (see TenantTokenObtainPairView)
    path('token/', TenantTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TenantTokenRefreshView.as_view(), name='token_refresh'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('me/', MeView.as_view(), name='me'),

    path('', include(router.urls)),
]
