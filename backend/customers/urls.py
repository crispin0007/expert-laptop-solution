from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import CustomerViewSet, CustomerContactViewSet

router = DefaultRouter()
router.register(r'', CustomerViewSet, basename='customer')

urlpatterns = [
    path('', include(router.urls)),
    path('<int:customer_pk>/contacts/', CustomerContactViewSet.as_view({
        'get': 'list', 'post': 'create'
    })),
    path('<int:customer_pk>/contacts/<int:pk>/', CustomerContactViewSet.as_view({
        'get': 'retrieve', 'put': 'update', 'patch': 'partial_update', 'delete': 'destroy'
    })),
]
