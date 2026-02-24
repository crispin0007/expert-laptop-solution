from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import TenantViewSet, TenantSettingsView

router = DefaultRouter()
router.register(r'', TenantViewSet, basename='tenant')

urlpatterns = [
    path('', include(router.urls)),
]
