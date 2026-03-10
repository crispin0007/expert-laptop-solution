from django.contrib import admin
from django.contrib.admin import AdminSite
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from core import views as core_views
from core.views import DashboardStatsView
from tenants.views import TenantSettingsView, verify_domain, tenant_resolve


class MainDomainOnlyAdminSite(AdminSite):
    """
    Restricts Django admin to two conditions simultaneously:
      1. User must be a Django superuser (is_superuser=True).
      2. Request must come from the main domain (request.tenant is None).

    Accessing /admin/ from a tenant subdomain is blocked at the middleware level
    (returns 404 before Django routing even runs). This class is a second line
    of defence in case the middleware is bypassed (e.g. direct WSGI call).
    """

    def has_permission(self, request):
        # Must be an active superuser
        if not (request.user and request.user.is_active and request.user.is_superuser):
            return False
        # Must be on the main domain — block even if a superuser somehow hits
        # this from a tenant domain (e.g. through a misconfigured proxy).
        if getattr(request, 'tenant', None) is not None:
            return False
        return True


admin.site.__class__ = MainDomainOnlyAdminSite

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/', include('rest_framework.urls')),
    path('health/', core_views.health_check),
    path('api/v1/dashboard/stats/', DashboardStatsView.as_view(), name='dashboard-stats'),
    # Caddy on-demand TLS: checks if a domain should receive a certificate.
    # This endpoint is only reachable from the internal Docker network (port 8000
    # is not exposed publicly) so no auth is required.
    path('internal/verify-domain/', verify_domain, name='verify-domain'),

    # Sprint 1
    path('api/v1/accounts/', include('accounts.urls')),
    # Explicit registration BEFORE the tenants include so this path is matched
    # first — prevents TenantViewSet's ^(?P<pk>[^/.]+)/$ detail pattern from
    # capturing 'resolve' as a pk and returning 401 instead of public data.
    path('api/v1/tenants/resolve/', tenant_resolve, name='tenant-resolve-public'),
    path('api/v1/tenants/', include('tenants.urls')),

    # Sprint 2
    path('api/v1/staff/availability/', include('accounts.availability_urls')),
    path('api/v1/staff/', include('accounts.staff_urls')),
    path('api/v1/customers/', include('customers.urls')),
    path('api/v1/departments/', include('departments.urls')),
    path('api/v1/roles/', include('roles.urls')),

    # Sprint 3
    path('api/v1/tickets/', include('tickets.urls')),

    # Sprint 4
    path('api/v1/inventory/', include('inventory.urls')),
    path('api/v1/accounting/', include('accounting.urls')),

    # Tenant settings (coin rate, VAT, currency) — accessible by tenant admin/manager
    path('api/v1/settings/', TenantSettingsView.as_view(), name='tenant-settings'),

    # Subscription plans + modules (super admin only)
    path('api/v1/plans/', include('tenants.plan_urls')),
    path('api/v1/modules/', include('tenants.module_urls')),

    # Sprint 5
    path('api/v1/projects/', include('projects.urls')),
    path('api/v1/notifications/', include('notifications.urls')),

    # CMS & Website Builder
    path('api/v1/cms/', include('cms.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

