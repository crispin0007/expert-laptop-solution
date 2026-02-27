"""
Ticket views.

All viewsets use TenantMixin so every queryset is automatically scoped to
request.tenant.  Business logic lives in serializers (TicketCreateSerializer)
and service functions — views only orchestrate.
"""
from django.contrib.auth import get_user_model
from django.utils import timezone

from rest_framework import viewsets, permissions, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response

from core.mixins import TenantMixin
from core.permissions import make_role_permission, ALL_ROLES, STAFF_ROLES, MANAGER_ROLES, ADMIN_ROLES
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

class TicketTypeViewSet(TenantMixin, viewsets.ModelViewSet):
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
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]

    def get_queryset(self):
        self.ensure_tenant()
        qs = TicketType.objects.filter(tenant=self.tenant)
        # On list action only show active types; detail/update/delete work on all
        if self.action == 'list':
            qs = qs.filter(is_active=True)
        return qs

    def perform_create(self, serializer):
        serializer.save(tenant=self.tenant, created_by=self.request.user)

    @action(detail=True, methods=['post'], url_path='deactivate')
    def deactivate(self, request, pk=None):
        """POST .../types/{id}/deactivate/ — soft-disable a ticket type."""
        tt = self.get_object()
        tt.is_active = False
        tt.save(update_fields=['is_active', 'updated_at'])
        return Response(TicketTypeSerializer(tt).data)

    @action(detail=True, methods=['post'], url_path='reactivate')
    def reactivate(self, request, pk=None):
        """POST .../types/{id}/reactivate/ — re-enable a deactivated ticket type."""
        tt = self.get_object()
        tt.is_active = True
        tt.save(update_fields=['is_active', 'updated_at'])
        return Response(TicketTypeSerializer(tt).data)


# ── Ticket Category ───────────────────────────────────────────────────────────

class TicketCategoryViewSet(TenantMixin, viewsets.ModelViewSet):
    """CRUD for ticket categories (admin-defined per tenant).

    Permissions: read=all members, write/delete=admin+.
    """

    required_module = 'tickets'
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['name', 'created_at']

    def get_permissions(self):
        if self.action in ('list', 'retrieve', 'subcategories'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]

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

    def perform_create(self, serializer):
        serializer.save(tenant=self.tenant, created_by=self.request.user)

    @action(detail=True, methods=['get'], url_path='subcategories')
    def subcategories(self, request, pk=None):
        """GET .../categories/{id}/subcategories/ — list subcategories for a category."""
        category = self.get_object()
        subs = TicketSubCategory.objects.filter(category=category, tenant=self.tenant)
        return Response(TicketSubCategorySerializer(subs, many=True).data)


class TicketSubCategoryViewSet(TenantMixin, viewsets.ModelViewSet):
    """CRUD for ticket subcategories — always scoped to a parent category + tenant.

    Permissions: read=all members, write/delete=admin+.
    """

    required_module = 'tickets'
    serializer_class = TicketSubCategorySerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]

    def get_queryset(self):
        self.ensure_tenant()
        qs = TicketSubCategory.objects.filter(tenant=self.tenant)
        category_id = self.request.query_params.get('category')
        if category_id:
            qs = qs.filter(category_id=category_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(tenant=self.tenant, created_by=self.request.user)


# ── Ticket ────────────────────────────────────────────────────────────────────

class TicketViewSet(TenantMixin, viewsets.ModelViewSet):
    """
    Full ticket lifecycle:
      list / create / retrieve / update / partial_update / destroy
      + assign, transfer, status, timeline, sla-breached, sla-warning actions.

    Permissions:
    - read (list, retrieve, timeline, sla-*): all members
    - create / update / change_status:        staff+
    - destroy / assign / transfer / close:    manager+
    """

    required_module = 'tickets'
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['title', 'ticket_number', 'description']
    ordering_fields = ['created_at', 'priority', 'status', 'sla_deadline']

    def get_permissions(self):
        # Read-only actions — every tenant member
        if self.action in ('list', 'retrieve', 'timeline', 'sla_breached', 'sla_warning'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES)()]
        # Write actions needing manager or above
        if self.action in ('destroy', 'assign', 'transfer', 'close_ticket'):
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES)()]
        # create / update / partial_update / change_status — staff+
        return [permissions.IsAuthenticated(), make_role_permission(*STAFF_ROLES)()]

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return TicketCreateSerializer
        return TicketSerializer

    def get_queryset(self):
        self.ensure_tenant()
        qs = Ticket.objects.filter(
            tenant=self.tenant, is_deleted=False,
        ).select_related(
            'ticket_type', 'customer', 'department', 'assigned_to', 'created_by', 'sla',
        )

        params = self.request.query_params
        if s := params.get('status'):
            qs = qs.filter(status=s)
        if p := params.get('priority'):
            qs = qs.filter(priority=p)
        if uid := params.get('assigned_to'):
            qs = qs.filter(assigned_to_id=uid)
        if dept := params.get('department'):
            qs = qs.filter(department_id=dept)
        if cust := params.get('customer'):
            qs = qs.filter(customer_id=cust)
        return qs

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        self.ensure_tenant()
        ctx['tenant'] = self.tenant
        return ctx

    def create(self, request, *args, **kwargs):
        """Override to return the full TicketSerializer (with id) after creation."""
        write_serializer = TicketCreateSerializer(
            data=request.data,
            context=self.get_serializer_context(),
        )
        write_serializer.is_valid(raise_exception=True)
        ticket = write_serializer.save()
        read_serializer = TicketSerializer(ticket, context=self.get_serializer_context())
        return Response(read_serializer.data, status=status.HTTP_201_CREATED)

    def perform_create(self, serializer):
        # TicketCreateSerializer.create() handles tenant + SLA + timeline
        serializer.save()

    def _ticket_is_locked(self, ticket):
        """Return True if the ticket is in a terminal state that staff cannot modify."""
        return ticket.status in (
            Ticket.STATUS_RESOLVED,
            Ticket.STATUS_CLOSED,
            Ticket.STATUS_CANCELLED,
        )

    def perform_update(self, serializer):
        """Block staff from editing locked tickets."""
        if self._ticket_is_locked(serializer.instance) and not self.is_manager_role():
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied(
                'This ticket is locked. Only a manager or admin can modify it.'
            )
        serializer.save()

    def perform_destroy(self, instance):
        """Soft-delete instead of hard delete."""
        instance.is_deleted = True
        instance.deleted_at = timezone.now()
        instance.save(update_fields=['is_deleted', 'deleted_at', 'updated_at'])

    # ── actions ──────────────────────────────────────────────────────────────

    @action(detail=True, methods=['post'], url_path='assign')
    def assign(self, request, pk=None):
        """
        POST /api/v1/tickets/{id}/assign/

        Body fields (at least one required):
          user_id          : int       — primary assignee (sets assigned_to)
          team_member_ids  : [int, …]  — co-assignees (replaces team_members list)

        Passing both at once is supported and recommended.
        """
        ticket = self.get_object()
        user_id         = request.data.get('user_id')
        team_member_ids = request.data.get('team_member_ids') or []

        if not user_id and not team_member_ids:
            return Response(
                {'success': False, 'errors': ['Provide user_id (primary) and/or team_member_ids (co-assignees).']},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── primary assignee ──────────────────────────────────────────────────
        if user_id:
            try:
                assignee = User.objects.get(pk=user_id)
            except User.DoesNotExist:
                return Response(
                    {'success': False, 'errors': [f'User {user_id} not found.']},
                    status=status.HTTP_404_NOT_FOUND,
                )

            # Security: ensure the assignee is an active member of THIS tenant.
            # Without this check, any user PK from any tenant could be set as assignee,
            # leaking cross-tenant user existence information.
            from accounts.models import TenantMembership
            if not TenantMembership.objects.filter(
                user=assignee, tenant=self.tenant, is_active=True
            ).exists():
                return Response(
                    {'success': False, 'errors': ['Assignee is not an active member of this workspace.']},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            old_assignee = ticket.assigned_to
            ticket.assigned_to = assignee
            if ticket.status == Ticket.STATUS_OPEN:
                ticket.status = Ticket.STATUS_IN_PROGRESS
            ticket.save(update_fields=['assigned_to', 'status', 'updated_at'])

            TicketTimeline.objects.create(
                tenant=ticket.tenant,
                ticket=ticket,
                event_type=TicketTimeline.EVENT_ASSIGNED,
                description=f"Assigned to {assignee.get_full_name() or assignee.email}",
                actor=request.user,
                created_by=request.user,
                metadata={
                    'from': old_assignee.pk if old_assignee else None,
                    'to': assignee.pk,
                },
            )

            # Async email notification to primary assignee
            try:
                from notifications.tasks import task_send_ticket_assigned
                task_send_ticket_assigned.delay(ticket_id=ticket.pk, assignee_id=assignee.pk)
            except Exception:
                from notifications.email import send_ticket_assigned
                send_ticket_assigned(ticket, assignee)

        # ── co-assignees (team members) ────────────────────────────────────────
        if team_member_ids:
            team_qs = User.objects.filter(pk__in=team_member_ids)
            found_ids = set(team_qs.values_list('pk', flat=True))
            missing   = [i for i in team_member_ids if i not in found_ids]
            if missing:
                return Response(
                    {'success': False, 'errors': [f'Users not found: {missing}']},
                    status=status.HTTP_404_NOT_FOUND,
                )
            # Security: confirm every co-assignee belongs to this tenant.
            from accounts.models import TenantMembership
            member_ids_in_tenant = set(
                TenantMembership.objects.filter(
                    user__in=team_qs, tenant=self.tenant, is_active=True
                ).values_list('user_id', flat=True)
            )
            not_members = [i for i in found_ids if i not in member_ids_in_tenant]
            if not_members:
                return Response(
                    {'success': False, 'errors': [f'Users not in this workspace: {not_members}']},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            ticket.team_members.set(team_qs)
            names = [u.get_full_name() or u.email for u in team_qs]
            TicketTimeline.objects.create(
                tenant=ticket.tenant,
                ticket=ticket,
                event_type=TicketTimeline.EVENT_ASSIGNED,
                description=f"Co-assignees updated: {', '.join(names)}",
                actor=request.user,
                created_by=request.user,
                metadata={'team_member_ids': list(found_ids)},
            )

        return Response({'success': True, 'data': TicketSerializer(ticket, context=self.get_serializer_context()).data})

    @action(detail=False, methods=['get'], url_path='suggest-title')
    def suggest_title(self, request):
        """
        GET /api/v1/tickets/suggest-title/?category=<id>&subcategory=<id>

        Returns a suggested ticket title string based on the selected
        category / subcategory.  Useful for auto-populating the title
        field on the create form before the user can customise it.
        """
        from .models import TicketCategory, TicketSubCategory
        cat_id  = request.query_params.get('category')
        sub_id  = request.query_params.get('subcategory')

        cat_name = sub_name = ''
        if cat_id:
            try:
                cat_name = TicketCategory.objects.get(pk=cat_id, tenant=self.tenant).name
            except TicketCategory.DoesNotExist:
                pass
        if sub_id:
            try:
                sub_name = TicketSubCategory.objects.get(pk=sub_id, tenant=self.tenant).name
            except TicketSubCategory.DoesNotExist:
                pass

        if cat_name and sub_name:
            title = f"{cat_name} — {sub_name}"
        elif cat_name:
            title = f"{cat_name} Request"
        else:
            title = "Support Request"

        return Response({'title': title})

    @action(detail=True, methods=['post'], url_path='transfer')
    def transfer(self, request, pk=None):
        """
        POST /api/v1/tickets/{id}/transfer/ — transfer ticket to another department.

        Body: { "to_department": <id>, "reason": "<string>" }
        """
        ticket = self.get_object()
        to_dept_id = request.data.get('to_department')
        reason = request.data.get('reason', '').strip()

        if not to_dept_id:
            return Response(
                {'success': False, 'errors': ['to_department is required.']},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from departments.models import Department
        try:
            to_dept = Department.objects.get(pk=to_dept_id, tenant=self.tenant)
        except Department.DoesNotExist:
            return Response(
                {'success': False, 'errors': ['Department not found in this tenant.']},
                status=status.HTTP_404_NOT_FOUND,
            )

        from_dept = ticket.department

        # Record transfer
        transfer = TicketTransfer.objects.create(
            tenant=ticket.tenant,
            ticket=ticket,
            from_department=from_dept,
            to_department=to_dept,
            transferred_by=request.user,
            reason=reason,
            created_by=request.user,
        )

        # Update ticket department
        ticket.department = to_dept
        ticket.save(update_fields=['department', 'updated_at'])

        # Timeline entry
        TicketTimeline.objects.create(
            tenant=ticket.tenant,
            ticket=ticket,
            event_type=TicketTimeline.EVENT_TRANSFERRED,
            description=(
                f"Transferred from {from_dept.name if from_dept else '—'} "
                f"to {to_dept.name}. Reason: {reason or '—'}"
            ),
            actor=request.user,
            created_by=request.user,
            metadata={
                'from_department': from_dept.pk if from_dept else None,
                'to_department': to_dept.pk,
                'reason': reason,
            },
        )

        return Response({
            'success': True,
            'data': {
                'transfer': TicketTransferSerializer(transfer).data,
                'ticket': TicketSerializer(ticket, context=self.get_serializer_context()).data,
            },
        })

    @action(detail=True, methods=['post'], url_path='status')
    def change_status(self, request, pk=None):
        """
        POST /api/v1/tickets/{id}/status/ — change ticket status.

        Transition rules
        ----------------
        Staff (non-manager):
          - Can only set status to 'resolved'.
          - Can only act on tickets assigned to themselves.
          - Cannot act on tickets that are already resolved/closed/cancelled.

        Manager / Admin / Owner:
          - Can set any status EXCEPT 'closed'.
          - Use the dedicated  POST /tickets/{id}/close/  action to close a ticket
            and award coins in one step.
        """
        ticket = self.get_object()
        new_status = request.data.get('status')
        reason = request.data.get('reason', '').strip()
        is_manager = self.is_manager_role()

        valid = [s for s, _ in Ticket.STATUS_CHOICES]
        if new_status not in valid:
            return Response(
                {'success': False, 'errors': [f'Invalid status. Choose from: {valid}']},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 'closed' is reserved for the dedicated /close/ action
        if new_status == Ticket.STATUS_CLOSED:
            return Response(
                {'success': False, 'errors': [
                    "Use POST /tickets/{id}/close/ to close a ticket and award coins."
                ]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not is_manager:
            # Staff may only resolve tickets assigned to themselves
            if new_status != Ticket.STATUS_RESOLVED:
                return Response(
                    {'success': False, 'errors': [
                        'Staff may only set a ticket to resolved. '
                        'Closing, cancelling, or re-opening requires a manager or admin.'
                    ]},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if ticket.assigned_to_id != request.user.pk:
                return Response(
                    {'success': False, 'errors': [
                        'You can only resolve tickets that are assigned to you.'
                    ]},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if self._ticket_is_locked(ticket):
                return Response(
                    {'success': False, 'errors': [
                        'This ticket is already resolved, closed, or cancelled.'
                    ]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            # Staff may only resolve from in_progress or pending_customer
            allowed_from = (Ticket.STATUS_IN_PROGRESS, Ticket.STATUS_PENDING_CUSTOMER)
            if ticket.status not in allowed_from:
                return Response(
                    {'success': False, 'errors': [
                        f'Can only resolve a ticket that is in_progress or pending_customer. '
                        f'Current status: {ticket.status}'
                    ]},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        old_status = ticket.status
        ticket.status = new_status
        now = timezone.now()

        update_fields = ['status', 'updated_at']
        if new_status == Ticket.STATUS_RESOLVED and not ticket.resolved_at:
            ticket.resolved_at = now
            update_fields.append('resolved_at')

        ticket.save(update_fields=update_fields)

        TicketTimeline.objects.create(
            tenant=ticket.tenant,
            ticket=ticket,
            event_type=TicketTimeline.EVENT_STATUS_CHANGE,
            description=f"Status changed from {old_status} to {new_status}.{(' ' + reason) if reason else ''}",
            actor=request.user,
            created_by=request.user,
            metadata={'from': old_status, 'to': new_status, 'reason': reason},
        )

        return Response({'success': True, 'data': TicketSerializer(ticket, context=self.get_serializer_context()).data})

    @action(detail=True, methods=['post'], url_path='close')
    def close_ticket(self, request, pk=None):
        """
        POST /api/v1/tickets/{id}/close/ — Manager/Admin only.

        Closes the ticket and immediately awards an approved CoinTransaction to
        the assigned staff member.

        Required: invoice must exist and be paid for this ticket before closing.

        Body
        ----
        coin_amount : number   — coins to award (0 = no coins awarded)
        reason      : string   — optional closure note

        Workflow
        --------
        Finance generates invoice → marks invoice paid →
        Manager calls this endpoint to close ticket + award coins.
        """
        from decimal import Decimal

        if not self.is_manager_role():
            return Response(
                {'success': False, 'errors': ['Only managers or admins can close a ticket.']},
                status=status.HTTP_403_FORBIDDEN,
            )

        ticket = self.get_object()

        if ticket.status == Ticket.STATUS_CLOSED:
            return Response(
                {'success': False, 'errors': ['Ticket is already closed.']},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if ticket.status == Ticket.STATUS_CANCELLED:
            return Response(
                {'success': False, 'errors': ['Cannot close a cancelled ticket.']},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if ticket.status != Ticket.STATUS_RESOLVED:
            return Response(
                {'success': False, 'errors': [
                    f'Ticket must be resolved before closing. Current status: {ticket.status}'
                ]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate coin amount
        raw_coins = request.data.get('coin_amount', 0)
        try:
            coin_amount = Decimal(str(raw_coins))
            if coin_amount < 0:
                raise ValueError
        except (ValueError, TypeError):
            return Response(
                {'success': False, 'errors': ['coin_amount must be a non-negative number.']},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reason = request.data.get('reason', '').strip()
        now = timezone.now()

        # Close the ticket
        ticket.status = Ticket.STATUS_CLOSED
        ticket.closed_at = now
        ticket.save(update_fields=['status', 'closed_at', 'updated_at'])

        TicketTimeline.objects.create(
            tenant=ticket.tenant,
            ticket=ticket,
            event_type=TicketTimeline.EVENT_STATUS_CHANGE,
            description=f"Ticket closed by {request.user.get_full_name() or request.user.email}.{(' ' + reason) if reason else ''}",
            actor=request.user,
            created_by=request.user,
            metadata={
                'from': Ticket.STATUS_RESOLVED,
                'to': Ticket.STATUS_CLOSED,
                'reason': reason,
                'coin_amount': str(coin_amount),
            },
        )

        # Award coins to assigned staff (directly approved — no approval queue)
        coin_txn = None
        if coin_amount > 0 and ticket.assigned_to_id:
            from accounting.models import CoinTransaction
            coin_txn = CoinTransaction.objects.create(
                tenant=ticket.tenant,
                created_by=request.user,
                staff=ticket.assigned_to,
                amount=coin_amount,
                source_type=CoinTransaction.SOURCE_TICKET,
                source_id=ticket.pk,
                status=CoinTransaction.STATUS_APPROVED,
                approved_by=request.user,
                note=f"Awarded on ticket close by {request.user.get_full_name() or request.user.email}. {reason}".strip(),
            )

            TicketTimeline.objects.create(
                tenant=ticket.tenant,
                ticket=ticket,
                event_type=TicketTimeline.EVENT_STATUS_CHANGE,
                description=(
                    f"{coin_amount} coin(s) awarded to "
                    f"{ticket.assigned_to.get_full_name() or ticket.assigned_to.email}."
                ),
                actor=request.user,
                created_by=request.user,
                metadata={'coin_amount': str(coin_amount), 'staff_id': ticket.assigned_to_id},
            )

        from accounting.serializers import CoinTransactionSerializer
        return Response({
            'success': True,
            'data': {
                'ticket': TicketSerializer(ticket, context=self.get_serializer_context()).data,
                'coin_transaction': CoinTransactionSerializer(coin_txn).data if coin_txn else None,
            },
        })

    @action(detail=True, methods=['get'], url_path='timeline')
    def timeline(self, request, pk=None):
        """GET /api/v1/tickets/{id}/timeline/ — full chronological event log."""
        ticket = self.get_object()
        events = TicketTimeline.objects.filter(ticket=ticket).select_related('actor')
        return Response({
            'success': True,
            'data': TicketTimelineSerializer(events, many=True).data,
        })

    @action(detail=False, methods=['get'], url_path='sla-breached')
    def sla_breached(self, request):
        """GET /api/v1/tickets/sla-breached/ — all currently breached SLA records."""
        self.ensure_tenant()
        breached = TicketSLA.objects.filter(
            tenant=self.tenant,
            breached=True,
        ).select_related('ticket')
        return Response({
            'success': True,
            'data': TicketSLASerializer(breached, many=True).data,
        })

    @action(detail=False, methods=['get'], url_path='sla-warning')
    def sla_warning(self, request):
        """GET /api/v1/tickets/sla-warning/ — tickets within warning window of SLA breach."""
        self.ensure_tenant()
        now = timezone.now()
        warning_slas = TicketSLA.objects.filter(
            tenant=self.tenant,
            breached=False,
            breach_at__isnull=False,
            breach_at__lte=now + timezone.timedelta(hours=6),
            breach_at__gt=now,
        ).select_related('ticket')
        return Response({
            'success': True,
            'data': TicketSLASerializer(warning_slas, many=True).data,
        })


# ── Comment ───────────────────────────────────────────────────────────────────

class TicketCommentViewSet(TenantMixin, viewsets.ModelViewSet):
    """
    Comments on a ticket — nested under /tickets/{ticket_pk}/comments/.

    Internal comments (is_internal=True) are only visible to staff members.
    Permissions: read=all members (internal filtered for viewers), write=staff+.
    """

    required_module = 'tickets'
    serializer_class = TicketCommentSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*STAFF_ROLES)()]

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

    def perform_create(self, serializer):
        self.ensure_tenant()
        ticket_pk = self.kwargs.get('ticket_pk')
        if not ticket_pk:
            from rest_framework.exceptions import ValidationError
            raise ValidationError('Comments must be created via /tickets/{id}/comments/.')
        try:
            ticket = Ticket.objects.get(pk=ticket_pk, tenant=self.tenant)
        except Ticket.DoesNotExist:
            from rest_framework.exceptions import NotFound
            raise NotFound('Ticket not found.')

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


# ── Transfer ──────────────────────────────────────────────────────────────────

class TicketTransferViewSet(TenantMixin, viewsets.ReadOnlyModelViewSet):
    """
    Read-only view of transfer history.
    Transfers are created via POST /tickets/{id}/transfer/ on TicketViewSet.
    """

    required_module = 'tickets'
    serializer_class = TicketTransferSerializer
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*ALL_ROLES)]

    def get_queryset(self):
        self.ensure_tenant()
        return TicketTransfer.objects.filter(
            tenant=self.tenant,
        ).select_related('from_department', 'to_department', 'transferred_by')


# ── Product ───────────────────────────────────────────────────────────────────

class TicketProductViewSet(TenantMixin, viewsets.ModelViewSet):
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
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES)()]
        if self.action == 'destroy':
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*STAFF_ROLES)()]

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

    def create(self, request, *args, **kwargs):
        """
        Upsert: if the product is already on this ticket, increment quantity and
        create a delta StockMovement instead of adding a duplicate row.
        (post_save signal only fires on created=True, so we create the movement
        manually for the incremented delta.)
        """
        self.ensure_tenant()
        ticket_pk = self.kwargs.get('ticket_pk')

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
                    import logging as _logging
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
                        _logging.getLogger(__name__).error(
                            'StockMovement creation failed for TicketProduct %s (qty delta %s): %s',
                            existing.pk, qty, _sm_err, exc_info=True,
                        )
                        return Response(
                            {'detail': 'Product quantity updated but stock movement failed. Contact an admin.'},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        )

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
                    pass

                out = self.get_serializer(existing)
                return Response(out.data, status=status.HTTP_200_OK)

        # New product on this ticket — standard path
        # (post_save signal creates StockMovement automatically)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

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
            pass

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

class TicketSLAViewSet(TenantMixin, viewsets.ReadOnlyModelViewSet):
    """Read-only SLA records — one per ticket. Visible to all tenant members."""

    required_module = 'tickets'
    serializer_class = TicketSLASerializer
    permission_classes = [permissions.IsAuthenticated, make_role_permission(*ALL_ROLES)]

    def get_queryset(self):
        self.ensure_tenant()
        return TicketSLA.objects.filter(
            tenant=self.tenant,
        ).select_related('ticket')


# ── Attachment ────────────────────────────────────────────────────────────────

class TicketAttachmentViewSet(TenantMixin, viewsets.ModelViewSet):
    """File attachments on tickets or comments.

    Permissions: read=all members, upload=staff+, delete=manager+.
    """

    required_module = 'tickets'
    serializer_class = TicketAttachmentSerializer
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES)()]
        if self.action == 'destroy':
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*STAFF_ROLES)()]

    def get_queryset(self):
        self.ensure_tenant()
        qs = TicketAttachment.objects.filter(
            tenant=self.tenant,
        ).select_related('uploaded_by', 'ticket')
        ticket_pk = self.kwargs.get('ticket_pk')
        if ticket_pk:
            qs = qs.filter(ticket_id=ticket_pk)
        return qs

    def perform_create(self, serializer):
        self.ensure_tenant()
        ticket_pk = self.kwargs.get('ticket_pk')
        if ticket_pk:
            ticket = Ticket.objects.get(pk=ticket_pk, tenant=self.tenant)
            serializer.save(tenant=self.tenant, uploaded_by=self.request.user, created_by=self.request.user, ticket=ticket)
        else:
            serializer.save(tenant=self.tenant, uploaded_by=self.request.user, created_by=self.request.user)


# ── Vehicle ViewSets ──────────────────────────────────────────────────────────

class VehicleViewSet(TenantMixin, viewsets.ModelViewSet):
    """
    CRUD for the tenant vehicle fleet.
    GET/POST   /api/v1/tickets/vehicles/
    GET/PATCH/DELETE /api/v1/tickets/vehicles/{id}/
    Permissions: read = all staff; write = manager+
    """
    required_module = 'tickets'

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES)()]

    def get_queryset(self):
        self.ensure_tenant()
        return Vehicle.objects.filter(tenant=self.tenant)

    def get_serializer_class(self):
        from .serializers import VehicleSerializer
        return VehicleSerializer

    def perform_create(self, serializer):
        serializer.save(tenant=self.tenant, created_by=self.request.user)


class VehicleLogViewSet(TenantMixin, viewsets.ModelViewSet):
    """
    Trip logs per vehicle. Optionally linked to a ticket.
    GET/POST   /api/v1/tickets/vehicle-logs/
    GET/PATCH/DELETE /api/v1/tickets/vehicle-logs/{id}/
    """
    required_module = 'tickets'

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*STAFF_ROLES)()]

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

    def perform_create(self, serializer):
        serializer.save(tenant=self.tenant, created_by=self.request.user)
