"""URL conf for /api/v1/staff/availability/ — availability endpoint."""
from django.urls import path
from .views import StaffAvailabilityView

urlpatterns = [
    path('', StaffAvailabilityView.as_view(), name='staff-availability'),
]
