from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import TenantViewSet, TenantSettingsView, PlanViewSet, ModuleViewSet, tenant_public_info

# Tenant CRUD + nested member/module actions
tenant_router = DefaultRouter()
tenant_router.register(r'', TenantViewSet, basename='tenant')

# Plan + Module management (registered separately in config/urls.py at /api/v1/plans/, /api/v1/modules/)
plan_router = DefaultRouter()
plan_router.register(r'', PlanViewSet, basename='plan')

module_router = DefaultRouter()
module_router.register(r'', ModuleViewSet, basename='module')

urlpatterns = [
    path('public-info/', tenant_public_info, name='tenant-public-info'),
    path('', include(tenant_router.urls)),
]

plan_urlpatterns = [
    path('', include(plan_router.urls)),
]

module_urlpatterns = [
    path('', include(module_router.urls)),
]
