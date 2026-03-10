from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import ProjectViewSet, ProjectMilestoneViewSet, ProjectTaskViewSet, ProjectProductViewSet, ProjectAttachmentViewSet, ProjectProductRequestViewSet, ProjectMemberScheduleViewSet

router = DefaultRouter()
router.register(r'', ProjectViewSet, basename='project')

urlpatterns = [
    path('', include(router.urls)),
    # Nested: /api/v1/projects/<project_pk>/milestones/
    path('<int:project_pk>/milestones/', include([
        path('', ProjectMilestoneViewSet.as_view({'get': 'list', 'post': 'create'})),
        path('<int:pk>/', ProjectMilestoneViewSet.as_view({
            'get': 'retrieve', 'put': 'update', 'patch': 'partial_update', 'delete': 'destroy',
        })),
        path('<int:pk>/toggle/', ProjectMilestoneViewSet.as_view({'post': 'toggle_complete'})),
    ])),
    # Nested: /api/v1/projects/<project_pk>/tasks/
    path('<int:project_pk>/tasks/', include([
        path('', ProjectTaskViewSet.as_view({'get': 'list', 'post': 'create'})),
        path('<int:pk>/', ProjectTaskViewSet.as_view({
            'get': 'retrieve', 'put': 'update', 'patch': 'partial_update', 'delete': 'destroy',
        })),
        path('<int:pk>/status/', ProjectTaskViewSet.as_view({'patch': 'change_status'})),
    ])),
    # Nested: /api/v1/projects/<project_pk>/project-products/
    path('<int:project_pk>/project-products/', include([
        path('', ProjectProductViewSet.as_view({'get': 'list', 'post': 'create'})),
        path('<int:pk>/', ProjectProductViewSet.as_view({
            'get': 'retrieve', 'put': 'update', 'patch': 'partial_update', 'delete': 'destroy',
        })),
    ])),
    # Nested: /api/v1/projects/<project_pk>/product-requests/
    path('<int:project_pk>/product-requests/', include([
        path('', ProjectProductRequestViewSet.as_view({'get': 'list', 'post': 'create'})),
        path('<int:pk>/', ProjectProductRequestViewSet.as_view({
            'get': 'retrieve', 'delete': 'destroy',
        })),
        path('<int:pk>/approve/', ProjectProductRequestViewSet.as_view({'post': 'approve'})),
        path('<int:pk>/reject/', ProjectProductRequestViewSet.as_view({'post': 'reject'})),
    ])),
    # Nested: /api/v1/projects/<project_pk>/attachments/
    path('<int:project_pk>/attachments/', include([
        path('', ProjectAttachmentViewSet.as_view({'get': 'list', 'post': 'create'})),
        path('<int:pk>/', ProjectAttachmentViewSet.as_view({'get': 'retrieve', 'delete': 'destroy'})),
    ])),
    # Nested: /api/v1/projects/<project_pk>/schedules/
    path('<int:project_pk>/schedules/', include([
        path('', ProjectMemberScheduleViewSet.as_view({'get': 'list', 'post': 'create'})),
        path('<int:pk>/', ProjectMemberScheduleViewSet.as_view({
            'get': 'retrieve', 'patch': 'partial_update', 'delete': 'destroy',
        })),
        path('<int:pk>/mark-present/', ProjectMemberScheduleViewSet.as_view({'post': 'mark_present'})),
    ])),
]
