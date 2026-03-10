/**
 * Dashboard service hook.
 */
import { useQuery } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { DASHBOARD } from '@/api/endpoints'
import { QK } from '@/constants/queryKeys'

export interface DashboardStats {
  open_tickets: number
  in_progress_tickets: number
  sla_breached: number
  sla_warning: number
  active_projects: number
  pending_coins: number
  revenue_this_month: string
  recent_tickets: Array<{
    id: number
    ticket_number: string
    title: string
    status: string
    priority: string
    sla_breached: boolean
  }>
}

export function useDashboardStats() {
  return useQuery<DashboardStats>({
    queryKey: QK.dashboardStats,
    queryFn: () => apiClient.get(DASHBOARD.STATS).then((r) => r.data.data ?? r.data),
    staleTime: 2 * 60_000,
    refetchInterval: 5 * 60_000,
  })
}
