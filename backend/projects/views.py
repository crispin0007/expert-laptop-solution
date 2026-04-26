from django.utils import timezone
from django.db.models import Count, Q
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from core.mixins import TenantMixin
from core.views import NexusViewSet
from core.pagination import NexusPageNumberPagination
from core.response import ApiResponse
from core.exceptions import ConflictError
from core.exceptions import ValidationError as AppValidationError
from core.permissions import make_role_permission, STAFF_ROLES, MANAGER_ROLES, ALL_ROLES
from .models import Project, ProjectMilestone, ProjectTask, ProjectProduct, ProjectAttachment, ProjectProductRequest, ProjectMemberSchedule
from .serializers import (
    ProjectSerializer, ProjectListSerializer, ProjectMilestoneSerializer,
    ProjectTaskSerializer, ProjectProductSerializer, ProjectAttachmentSerializer,
    ProjectProductRequestSerializer, ProjectMemberScheduleSerializer,
)

# Shared helper to avoid repeating the same three-liner
_READ_PERMS = lambda: [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES, permission_key='projects.view')()]
_STAFF_PERMS = lambda: [permissions.IsAuthenticated(), make_role_permission(*STAFF_ROLES, permission_key='projects.update')()]
_MANAGER_PERMS = lambda: [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES, permission_key='projects.delete')()]


class ProjectViewSet(NexusViewSet):
    """Project CRUD: read=all, write=staff+, delete=manager+."""

    required_module = 'projects'
    queryset = Project.objects.filter(is_deleted=False).select_related('customer', 'manager')
    serializer_class = ProjectSerializer
    pagination_class = NexusPageNumberPagination

    def get_serializer_class(self):
        if self.action == 'list':
            return ProjectListSerializer
        return ProjectSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return _READ_PERMS()
        if self.action == 'destroy':
            return _MANAGER_PERMS()
        return _STAFF_PERMS()

    def create(self, request, *args, **kwargs):
        self.ensure_tenant()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        from projects import services as project_service
        project = project_service.create_project(
            tenant=self.tenant,
            created_by=request.user,
            validated_data=serializer.validated_data,
        )
        out = self.get_serializer(project)
        return ApiResponse.created(data=out.data)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        from projects import services as project_service
        project = project_service.update_project(
            instance=instance,
            tenant=self.tenant,
            validated_data=serializer.validated_data,
        )
        out = self.get_serializer(project)
        return ApiResponse.success(data=out.data)

    def partial_update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)

    def get_queryset(self):
        self.ensure_tenant()
        qs = Project.objects.filter(
            tenant=self.tenant, is_deleted=False
        ).select_related('customer', 'manager').prefetch_related('team_members', 'milestones').annotate(
            tasks_count=Count('tasks', distinct=True),
            done_tasks_count=Count(
                'tasks',
                filter=Q(tasks__status=ProjectTask.STATUS_DONE),
                distinct=True,
            ),
        )
        if fy_raw := self.request.query_params.get('fiscal_year'):
            try:
                from core.nepali_date import fiscal_year_date_range, FiscalYear
                fy = FiscalYear(bs_year=int(fy_raw))
                start_ad, end_ad = fiscal_year_date_range(fy)
                qs = qs.filter(created_at__date__gte=start_ad, created_at__date__lte=end_ad)
            except (ValueError, KeyError):
                pass
        # ?assigned=me — projects where the current user is manager or team member
        if self.request.query_params.get('assigned') == 'me':
            qs = qs.filter(
                Q(manager=self.request.user) | Q(team_members=self.request.user)
            ).distinct()
        # Allow filtering to only the projects managed by a specific user
        if manager_id := self.request.query_params.get('manager'):
            try:
                qs = qs.filter(manager_id=int(manager_id))
            except (ValueError, TypeError):
                pass
        if status_param := self.request.query_params.get('status'):
            qs = qs.filter(status=status_param)
        return qs


class ProjectMilestoneViewSet(NexusViewSet):
    required_module = 'projects'
    queryset = ProjectMilestone.objects.select_related('project')
    serializer_class = ProjectMilestoneSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return _READ_PERMS()
        return _STAFF_PERMS()

    def get_queryset(self):
        qs = super().get_queryset()
        project_pk = self.kwargs.get('project_pk')
        if project_pk:
            qs = qs.filter(project_id=project_pk)
        return qs

    def create(self, request, *args, **kwargs):
        from django.shortcuts import get_object_or_404
        project_pk = self.kwargs.get('project_pk')
        project    = get_object_or_404(Project, pk=project_pk, tenant=self.tenant)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save(
            tenant=self.tenant, created_by=self.request.user, project=project
        )
        return ApiResponse.created(data=self.get_serializer(instance).data)

    @action(detail=True, methods=['post'], url_path='toggle')
    def toggle_complete(self, request, project_pk=None, pk=None):
        """POST /projects/{id}/milestones/{pk}/toggle/  → flip is_completed."""
        milestone = self.get_object()
        milestone.is_completed = not milestone.is_completed
        milestone.completed_at = timezone.now() if milestone.is_completed else None
        milestone.save(update_fields=['is_completed', 'completed_at', 'updated_at'])
        return ApiResponse.success(data=ProjectMilestoneSerializer(milestone).data)


class ProjectTaskViewSet(NexusViewSet):
    required_module = 'projects'
    queryset = ProjectTask.objects.select_related('project', 'milestone', 'assigned_to')
    serializer_class = ProjectTaskSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return _READ_PERMS()
        return _STAFF_PERMS()

    def get_queryset(self):
        qs = super().get_queryset()
        project_pk = self.kwargs.get('project_pk')
        if project_pk:
            qs = qs.filter(project_id=project_pk)
        return qs

    def create(self, request, *args, **kwargs):
        from django.shortcuts import get_object_or_404
        project_pk = self.kwargs.get('project_pk')
        project    = get_object_or_404(Project, pk=project_pk, tenant=self.tenant)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        from projects import services as project_service
        task = project_service.create_task(
            project=project,
            tenant=self.tenant,
            created_by=self.request.user,
            validated_data=serializer.validated_data,
        )
        return ApiResponse.created(data=self.get_serializer(task).data)

    @action(detail=True, methods=['patch'], url_path='status')
    def change_status(self, request, project_pk=None, pk=None):
        """PATCH /projects/{id}/tasks/{pk}/status/  body: {status, actual_hours?}"""
        task       = self.get_object()
        new_status = request.data.get('status')
        from projects import services as project_service
        try:
            task = project_service.update_task_status(
                task=task,
                new_status=new_status,
                actual_hours=request.data.get('actual_hours'),
            )
        except ValueError as exc:
            raise AppValidationError(str(exc))
        return ApiResponse.success(data=ProjectTaskSerializer(task).data)


class ProjectProductViewSet(NexusViewSet):
    required_module = 'projects'
    queryset = ProjectProduct.objects.select_related('product', 'project')
    serializer_class = ProjectProductSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return _READ_PERMS()
        return _STAFF_PERMS()

    def get_queryset(self):
        qs = super().get_queryset()
        project_pk = self.kwargs.get('project_pk')
        if project_pk:
            qs = qs.filter(project_id=project_pk)
        return qs

    def create(self, request, *args, **kwargs):
        """
        Upsert: if the product is already linked to this project, increment
        quantity_planned instead of raising a duplicate-key error.

        Race-safe: uses select_for_update() inside an atomic block so concurrent
        requests from multiple gunicorn workers cannot race to INSERT the same row
        and hit the unique_together('project', 'product') constraint → 500.
        Uses get_object_or_404 so an invalid project_pk returns 404, not 500.
        """
        from django.db import IntegrityError, transaction
        from django.shortcuts import get_object_or_404

        project_pk = self.kwargs.get('project_pk')
        project = get_object_or_404(Project, pk=project_pk, tenant=self.tenant)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        product = serializer.validated_data.get('product')
        manual_name = serializer.validated_data.get('manual_name', '').strip()
        qty = serializer.validated_data.get('quantity_planned', 1)

        with transaction.atomic():
            if product:
                existing = (
                    ProjectProduct.objects
                    .select_for_update()
                    .filter(tenant=self.tenant, project=project, product=product)
                    .first()
                )
            else:
                existing = (
                    ProjectProduct.objects
                    .select_for_update()
                    .filter(
                        tenant=self.tenant,
                        project=project,
                        product__isnull=True,
                        manual_name=manual_name,
                    )
                    .first()
                )

            if existing:
                existing.quantity_planned += qty
                if serializer.validated_data.get('unit_price') is not None:
                    existing.unit_price = serializer.validated_data['unit_price']
                if manual_name:
                    existing.manual_name = manual_name
                if serializer.validated_data.get('product_sku') is not None:
                    existing.product_sku = serializer.validated_data['product_sku']
                existing.save(update_fields=['quantity_planned', 'unit_price', 'manual_name', 'product_sku', 'updated_at'])
                out = self.get_serializer(existing)
                return ApiResponse.success(data=out.data)

            try:
                serializer.save(tenant=self.tenant, created_by=request.user, project=project)
            except IntegrityError:
                # Lost the race — retry as update.
                if product:
                    existing = ProjectProduct.objects.get(
                        tenant=self.tenant, project=project, product=product
                    )
                else:
                    existing = ProjectProduct.objects.get(
                        tenant=self.tenant, project=project,
                        product__isnull=True, manual_name=manual_name,
                    )
                existing.quantity_planned += qty
                if serializer.validated_data.get('unit_price') is not None:
                    existing.unit_price = serializer.validated_data['unit_price']
                if manual_name:
                    existing.manual_name = manual_name
                if serializer.validated_data.get('product_sku') is not None:
                    existing.product_sku = serializer.validated_data['product_sku']
                existing.save(update_fields=['quantity_planned', 'unit_price', 'manual_name', 'product_sku', 'updated_at'])
                out = self.get_serializer(existing)
                return ApiResponse.success(data=out.data)

        headers = self.get_success_headers(serializer.data)
        return ApiResponse.created(data=serializer.data)


class ProjectProductRequestViewSet(NexusViewSet):
    """Product requests: staff create → manager approves/rejects."""

    required_module = 'projects'
    queryset = ProjectProductRequest.objects.select_related('product', 'project', 'requested_by', 'reviewed_by')
    serializer_class = ProjectProductRequestSerializer
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return _READ_PERMS()
        if self.action in ('approve', 'reject'):
            return _MANAGER_PERMS()
        return _STAFF_PERMS()

    def get_queryset(self):
        qs = super().get_queryset()
        project_pk = self.kwargs.get('project_pk')
        if project_pk:
            qs = qs.filter(project_id=project_pk)
        # Staff see only their own requests; managers see all.
        user = self.request.user
        from core.permissions import MANAGER_ROLES as _MGR
        if self.user_role not in _MGR and not getattr(user, 'is_superadmin', False):
            qs = qs.filter(requested_by=user)
        return qs

    def create(self, request, *args, **kwargs):
        from django.shortcuts import get_object_or_404
        project_pk = self.kwargs.get('project_pk')
        project    = get_object_or_404(Project, pk=project_pk, tenant=self.tenant)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save(
            tenant=self.tenant, created_by=self.request.user,
            project=project, requested_by=self.request.user,
        )
        return ApiResponse.created(data=self.get_serializer(instance).data)

    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, project_pk=None, pk=None):
        """POST /projects/{id}/product-requests/{pk}/approve/"""
        from django.utils import timezone
        from django.db import transaction as _tx
        from inventory.models import Product as InventoryProduct

        req = self.get_object()
        if req.status != ProjectProductRequest.STATUS_PENDING:
            raise ConflictError('Only pending requests can be approved.')

        if req.product is None and not req.manual_name:
            raise ConflictError('Cannot approve a request without a product or manual_name.')

        with _tx.atomic():
            req.status = ProjectProductRequest.STATUS_APPROVED
            req.reviewed_by = request.user
            req.reviewed_at = timezone.now()
            req.save()

            product = req.product
            if not product and req.create_inventory:
                product = InventoryProduct.objects.filter(
                    tenant=req.tenant,
                    sku=req.product_sku,
                ).first()
                if not product:
                    product = InventoryProduct.objects.create(
                        tenant=req.tenant,
                        name=req.manual_name,
                        sku=req.product_sku,
                        unit_price=req.unit_price,
                        created_by=request.user,
                        is_active=True,
                        track_stock=False,
                    )
                    req.product = product
                    req.save(update_fields=['product'])

            defaults = {
                'tenant': req.tenant,
                'created_by': request.user,
                'quantity_planned': req.quantity,
                'unit_price': req.unit_price,
                'manual_name': req.manual_name,
                'product_sku': req.product_sku,
            }
            pp, created = ProjectProduct.objects.get_or_create(
                project=req.project,
                product=product,
                manual_name=req.manual_name if product is None else '',
                defaults=defaults,
            )
            if not created:
                pp.quantity_planned += req.quantity
                pp.unit_price = req.unit_price
                if req.manual_name:
                    pp.manual_name = req.manual_name
                if req.product_sku:
                    pp.product_sku = req.product_sku
                pp.save(update_fields=['quantity_planned', 'unit_price', 'manual_name', 'product_sku', 'updated_at'])

        return ApiResponse.success(data=ProjectProductRequestSerializer(req).data)

    @action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request, project_pk=None, pk=None):
        """POST /projects/{id}/product-requests/{pk}/reject/  body: {reason?}"""
        from django.utils import timezone
        req = self.get_object()
        if req.status != ProjectProductRequest.STATUS_PENDING:
            raise ConflictError('Only pending requests can be rejected.')

        req.status = ProjectProductRequest.STATUS_REJECTED
        req.reviewed_by = request.user
        req.reviewed_at = timezone.now()
        req.rejection_reason = request.data.get('reason', '')
        req.save()
        return ApiResponse.success(data=ProjectProductRequestSerializer(req).data)


class ProjectAttachmentViewSet(NexusViewSet):
    """File attachments for a project."""
    required_module = 'projects'
    serializer_class = ProjectAttachmentSerializer
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return _READ_PERMS()
        if self.action == 'destroy':
            return _MANAGER_PERMS()
        return _STAFF_PERMS()

    def get_queryset(self):
        self.ensure_tenant()
        qs = ProjectAttachment.objects.filter(tenant=self.tenant).select_related('uploaded_by', 'project')
        project_pk = self.kwargs.get('project_pk')
        if project_pk:
            qs = qs.filter(project_id=project_pk)
        return qs

    def create(self, request, *args, **kwargs):
        from django.shortcuts import get_object_or_404
        self.ensure_tenant()
        project_pk = self.kwargs.get('project_pk')
        project    = get_object_or_404(Project, pk=project_pk, tenant=self.tenant)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save(
            tenant=self.tenant,
            uploaded_by=self.request.user,
            created_by=self.request.user,
            project=project,
        )
        return ApiResponse.created(data=self.get_serializer(instance).data)


class ProjectMemberScheduleViewSet(NexusViewSet):
    """
    Manage per-day work schedules for project team members.

    GET  /projects/{id}/schedules/                   list all schedule entries
    POST /projects/{id}/schedules/                   create a schedule entry
    PATCH /projects/{id}/schedules/{pk}/             update entry (date/note)
    POST /projects/{id}/schedules/{pk}/mark-present/ toggle presence
    Querystring filters: ?member=<id>  ?date=<YYYY-MM-DD>
    """

    required_module = 'projects'
    queryset = ProjectMemberSchedule.objects.select_related('project', 'member')
    serializer_class = ProjectMemberScheduleSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return _READ_PERMS()
        return _STAFF_PERMS()

    def get_queryset(self):
        self.ensure_tenant()
        project_pk = self.kwargs.get('project_pk')
        qs = ProjectMemberSchedule.objects.filter(
            tenant=self.tenant,
        ).select_related('project', 'member')
        if project_pk:
            qs = qs.filter(project_id=project_pk)
        if member_id := self.request.query_params.get('member'):
            qs = qs.filter(member_id=member_id)
        if date := self.request.query_params.get('date'):
            qs = qs.filter(work_date=date)
        return qs

    def create(self, request, *args, **kwargs):
        self.ensure_tenant()
        project_pk = self.kwargs.get('project_pk')
        from django.shortcuts import get_object_or_404
        project = get_object_or_404(Project, pk=project_pk, tenant=self.tenant)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save(
            tenant=self.tenant,
            created_by=request.user,
            project=project,
        )
        return ApiResponse.created(data=self.get_serializer(instance).data)

    @action(detail=True, methods=['post'], url_path='mark-present')
    def mark_present(self, request, project_pk=None, pk=None):
        """Toggle is_present for a schedule entry."""
        schedule = self.get_object()
        schedule.is_present = not schedule.is_present
        schedule.save(update_fields=['is_present', 'updated_at'])
        return ApiResponse.success(data=ProjectMemberScheduleSerializer(schedule).data)
