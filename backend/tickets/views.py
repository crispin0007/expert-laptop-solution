"""
Ticket views.

All viewsets use TenantMixin so every queryset is automatically scoped to
request.tenant.  Business logic lives in serializers (TicketCreateSerializer)
and service functions — views only orchestrate.
"""
import logging

from django.contrib.auth import get_user_model
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone

logger = logging.getLogger(__name__)

from rest_framework import viewsets, permissions, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response

from core.mixins import TenantMixin
from core.views import NexusViewSet
from core.pagination import NexusPageNumberPagination
from core.response import ApiResponse
from core.exceptions import ConflictError, AppException, NotFoundError, ValidationError as AppValidationError
from core.permissions import make_role_permission, ALL_ROLES, STAFF_ROLES, MANAGER_ROLES, ADMIN_ROLES
from tickets.services import TicketService
from .models import (
    Vehicle, VehicleLog,
    Ticket, TicketType, TicketComment, TicketTransfer,
    TicketProduct, TicketSLA, TicketTimeline, TicketAttachment,
    TicketCategory, TicketSubCategory,
)
from .serializers import (
    TicketSerializer, TicketCreateSerializer, TicketTypeSerializer,
    TicketCommentSerializer, TicketTransferSerializer,
    TicketProductSerializer, TicketSLASerializer, TicketTimelineSerializer,
    TicketAttachmentSerializer,
    TicketCategorySerializer, TicketCategoryWriteSerializer, TicketSubCategorySerializer,
)

User = get_user_model()


# ── Ticket Type ───────────────────────────────────────────────────────────────

class TicketTypeViewSet(NexusViewSet):
    """CRUD for ticket types scoped to the current tenant.

    Permissions: read=all members, write/delete=admin+.
    """

    required_module = 'tickets'
    serializer_class = TicketTypeSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['name', 'created_at']

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES, permission_key='tickets.view')()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES, permission_key='tickets.update')()]

    def get_queryset(self):
        self.ensure_tenant()
        qs = TicketType.objects.filter(tenant=self.tenant)
        # On list action only show active types; detail/update/delete work on all
        if self.action == 'list':
            qs = qs.filter(is_active=True)
        return qs

    @action(detail=True, methods=['post'], url_path='deactivate')
    def deactivate(self, request, pk=None):
        """POST .../types/{id}/deactivate/ — soft-disable a ticket type."""
        tt = self.get_object()
        tt.is_active = False
        tt.save(update_fields=['is_active', 'updated_at'])
        return ApiResponse.success(data=TicketTypeSerializer(tt).data)

    @action(detail=True, methods=['post'], url_path='reactivate')
    def reactivate(self, request, pk=None):
        """POST .../types/{id}/reactivate/ — re-enable a deactivated ticket type."""
        tt = self.get_object()
        tt.is_active = True
        tt.save(update_fields=['is_active', 'updated_at'])
        return ApiResponse.success(data=TicketTypeSerializer(tt).data)


# ── Ticket Category ───────────────────────────────────────────────────────────

class TicketCategoryViewSet(NexusViewSet):
    """CRUD for ticket categories (admin-defined per tenant).

    Permissions: read=all members, write/delete=admin+.
    """

    required_module = 'tickets'
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['name', 'created_at']

    def get_permissions(self):
        if self.action in ('list', 'retrieve', 'subcategories'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES, permission_key='tickets.view')()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES, permission_key='tickets.update')()]

    def get_serializer_class(self):
        if self.request.method in ('POST', 'PUT', 'PATCH'):
            return TicketCategoryWriteSerializer
        return TicketCategorySerializer

    def get_queryset(self):
        self.ensure_tenant()
        qs = TicketCategory.objects.filter(tenant=self.tenant)
        active_only = self.request.query_params.get('active')
        if active_only == '1':
            qs = qs.filter(is_active=True)
        return qs.prefetch_related('subcategories')

    @action(detail=True, methods=['get'], url_path='subcategories')
    def subcategories(self, request, pk=None):
        """GET .../categories/{id}/subcategories/ — list subcategories for a category."""
        category = self.get_object()
        subs = TicketSubCategory.objects.filter(category=category, tenant=self.tenant)
        return ApiResponse.success(data=TicketSubCategorySerializer(subs, many=True).data)


class TicketSubCategoryViewSet(NexusViewSet):
    """CRUD for ticket subcategories — always scoped to a parent category + tenant.

    Permissions: read=all members, write/delete=admin+.
    """

    required_module = 'tickets'
    serializer_class = TicketSubCategorySerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES, permission_key='tickets.view')()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES, permission_key='tickets.update')()]

    def get_queryset(self):
        self.ensure_tenant()
        qs = TicketSubCategory.objects.filter(tenant=self.tenant)
        category_id = self.request.query_params.get('category')
        if category_id:
            qs = qs.filter(category_id=category_id)
        return qs


# ── Ticket ────────────────────────────────────────────────────────────────────

class TicketViewSet(NexusViewSet):
    """
    Full ticket lifecycle.

    Standard CRUD (list / create / retrieve / update / partial_update / destroy)
    plus custom actions: assign, transfer, status, close, timeline, suggest-title,
    sla-breached, sla-warning.

    Permissions:
    - read (list, retrieve, timeline, sla-*): all members
    - create / update / change_status:       staff+
    - destroy / assign / transfer / close:   manager+
    """

    serializer_class       = TicketSerializer
    input_serializer_class = TicketCreateSerializer
    service_class          = TicketService
    required_module        = 'tickets'
    pagination_class       = NexusPageNumberPagination
    filter_backends        = [filters.SearchFilter, filters.OrderingFilter]
    search_fields          = ['title', 'ticket_number', 'description']
    ordering_fields        = ['created_at', 'priority', 'status', 'sla_deadline']

    def get_permissions(self):
        if self.action in ('list', 'retrieve', 'timeline', 'sla_breached', 'sla_warning', 'suggest_title'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES, permission_key='tickets.view')()]
        if self.action in ('destroy', 'assign', 'transfer', 'close_ticket'):
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES, permission_key='tickets.assign')()]
        if self.action in ('update', 'partial_update', 'change_status'):
            # Object-level check (staff+ OR assigned) is enforced inside the action method.
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES, permission_key='tickets.view')()]
        return [permissions.IsAuthenticated(), make_role_permission(*STAFF_ROLES, permission_key='tickets.create')()]

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return TicketCreateSerializer
        return TicketSerializer

    def get_serializer_context(self):
        """Inject tenant into serializer context for TicketCreateSerializer validation."""
        ctx = super().get_serializer_context()
        ctx['tenant'] = self.request.tenant
        return ctx

    def get_queryset(self):
        params   = self.request.query_params
        fy_start = fy_end = None
        if fy_raw := params.get('fiscal_year'):
            try:
                from core.nepali_date import fiscal_year_date_range, FiscalYear
                fy = FiscalYear(bs_year=int(fy_raw))
                fy_start, fy_end = fiscal_year_date_range(fy)
            except (ValueError, KeyError):
                pass
        return self.get_service().list(
            status=params.get('status'),
            priority=params.get('priority'),
            assigned_to_id=params.get('assigned_to'),
            department_id=params.get('department'),
            customer_id=params.get('customer'),
            fiscal_year_start=fy_start,
            fiscal_year_end=fy_end,
        )

    # ── CRUD overrides ────────────────────────────────────────────────────────

    def update(self, request, *args, **kwargs):
        """Pass is_manager flag so service can enforce lock rules.

        Object-level rule: staff+ can edit any ticket; viewer/custom users
        can only edit tickets where they are the assigned_to or a team_member.
        """
        partial  = kwargs.pop('partial', False)
        instance = self.get_object()
        if self.user_role not in STAFF_ROLES:
            is_assigned = (
                instance.assigned_to_id == request.user.id or
                instance.team_members.filter(id=request.user.id).exists()
            )
            if not is_assigned:
                return ApiResponse.forbidden('You can only edit tickets that are assigned to you.')
        serializer = self.get_input_serializer(
            instance, data=request.data, partial=partial
        )
        serializer.is_valid(raise_exception=True)
        instance = self.get_service().update(
            instance, serializer.validated_data,
            is_manager=self.is_manager_role(),
        )
        return ApiResponse.success(data=TicketSerializer(instance, context=self.get_serializer_context()).data)

    def destroy(self, request, *args, **kwargs):
        """Soft-delete instead of hard removal."""
        instance = self.get_object()
        self.get_service().delete(instance)
        return ApiResponse.no_content()

    # ── Custom actions ────────────────────────────────────────────────────────

    @action(detail=False, methods=['get'], url_path='suggest-title')
    def suggest_title(self, request):
        """GET /tickets/suggest-title/?category=<id>&subcategory=<id>"""
        title = self.get_service().suggest_title(
            category_id=request.query_params.get('category'),
            subcategory_id=request.query_params.get('subcategory'),
        )
        return ApiResponse.success(data={'title': title})

    @action(detail=True, methods=['post'], url_path='assign')
    def assign(self, request, pk=None):
        """
        POST /tickets/{id}/assign/
        Body: { user_id: int (primary), team_member_ids: [int, …] (co-assignees) }
        At least one field is required. Both can be sent together.
        """
        ticket = self.get_object()
        ticket = self.get_service().assign(
            ticket,
            user_id=request.data.get('user_id'),
            team_member_ids=request.data.get('team_member_ids') or [],
            actor=request.user,
        )
        return ApiResponse.success(
            data=TicketSerializer(ticket, context=self.get_serializer_context()).data
        )

    @action(detail=True, methods=['post'], url_path='transfer')
    def transfer(self, request, pk=None):
        """
        POST /tickets/{id}/transfer/
        Body: { to_department: int, reason: str }
        """
        ticket = self.get_object()
        to_dept_id = request.data.get('to_department')
        if not to_dept_id:
            from core.exceptions import ValidationError
            raise ValidationError('to_department is required.')

        transfer_obj, ticket = self.get_service().transfer(
            ticket,
            to_dept_id=to_dept_id,
            actor=request.user,
            reason=request.data.get('reason', '').strip(),
        )
        return ApiResponse.success(data={
            'transfer': TicketTransferSerializer(transfer_obj).data,
            'ticket':   TicketSerializer(ticket, context=self.get_serializer_context()).data,
        })

    @action(detail=True, methods=['post'], url_path='status')
    def change_status(self, request, pk=None):
        """
        POST /tickets/{id}/status/
        Body: { status: str, reason: str (optional) }

        Object-level rule: staff+ can set any status; viewer/custom users
        can only change status if they are assigned AND the new status is a
        safe self-service transition (in_progress, pending_customer, resolved).
        """
        ticket = self.get_object()
        if self.user_role not in STAFF_ROLES:
            is_assigned = (
                ticket.assigned_to_id == request.user.id or
                ticket.team_members.filter(id=request.user.id).exists()
            )
            if not is_assigned:
                return ApiResponse.forbidden('You can only update status of tickets assigned to you.')
            _SAFE = {'in_progress', 'pending_customer', 'resolved'}
            if request.data.get('status') not in _SAFE:
                return ApiResponse.forbidden(
                    'You can only set status to in_progress, pending_customer, or resolved.'
                )
        ticket = self.get_service().change_status(
            ticket,
            new_status=request.data.get('status'),
            reason=request.data.get('reason', '').strip(),
            actor=request.user,
            is_manager=self.is_manager_role(),
            requesting_user_id=request.user.pk,
        )
        return ApiResponse.success(
            data=TicketSerializer(ticket, context=self.get_serializer_context()).data
        )

    @action(detail=True, methods=['post'], url_path='close')
    def close_ticket(self, request, pk=None):
        """
        POST /tickets/{id}/close/ — Manager/Admin only.
        Body: { coin_amount: number, reason: str (optional) }
        Closes the ticket and immediately awards coins to assigned staff.
        """
        ticket = self.get_object()
        ticket, coin_txn = self.get_service().close_ticket(
            ticket,
            coin_amount=request.data.get('coin_amount', 0),
            reason=request.data.get('reason', '').strip(),
            actor=request.user,
        )
        from accounting.serializers import CoinTransactionSerializer
        return ApiResponse.success(data={
            'ticket':           TicketSerializer(ticket, context=self.get_serializer_context()).data,
            'coin_transaction': CoinTransactionSerializer(coin_txn).data if coin_txn else None,
        })

    @action(detail=True, methods=['get'], url_path='timeline')
    def timeline(self, request, pk=None):
        """GET /tickets/{id}/timeline/ — full chronological event log."""
        ticket = self.get_object()
        events = self.get_service().get_timeline(ticket)
        return ApiResponse.success(
            data=TicketTimelineSerializer(events, many=True).data
        )

    @action(detail=False, methods=['get'], url_path='sla-breached')
    def sla_breached(self, request):
        """GET /tickets/sla-breached/ — all currently breached SLA records."""
        breached = self.get_service().sla_breached()
        return ApiResponse.success(data=TicketSLASerializer(breached, many=True).data)

    @action(detail=False, methods=['get'], url_path='sla-warning')
    def sla_warning(self, request):
        """GET /tickets/sla-warning/ — tickets within 6 h of SLA breach."""
        warning_slas = self.get_service().sla_warning()
        return ApiResponse.success(data=TicketSLASerializer(warning_slas, many=True).data)


# ── Comment ───────────────────────────────────────────────────────────────────

class TicketCommentViewSet(NexusViewSet):
    """
    Comments on a ticket — nested under /tickets/{ticket_pk}/comments/.

    Internal comments (is_internal=True) are only visible to staff members.
    Permissions: read=all members (internal filtered for viewers), write=staff+.
    """

    required_module = 'tickets'
    serializer_class = TicketCommentSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES, permission_key='tickets.view')()]
        return [permissions.IsAuthenticated(), make_role_permission(*STAFF_ROLES, permission_key='tickets.comment')()]

    def get_queryset(self):
        self.ensure_tenant()
        ticket_pk = self.kwargs.get('ticket_pk')
        qs = TicketComment.objects.filter(
            tenant=self.tenant,
            ticket_id=ticket_pk,
        ).select_related('author')
        # Use TenantMembership role — Django's is_staff flag is always False for
        # tenant users and would hide internal comments from everyone including admins.
        from accounts.models import TenantMembership
        from core.permissions import STAFF_ROLES
        try:
            role = TenantMembership.objects.get(
                user=self.request.user, tenant=self.tenant, is_active=True
            ).role
        except TenantMembership.DoesNotExist:
            role = None
        is_staff_member = (
            role in STAFF_ROLES
            or getattr(self.request.user, 'is_superadmin', False)
        )
        if not is_staff_member:
            qs = qs.filter(is_internal=False)
        return qs

    def create(self, request, *args, **kwargs):
        ticket_pk = self.kwargs.get('ticket_pk')
        if not ticket_pk:
            raise AppValidationError('Comments must be created via /tickets/{id}/comments/.')
        try:
            ticket = Ticket.objects.get(pk=ticket_pk, tenant=self.tenant)
        except Ticket.DoesNotExist:
            raise NotFoundError('Ticket not found.')

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        comment = serializer.save(
            tenant=self.tenant,
            ticket=ticket,
            author=self.request.user,
            created_by=self.request.user,
        )

        # Timeline entry for the comment
        TicketTimeline.objects.create(
            tenant=self.tenant,
            ticket=ticket,
            event_type=TicketTimeline.EVENT_COMMENTED,
            description=f"{'[Internal] ' if comment.is_internal else ''}Comment by {self.request.user.get_full_name() or self.request.user.email}",
            actor=self.request.user,
            created_by=self.request.user,
            metadata={'comment_id': comment.pk, 'is_internal': comment.is_internal},
        )
        return ApiResponse.created(data=self.get_serializer(comment).data)


# ── Transfer ──────────────────────────────────────────────────────────────────

class TicketTransferViewSet(NexusViewSet):
    """
    Read-only view of transfer history.
    Transfers are created via POST /tickets/{id}/transfer/ on TicketViewSet.
    """

    required_module = 'tickets'
    serializer_class = TicketTransferSerializer
    http_method_names = ['get', 'head', 'options']
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*ALL_ROLES, permission_key='tickets.view')]

    def get_queryset(self):
        self.ensure_tenant()
        return TicketTransfer.objects.filter(
            tenant=self.tenant,
        ).select_related('from_department', 'to_department', 'transferred_by')


# ── Product ───────────────────────────────────────────────────────────────────

class TicketProductViewSet(NexusViewSet):
    """
    Products / parts used on a ticket — triggers inventory StockMovement via signal.

    Supports two routing patterns:
      GET/POST  /api/v1/tickets/{ticket_pk}/products/   (nested under a ticket)
      GET/…     /api/v1/tickets/products/               (flat — all ticket products)

    Permissions: read=all members, write=staff+, delete=manager+.
    """

    required_module = 'tickets'
    serializer_class = TicketProductSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES, permission_key='tickets.view')()]
        if self.action == 'destroy':
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES, permission_key='tickets.update')()]
        # create: staff+ always; viewer/custom only if assigned to the ticket (checked in create())
        if self.action == 'create':
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES, permission_key='tickets.view')()]
        return [permissions.IsAuthenticated(), make_role_permission(*STAFF_ROLES, permission_key='tickets.create')()]

    def get_queryset(self):
        self.ensure_tenant()
        qs = TicketProduct.objects.filter(
            tenant=self.tenant,
        ).select_related('product', 'ticket')
        # When nested under /tickets/{ticket_pk}/products/
        ticket_pk = self.kwargs.get('ticket_pk')
        if ticket_pk:
            qs = qs.filter(ticket_id=ticket_pk)
        return qs

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        """
        Upsert: if the product is already on this ticket, increment quantity and
        create a delta StockMovement instead of adding a duplicate row.
        (post_save signal only fires on created=True, so we create the movement
        manually for the incremented delta.)
        """
        self.ensure_tenant()
        ticket_pk = self.kwargs.get('ticket_pk')

        # Object-level check: viewer/custom users may only add products to tickets assigned to them.
        if self.user_role not in STAFF_ROLES and ticket_pk:
            ticket_obj = get_object_or_404(Ticket, pk=ticket_pk, tenant=self.tenant)
            is_assigned = (
                ticket_obj.assigned_to_id == request.user.id or
                ticket_obj.team_members.filter(id=request.user.id).exists()
            )
            if not is_assigned:
                return ApiResponse.forbidden('You can only add products to tickets assigned to you.')

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if ticket_pk:
            product = serializer.validated_data['product']
            qty = serializer.validated_data.get('quantity', 1)

            existing = (
                TicketProduct.objects
                .filter(tenant=self.tenant, ticket_id=ticket_pk, product=product)
                .select_related('product')
                .first()
            )

            if existing:
                existing.quantity += qty
                existing.save(update_fields=['quantity', 'updated_at'])

                # Manually create the stock-out movement for the incremented qty
                # (signal only fires on created=True and cannot see the delta).
                # Do NOT swallow this exception — a silent failure here means
                # the ticket shows a product added but inventory is never updated.
                if not product.is_service:
                    try:
                        from inventory.models import StockMovement
                        StockMovement.objects.create(
                            tenant=self.tenant,
                            created_by=self.request.user,
                            product=product,
                            movement_type=StockMovement.MOVEMENT_OUT,
                            quantity=qty,
                            reference_type='ticket_product',
                            reference_id=existing.pk,
                            notes=f'Qty increment: TicketProduct #{existing.pk} on Ticket #{ticket_pk}',
                        )
                    except Exception as _sm_err:
                        logger.error(
                            'StockMovement creation failed for TicketProduct %s (qty delta %s): %s',
                            existing.pk, qty, _sm_err, exc_info=True,
                        )
                        raise AppException('Product quantity updated but stock movement failed. Contact an admin.')

                # Timeline entry
                try:
                    TicketTimeline.objects.create(
                        tenant=self.tenant,
                        ticket_id=ticket_pk,
                        event_type=TicketTimeline.EVENT_PRODUCT_ADDED,
                        description=f"Product '{product.name}' qty updated to ×{existing.quantity}.",
                        actor=self.request.user,
                        created_by=self.request.user,
                    )
                except Exception:
                    logger.warning(
                        'Timeline entry failed for TicketProduct qty update (ticket %s, product %s)',
                        ticket_pk, product.pk, exc_info=True,
                    )

                out = self.get_serializer(existing)
                return ApiResponse.success(data=out.data)

        # New product on this ticket — standard path
        # (post_save signal creates StockMovement automatically)
        self.perform_create(serializer)
        return ApiResponse.created(data=self.get_serializer(serializer.instance).data)

    def perform_create(self, serializer):
        self.ensure_tenant()
        ticket_pk = self.kwargs.get('ticket_pk')
        kwargs = {'tenant': self.tenant, 'created_by': self.request.user}
        if ticket_pk:
            kwargs['ticket_id'] = ticket_pk
        instance = serializer.save(**kwargs)
        # Timeline entry
        try:
            TicketTimeline.objects.create(
                tenant=self.tenant,
                ticket=instance.ticket,
                event_type=TicketTimeline.EVENT_PRODUCT_ADDED,
                description=f"Product '{instance.product.name}' (×{instance.quantity}) added.",
                actor=self.request.user,
                created_by=self.request.user,
            )
        except Exception:
            logger.warning(
                'Timeline entry failed for new TicketProduct (ticket %s, product %s)',
                instance.ticket_id, instance.product_id, exc_info=True,
            )

    def perform_destroy(self, instance):
        """On removal, trigger a RETURN stock movement by calling delete."""
        from inventory.models import StockMovement
        # Create reversal movement before deletion (signal fires post_delete but
        # we ensure it here for explicitness when using nested route)
        already_reversed = StockMovement.objects.filter(
            tenant=instance.tenant,
            movement_type=StockMovement.MOVEMENT_RETURN,
            reference_type='ticket_product',
            reference_id=instance.pk,
        ).exists()
        if not already_reversed and not instance.product.is_service:
            StockMovement.objects.create(
                tenant=instance.tenant,
                created_by=self.request.user,
                product=instance.product,
                movement_type=StockMovement.MOVEMENT_RETURN,
                quantity=instance.quantity,
                reference_type='ticket_product',
                reference_id=instance.pk,
                notes=f"Manual removal: TicketProduct #{instance.pk} removed from Ticket #{instance.ticket_id}",
            )
        instance.delete()


# ── SLA ───────────────────────────────────────────────────────────────────────

class TicketSLAViewSet(NexusViewSet):
    """Read-only SLA records — one per ticket. Visible to all tenant members."""

    required_module = 'tickets'
    serializer_class = TicketSLASerializer
    http_method_names = ['get', 'head', 'options']
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*ALL_ROLES, permission_key='tickets.view')]

    def get_queryset(self):
        self.ensure_tenant()
        return TicketSLA.objects.filter(
            tenant=self.tenant,
        ).select_related('ticket')


# ── Attachment ────────────────────────────────────────────────────────────────

class TicketAttachmentViewSet(NexusViewSet):
    """File attachments on tickets or comments.

    Permissions: read=all members, upload=staff+, delete=manager+.
    """

    required_module = 'tickets'
    serializer_class = TicketAttachmentSerializer
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES, permission_key='tickets.view')()]
        if self.action == 'destroy':
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES, permission_key='tickets.update')()]
        return [permissions.IsAuthenticated(), make_role_permission(*STAFF_ROLES, permission_key='tickets.create')()]

    def get_queryset(self):
        self.ensure_tenant()
        qs = TicketAttachment.objects.filter(
            tenant=self.tenant,
        ).select_related('uploaded_by', 'ticket')
        ticket_pk = self.kwargs.get('ticket_pk')
        if ticket_pk:
            qs = qs.filter(ticket_id=ticket_pk)
        return qs

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ticket_pk = self.kwargs.get('ticket_pk')
        if ticket_pk:
            ticket = Ticket.objects.get(pk=ticket_pk, tenant=self.tenant)
            instance = serializer.save(tenant=self.tenant, uploaded_by=self.request.user, created_by=self.request.user, ticket=ticket)
        else:
            instance = serializer.save(tenant=self.tenant, uploaded_by=self.request.user, created_by=self.request.user)
        return ApiResponse.created(data=self.get_serializer(instance).data)


# ── Vehicle ViewSets ──────────────────────────────────────────────────────────

class VehicleViewSet(NexusViewSet):
    """
    CRUD for the tenant vehicle fleet.
    GET/POST   /api/v1/tickets/vehicles/
    GET/PATCH/DELETE /api/v1/tickets/vehicles/{id}/
    Permissions: read = all staff; write = manager+
    """
    required_module = 'tickets'

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES, permission_key='tickets.view')()]
        return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES, permission_key='tickets.update')()]

    def get_queryset(self):
        self.ensure_tenant()
        return Vehicle.objects.filter(tenant=self.tenant)

    def get_serializer_class(self):
        from .serializers import VehicleSerializer
        return VehicleSerializer


class VehicleLogViewSet(NexusViewSet):
    """
    Trip logs per vehicle. Optionally linked to a ticket.
    GET/POST   /api/v1/tickets/vehicle-logs/
    GET/PATCH/DELETE /api/v1/tickets/vehicle-logs/{id}/
    """
    required_module = 'tickets'

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES, permission_key='tickets.view')()]
        return [permissions.IsAuthenticated(), make_role_permission(*STAFF_ROLES, permission_key='tickets.create')()]

    def get_queryset(self):
        self.ensure_tenant()
        qs = VehicleLog.objects.filter(tenant=self.tenant).select_related(
            'vehicle', 'ticket', 'driven_by',
        )
        vehicle_id = self.request.query_params.get('vehicle')
        ticket_id  = self.request.query_params.get('ticket')
        if vehicle_id:
            qs = qs.filter(vehicle_id=vehicle_id)
        if ticket_id:
            qs = qs.filter(ticket_id=ticket_id)
        return qs

    def get_serializer_class(self):
        from .serializers import VehicleLogSerializer
        return VehicleLogSerializer
