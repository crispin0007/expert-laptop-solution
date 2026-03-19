/**
 * Dashboard service hook.
 */
import { useQuery } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { DASHBOARD } from '@/api/endpoints'
import { QK } from '@/constants/queryKeys'

export interface DashboardStats {
  // ── Admin / global KPIs ──────────────────────────────────────────────────
  open_tickets?: number
  in_progress_tickets?: number
  sla_breached?: number
  sla_warning?: number
  active_projects?: number
  pending_tasks?: number
  overdue_tasks?: number
  completed_projects_month?: number
  pending_coins?: number
  revenue_this_month?: string
  unpaid_invoices_count?: number
  unpaid_invoices_total?: string
  new_customers_this_month?: number
  recent_tickets?: Array<{
    id: number
    ticket_number: string
    title: string
    status: string
    priority: string
    sla_breached: boolean
  }>

  // ── Manager / dept-scoped KPIs ───────────────────────────────────────────
  dept_open_tickets?: number
  dept_sla_breached?: number
  dept_unassigned_tickets?: number
  dept_team_size?: number

  // ── Staff / personal KPIs ────────────────────────────────────────────────
  my_open_tickets?: number
  my_in_progress_tickets?: number
  my_sla_breached?: number
  my_tickets_today?: number
  my_total_tickets?: number
  my_resolved_this_month?: number
  my_overdue_tasks?: number
  my_coins_pending?: string | number
  my_coins_approved?: string | number
}

export function useDashboardStats() {
  return useQuery<DashboardStats>({
    queryKey: QK.dashboardStats,
    queryFn: () => apiClient.get(DASHBOARD.STATS).then((r) => r.data.data ?? r.data),
    staleTime: 2 * 60_000,
    refetchInterval: 5 * 60_000,
  })
}
