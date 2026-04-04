from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    UserViewSet, TenantMembershipViewSet, MeView, LogoutView,
    StaffAvailabilityView, StaffViewSet,
    TenantTokenObtainPairView, TenantTokenRefreshView,
    TwoFASetupView, TwoFAConfirmSetupView, TwoFAVerifyView,
    TwoFADisableView, TwoFABackupCodesView, TwoFARegenerateBackupCodesView,
    PasswordResetRequestView, PasswordResetConfirmView,
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

    # Two-Factor Authentication
    path('2fa/setup/',                         TwoFASetupView.as_view(),               name='2fa_setup'),
    path('2fa/confirm-setup/',                 TwoFAConfirmSetupView.as_view(),         name='2fa_confirm_setup'),
    path('2fa/verify/',                        TwoFAVerifyView.as_view(),               name='2fa_verify'),
    path('2fa/disable/',                       TwoFADisableView.as_view(),              name='2fa_disable'),
    path('2fa/backup-codes/',                  TwoFABackupCodesView.as_view(),          name='2fa_backup_codes'),
    path('2fa/backup-codes/regenerate/',       TwoFARegenerateBackupCodesView.as_view(),name='2fa_backup_codes_regenerate'),

    # Self-service password reset (unauthenticated)
    path('password-reset/request/',  PasswordResetRequestView.as_view(),  name='password_reset_request'),
    path('password-reset/confirm/',  PasswordResetConfirmView.as_view(),  name='password_reset_confirm'),

    path('', include(router.urls)),
]
