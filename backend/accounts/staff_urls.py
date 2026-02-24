"""URL conf for /api/v1/staff/ — staff CRUD + invite."""
from rest_framework.routers import DefaultRouter
from .views import StaffViewSet

router = DefaultRouter()
router.register(r'', StaffViewSet, basename='staff')
urlpatterns = router.urls
