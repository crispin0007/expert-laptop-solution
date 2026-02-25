from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import PlanViewSet

router = DefaultRouter()
router.register(r'', PlanViewSet, basename='plan')

urlpatterns = [path('', include(router.urls))]
