from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from core import views as core_views
from tenants.views import TenantSettingsView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/', include('rest_framework.urls')),
    path('health/', core_views.health_check),

    # Sprint 1
    path('api/v1/accounts/', include('accounts.urls')),
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

    # Sprint 5
    path('api/v1/projects/', include('projects.urls')),
    path('api/v1/notifications/', include('notifications.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

