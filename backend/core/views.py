import logging
from decimal import Decimal

from django.http import JsonResponse
from django.utils import timezone
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.exceptions import AppException
from core.mixins import TenantMixin
from core.pagination import NexusCursorPagination
from core.permissions import make_role_permission, ALL_ROLES
from core.response import ApiResponse

logger = logging.getLogger(__name__)


# ── Base ViewSet ──────────────────────────────────────────────────────────────


class NexusViewSet(TenantMixin, viewsets.ModelViewSet):
    """
    Base ViewSet for ALL NEXUS BMS endpoints.

    Contract for every subclass:
    - Define ``service_class`` — never put business logic here
    - Define ``filterset_class`` for list filtering (django-filter)
    - Define ``serializer_class`` for read (output) serialization
    - Define ``input_serializer_class`` for write (create/update) validation
    - Call ``self.get_service()`` to access the service layer
    - Never call ORM or Repository directly from a ViewSet
    - Always return ``ApiResponse.*`` — never bare ``Response(...)``

    Quick start::

        class InvoiceViewSet(NexusViewSet):
            service_class        = InvoiceService
            serializer_class     = InvoiceOutputSerializer
            input_serializer_class = InvoiceInputSerializer
            filterset_class      = InvoiceFilter
            ordering_fields      = ["created_at", "total"]
            ordering             = ["-created_at"]
    """

    permission_classes = [IsAuthenticated]
    pagination_class = NexusCursorPagination

    # Set in subclass
    service_class = None
    input_serializer_class = None  # separate input DTO for create/update

    # ── Service injection ─────────────────────────────────────────────────────

    def get_service(self):
        """
        Instantiate and return the service for this request.
        Injects tenant + user — services never touch request directly.
        """
        if self.service_class is None:
            raise NotImplementedError(
                f"{self.__class__.__name__} must define service_class"
            )
        return self.service_class(
            tenant=self.request.tenant,
            user=self.request.user,
        )

    # ── Serializer helpers ────────────────────────────────────────────────────

    def get_input_serializer(self, *args, **kwargs):
        """
        Return input (write) serializer for validation.
        Falls back to serializer_class if input_serializer_class is not set.
        """
        cls = self.input_serializer_class or self.serializer_class
        kwargs.setdefault("context", self.get_serializer_context())
        return cls(*args, **kwargs)

    # ── Standard CRUD — all delegate to service ───────────────────────────────

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(qs, many=True)
        return ApiResponse.success(data=serializer.data)

    def create(self, request, *args, **kwargs):
        serializer = self.get_input_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if self.service_class is not None:
            instance = self.get_service().create(serializer.validated_data)
        else:
            instance = serializer.save(
                tenant=self.tenant, created_by=self.request.user
            )
        out = self.get_serializer(instance)
        return ApiResponse.created(data=out.data)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return ApiResponse.success(data=serializer.data)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_input_serializer(
            instance, data=request.data, partial=partial
        )
        serializer.is_valid(raise_exception=True)
        if self.service_class is not None:
            instance = self.get_service().update(instance, serializer.validated_data)
        else:
            instance = serializer.save()
        out = self.get_serializer(instance)
        return ApiResponse.success(data=out.data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if self.service_class is not None:
            self.get_service().delete(instance)
        else:
            instance.delete()
        return ApiResponse.no_content()

    # ── Exception handling ────────────────────────────────────────────────────

    def handle_exception(self, exc):
        """
        Catch AppException subclasses at the view layer as a belt-and-suspenders
        safety net — the global exception_handler in core.exception_handler
        is the primary handler, but this catches cases where handle_exception
        is invoked before the global handler has a chance to run.
        """
        if isinstance(exc, AppException):
            logger.warning(
                "AppException [%s] in %s: %s",
                exc.__class__.__name__,
                self.__class__.__name__,
                exc.message,
                extra=exc.extra,
            )
            return ApiResponse.error(
                errors=[exc.message],
                status=exc.status_code,
            )
        return super().handle_exception(exc)


def health_check(request):
    """Simple health endpoint returning basic service status."""
    return JsonResponse({
        "status": "ok",
        "services": {
            "db": True,
            "redis": True,
        },
    })


class DashboardStatsView(TenantMixin, APIView):
    """
    GET /api/v1/dashboard/stats/

    Returns aggregated KPI counts for the current tenant’s dashboard in a
    single round-trip, avoiding the N+1 problem of individual list queries.

    Permissions — any authenticated staff member of the tenant.
    """

    permission_classes = [permissions.IsAuthenticated, make_role_permission(*ALL_ROLES, permission_key='reports.view')]

    def get(self, request):
        # self.tenant is guaranteed non-None by TenantMixin.initial()
        tenant = self.tenant

        # ── Lazy imports to keep core dependency-free ─────────────────────
        from tickets.models import Ticket, TicketSLA
        from projects.models import Project, ProjectTask
        from accounting.models import CoinTransaction, Invoice
        from django.db.models import Sum, Q

        now = timezone.now()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        # ── Optional FY filter ────────────────────────────────────────────
        fy_start_ad = None
        fy_end_ad = None
        if fy_raw := request.query_params.get('fiscal_year'):
            try:
                from core.nepali_date import fiscal_year_date_range, FiscalYear
                fy = FiscalYear(bs_year=int(fy_raw))
                fy_start_ad, fy_end_ad = fiscal_year_date_range(fy)
            except (ValueError, KeyError):
                pass

        # ── Tickets (tenant-wide) ─────────────────────────────────────────
        ticket_qs = Ticket.objects.filter(tenant=tenant)
        if fy_start_ad:
            ticket_qs = ticket_qs.filter(created_at__date__gte=fy_start_ad, created_at__date__lte=fy_end_ad)

        open_tickets_count = ticket_qs.filter(status="open").count()
        in_progress_count = ticket_qs.filter(status="in_progress").count()

        sla_qs = TicketSLA.objects.filter(ticket__tenant=tenant)
        sla_breached_count = sla_qs.filter(breached=True).count()
        sla_warning_count = sla_qs.filter(
            breached=False,
            breach_at__lte=now + timezone.timedelta(hours=2),
            breach_at__gt=now,
        ).count()

        # ── Projects (tenant-wide) ────────────────────────────────────────
        project_qs = Project.objects.filter(tenant=tenant, status="active", is_deleted=False)
        if fy_start_ad:
            project_qs = project_qs.filter(created_at__date__gte=fy_start_ad, created_at__date__lte=fy_end_ad)
        active_projects_count = project_qs.count()

        # ── Coins (tenant-wide) ───────────────────────────────────────────
        coin_qs = CoinTransaction.objects.filter(tenant=tenant, status="pending")
        if fy_start_ad:
            coin_qs = coin_qs.filter(created_at__date__gte=fy_start_ad, created_at__date__lte=fy_end_ad)
        pending_coins_count = coin_qs.count()

        # ── Revenue this month (sum of paid invoices) ─────────────────────
        revenue_filter = dict(tenant=tenant, status=Invoice.STATUS_PAID)
        if fy_start_ad:
            revenue_filter['paid_at__date__gte'] = fy_start_ad
            revenue_filter['paid_at__date__lte'] = fy_end_ad
        else:
            revenue_filter['paid_at__gte'] = month_start
        revenue_result = Invoice.objects.filter(**revenue_filter).aggregate(total=Sum("total"))
        revenue_this_month = str(revenue_result["total"] or Decimal("0.00"))

        # ── Unpaid invoices (issued but not yet paid) ─────────────────────
        unpaid_qs = Invoice.objects.filter(tenant=tenant, status=Invoice.STATUS_ISSUED)
        unpaid_invoices_count = unpaid_qs.count()
        unpaid_invoices_total = str(unpaid_qs.aggregate(total=Sum("total"))["total"] or Decimal("0.00"))

        # ── New customers this month ──────────────────────────────────────
        new_customers_count = 0
        try:
            from customers.models import Customer
            new_customers_count = Customer.objects.filter(
                tenant=tenant,
                created_at__gte=month_start,
                is_deleted=False,
            ).count()
        except Exception:
            pass

        # ── Department-scoped stats (for manager dashboard) ───────────────
        dept_open_tickets = 0
        dept_sla_breached = 0
        dept_unassigned_tickets = 0
        dept_team_size = 0
        dept_id = None
        try:
            from accounts.models import TenantMembership
            membership = TenantMembership.objects.filter(
                tenant=tenant, user=request.user
            ).select_related('department').first()
            if membership and membership.department_id:
                dept_id = membership.department_id
                dept_tq = Ticket.objects.filter(tenant=tenant, department_id=dept_id)
                dept_open_tickets = dept_tq.filter(status="open").count()
                dept_unassigned_tickets = dept_tq.filter(
                    status="open", assigned_to__isnull=True
                ).count()
                dept_sla_breached = TicketSLA.objects.filter(
                    ticket__tenant=tenant,
                    ticket__department_id=dept_id,
                    breached=True,
                ).count()
                dept_team_size = TenantMembership.objects.filter(
                    tenant=tenant,
                    department_id=dept_id,
                    is_active=True,
                ).count()
        except Exception:
            pass

        # ── User-scoped stats (for staff dashboard) ───────────────────────
        my_open_tickets = Ticket.objects.filter(
            tenant=tenant, assigned_to=request.user, status="open"
        ).count()
        my_in_progress_tickets = Ticket.objects.filter(
            tenant=tenant, assigned_to=request.user, status="in_progress"
        ).count()

        my_coins_pending = str(
            CoinTransaction.objects.filter(
                tenant=tenant, staff=request.user, status="pending"
            ).aggregate(total=Sum("amount"))["total"] or Decimal("0")
        )
        my_coins_approved = str(
            CoinTransaction.objects.filter(
                tenant=tenant, staff=request.user, status="approved",
                created_at__gte=month_start,
            ).aggregate(total=Sum("amount"))["total"] or Decimal("0")
        )

        my_overdue_tasks = ProjectTask.objects.filter(
            tenant=tenant,
            assigned_to=request.user,
            status__in=["todo", "in_progress"],
            due_date__lt=now.date(),
        ).count()

        return ApiResponse.success(data={
            # Tenant-wide
            "open_tickets": open_tickets_count,
            "in_progress_tickets": in_progress_count,
            "sla_breached": sla_breached_count,
            "sla_warning": sla_warning_count,
            "active_projects": active_projects_count,
            "pending_coins": pending_coins_count,
            "revenue_this_month": revenue_this_month,
            "unpaid_invoices_count": unpaid_invoices_count,
            "unpaid_invoices_total": unpaid_invoices_total,
            "new_customers_this_month": new_customers_count,
            # Department-scoped
            "dept_id": dept_id,
            "dept_open_tickets": dept_open_tickets,
            "dept_sla_breached": dept_sla_breached,
            "dept_unassigned_tickets": dept_unassigned_tickets,
            "dept_team_size": dept_team_size,
            # User-scoped
            "my_open_tickets": my_open_tickets,
            "my_in_progress_tickets": my_in_progress_tickets,
            "my_coins_pending": my_coins_pending,
            "my_coins_approved": my_coins_approved,
            "my_overdue_tasks": my_overdue_tasks,
        })
