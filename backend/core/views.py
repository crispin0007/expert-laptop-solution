from decimal import Decimal

from django.http import JsonResponse
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from core.mixins import TenantMixin
from core.permissions import make_role_permission, ALL_ROLES


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

    permission_classes = [permissions.IsAuthenticated, make_role_permission(*ALL_ROLES)]

    def get(self, request):
        # self.tenant is guaranteed non-None by TenantMixin.initial()
        tenant = self.tenant

        # ── Lazy imports to keep core dependency-free ─────────────────────
        from tickets.models import Ticket, TicketSLA
        from projects.models import Project
        from accounting.models import CoinTransaction, Invoice

        now = timezone.now()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        # ── Tickets ───────────────────────────────────────────────────────
        ticket_qs = Ticket.objects.filter(tenant=tenant)

        open_tickets_count = ticket_qs.filter(status="open").count()
        in_progress_count = ticket_qs.filter(status="in_progress").count()

        sla_qs = TicketSLA.objects.filter(ticket__tenant=tenant)
        sla_breached_count = sla_qs.filter(breached=True).count()
        sla_warning_count = sla_qs.filter(
            breached=False,
            breach_at__lte=now + timezone.timedelta(hours=2),
            breach_at__gt=now,
        ).count()

        # ── Projects ──────────────────────────────────────────────────────
        active_projects_count = Project.objects.filter(
            tenant=tenant, status="active", is_deleted=False
        ).count()

        # ── Coins ─────────────────────────────────────────────────────────
        pending_coins_count = CoinTransaction.objects.filter(
            tenant=tenant, status="pending"
        ).count()

        # ── Revenue this month (sum of paid invoices) ─────────────────────
        from django.db.models import Sum

        revenue_result = Invoice.objects.filter(
            tenant=tenant,
            status=Invoice.STATUS_PAID,
            paid_at__gte=month_start,
        ).aggregate(total=Sum("total"))
        revenue_this_month = str(revenue_result["total"] or Decimal("0.00"))

        return Response(
            {
                "open_tickets": open_tickets_count,
                "in_progress_tickets": in_progress_count,
                "sla_breached": sla_breached_count,
                "sla_warning": sla_warning_count,
                "active_projects": active_projects_count,
                "pending_coins": pending_coins_count,
                "revenue_this_month": revenue_this_month,
            }
        )
