from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import ModuleViewSet

router = DefaultRouter()
router.register(r'', ModuleViewSet, basename='module')

urlpatterns = [path('', include(router.urls))]
