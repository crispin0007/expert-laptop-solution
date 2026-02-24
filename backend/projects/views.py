from django.utils import timezone
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from core.mixins import TenantMixin
from .models import Project, ProjectMilestone, ProjectTask, ProjectProduct, ProjectAttachment
from .serializers import (
    ProjectSerializer, ProjectMilestoneSerializer,
    ProjectTaskSerializer, ProjectProductSerializer, ProjectAttachmentSerializer,
)


class ProjectViewSet(TenantMixin, viewsets.ModelViewSet):
    queryset = Project.objects.filter(is_deleted=False).select_related('customer', 'manager')
    serializer_class = ProjectSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class ProjectMilestoneViewSet(TenantMixin, viewsets.ModelViewSet):
    queryset = ProjectMilestone.objects.select_related('project')
    serializer_class = ProjectMilestoneSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        project_pk = self.kwargs.get('project_pk')
        if project_pk:
            qs = qs.filter(project_id=project_pk)
        return qs

    def perform_create(self, serializer):
        project_pk = self.kwargs.get('project_pk')
        project = Project.objects.get(pk=project_pk, tenant=self.request.tenant)
        serializer.save(created_by=self.request.user, project=project)

    @action(detail=True, methods=['post'], url_path='toggle')
    def toggle_complete(self, request, project_pk=None, pk=None):
        """POST /projects/{id}/milestones/{pk}/toggle/  → flip is_completed."""
        milestone = self.get_object()
        milestone.is_completed = not milestone.is_completed
        milestone.completed_at = timezone.now() if milestone.is_completed else None
        milestone.save(update_fields=['is_completed', 'completed_at'])
        return Response(ProjectMilestoneSerializer(milestone).data)


class ProjectTaskViewSet(TenantMixin, viewsets.ModelViewSet):
    queryset = ProjectTask.objects.select_related('project', 'milestone', 'assigned_to')
    serializer_class = ProjectTaskSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        project_pk = self.kwargs.get('project_pk')
        if project_pk:
            qs = qs.filter(project_id=project_pk)
        return qs

    def perform_create(self, serializer):
        project_pk = self.kwargs.get('project_pk')
        project = Project.objects.get(pk=project_pk, tenant=self.request.tenant)
        task = serializer.save(created_by=self.request.user, project=project)
        # Notify assignee (async — import inline to avoid circular)
        if task.assigned_to_id:
            try:
                from notifications.service import notify_task_assigned
                notify_task_assigned(task)
            except Exception:
                pass

    @action(detail=True, methods=['patch'], url_path='status')
    def change_status(self, request, project_pk=None, pk=None):
        """PATCH /projects/{id}/tasks/{pk}/status/  body: {status, actual_hours?}"""
        task = self.get_object()
        new_status = request.data.get('status')
        valid = [s for s, _ in ProjectTask.STATUS_CHOICES]
        if new_status not in valid:
            return Response({'detail': f'Invalid status. Choose from {valid}'},
                            status=status.HTTP_400_BAD_REQUEST)

        old_status = task.status
        task.status = new_status
        if 'actual_hours' in request.data:
            task.actual_hours = request.data['actual_hours']
        if new_status == ProjectTask.STATUS_DONE and old_status != ProjectTask.STATUS_DONE:
            task.completed_at = timezone.now()
            # Fire coin + stock signals via post_save (handled in signals.py)
        elif new_status != ProjectTask.STATUS_DONE:
            task.completed_at = None
        task.save()
        return Response(ProjectTaskSerializer(task).data)


class ProjectProductViewSet(TenantMixin, viewsets.ModelViewSet):
    queryset = ProjectProduct.objects.select_related('product', 'project')
    serializer_class = ProjectProductSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        project_pk = self.kwargs.get('project_pk')
        if project_pk:
            qs = qs.filter(project_id=project_pk)
        return qs

    def perform_create(self, serializer):
        project_pk = self.kwargs.get('project_pk')
        project = Project.objects.get(pk=project_pk, tenant=self.request.tenant)
        serializer.save(created_by=self.request.user, project=project)


class ProjectAttachmentViewSet(TenantMixin, viewsets.ModelViewSet):
    """File attachments for a project."""
    serializer_class = ProjectAttachmentSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def get_queryset(self):
        self.ensure_tenant()
        qs = ProjectAttachment.objects.filter(tenant=self.tenant).select_related('uploaded_by', 'project')
        project_pk = self.kwargs.get('project_pk')
        if project_pk:
            qs = qs.filter(project_id=project_pk)
        return qs

    def perform_create(self, serializer):
        self.ensure_tenant()
        project_pk = self.kwargs.get('project_pk')
        project = Project.objects.get(pk=project_pk, tenant=self.tenant)
        serializer.save(tenant=self.tenant, uploaded_by=self.request.user, created_by=self.request.user, project=project)
