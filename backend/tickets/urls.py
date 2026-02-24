from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    TicketViewSet, TicketTypeViewSet, TicketCommentViewSet,
    TicketTransferViewSet, TicketProductViewSet, TicketSLAViewSet,
    TicketAttachmentViewSet, TicketCategoryViewSet, TicketSubCategoryViewSet,
)

router = DefaultRouter()
router.register(r'types', TicketTypeViewSet, basename='ticket-type')
router.register(r'categories', TicketCategoryViewSet, basename='ticket-category')
router.register(r'subcategories', TicketSubCategoryViewSet, basename='ticket-subcategory')
router.register(r'sla', TicketSLAViewSet, basename='ticket-sla')
router.register(r'transfers', TicketTransferViewSet, basename='ticket-transfer')
router.register(r'products', TicketProductViewSet, basename='ticket-product')
router.register(r'attachments', TicketAttachmentViewSet, basename='ticket-attachment')
router.register(r'', TicketViewSet, basename='ticket')

urlpatterns = [
    path('', include(router.urls)),
    # Nested comments: /api/v1/tickets/<ticket_pk>/comments/
    path('<int:ticket_pk>/comments/', include([
        path('', TicketCommentViewSet.as_view({'get': 'list', 'post': 'create'})),
        path('<int:pk>/', TicketCommentViewSet.as_view({
            'get': 'retrieve', 'put': 'update', 'patch': 'partial_update', 'delete': 'destroy',
        })),
    ])),
    # Nested products: /api/v1/tickets/<ticket_pk>/products/
    path('<int:ticket_pk>/products/', include([
        path('', TicketProductViewSet.as_view({'get': 'list', 'post': 'create'})),
        path('<int:pk>/', TicketProductViewSet.as_view({
            'get': 'retrieve', 'delete': 'destroy',
        })),
    ])),
    # Nested attachments: /api/v1/tickets/<ticket_pk>/attachments/
    path('<int:ticket_pk>/attachments/', include([
        path('', TicketAttachmentViewSet.as_view({'get': 'list', 'post': 'create'})),
        path('<int:pk>/', TicketAttachmentViewSet.as_view({'get': 'retrieve', 'delete': 'destroy'})),
    ])),
]

