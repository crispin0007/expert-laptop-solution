import React, { useCallback, useMemo, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuthStore } from '@/store/authStore'
import { useTenantStore } from '@/store/tenantStore'
import { useTheme } from '@/theme/ThemeContext'
import { StatusBadge, PriorityBadge } from '@/components/ui/Badge'
import { useDrawerStore } from '@/store/drawerStore'
import { useDashboardStats, type DashboardStats } from '@/features/dashboard/useDashboard'
import { useUnreadCount } from '@/features/notifications/useNotifications'
import { usePermissions } from '@/hooks/usePermissions'
import apiClient from '@/api/client'
import { TICKETS, PROJECTS, ACCOUNTING, STAFF } from '@/api/endpoints'

// ── Types ──────────────────────────────────────────────────────────────────────

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

interface TicketRow {
  id: number
  ticket_number: string
  title: string
  status: string
  priority: string
  customer_name?: string
  customer?: string
  assigned_to_name?: string
  assigned_to?: null | string
  assigned_to_id?: null | number
  sla_breached: boolean
  sla_deadline?: string | null
}

interface ProjectRow {
  id: number
  project_number: string
  name: string
  status: string
  completion_percentage?: number | null
}

interface CoinRow {
  id: number
  staff_name: string
  coins?: number
  amount?: number
  status: string
}

interface CoinEntry {
  id: number
  coins: number
  status: string
  created_at: string
  ticket_number?: string
}

interface InvoiceRow {
  id: number
  invoice_number: string
  customer_name: string
  total: string
  due_date: string | null
  status: string
}

interface StaffMemberRow {
  id: number
  full_name: string
  email: string
  is_available?: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function toArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]
  if (!data || typeof data !== 'object') return []
  const d = data as Record<string, unknown>
  if ('data' in d && Array.isArray(d.data)) return d.data as T[]
  if ('results' in d && Array.isArray(d.results)) return d.results as T[]
  return []
}

function fmtNum(n: string | number | undefined | null): string {
  if (n === undefined || n === null) return '–'
  const num = Number(n)
  return Number.isNaN(num) ? String(n) : num.toLocaleString()
}

// ── Shared UI components ───────────────────────────────────────────────────────

interface StatCardProps {
  readonly label: string
  readonly value: number | string
  readonly sub?: string
  readonly icon: IoniconName
  readonly iconBg: string
  readonly iconColor: string
  readonly alert?: boolean
  readonly onPress?: () => void
}

function StatCard({ label, value, sub, icon, iconBg, iconColor, alert, onPress }: StatCardProps) {
  const theme = useTheme()
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.75 : 1}
      style={{
        flex: 1,
        backgroundColor: alert ? '#fff5f5' : theme.colors.surface,
        borderRadius: 14, padding: 14,
        borderWidth: alert ? 1.5 : 1,
        borderColor: alert ? '#fca5a5' : theme.colors.border,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
      }}
    >
      <View style={{
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: iconBg, alignItems: 'center', justifyContent: 'center', marginBottom: 10,
      }}>
        <Ionicons name={icon} size={17} color={iconColor} />
      </View>
      <Text style={{ fontSize: 24, fontWeight: '800', color: alert ? '#dc2626' : theme.colors.text, letterSpacing: -0.5 }}>
        {value}
      </Text>
      <Text style={{ fontSize: 11, fontWeight: '500', color: theme.colors.textMuted, marginTop: 2 }}>
        {label}
      </Text>
      {sub ? (
        <Text style={{ fontSize: 10, color: theme.colors.textMuted, marginTop: 1 }} numberOfLines={1}>{sub}</Text>
      ) : null}
    </TouchableOpacity>
  )
}

interface AlertBannerProps { readonly message: string; readonly onPress?: () => void }
function AlertBanner({ message, onPress }: AlertBannerProps) {
  return (
    <TouchableOpacity
      onPress={onPress} activeOpacity={0.8}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: '#fef2f2', borderWidth: 1.5, borderColor: '#fca5a5',
        borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
      }}
    >
      <Ionicons name="warning" size={18} color="#ef4444" />
      <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: '#b91c1c' }}>{message}</Text>
      <Ionicons name="chevron-forward" size={16} color="#ef4444" />
    </TouchableOpacity>
  )
}

interface SectionHeaderProps {
  readonly title: string
  readonly iconName: IoniconName
  readonly iconColor: string
  readonly onViewAll?: () => void
}
function SectionHeader({ title, iconName, iconColor, onViewAll }: SectionHeaderProps) {
  const theme = useTheme()
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name={iconName} size={13} color={iconColor} />
        <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase' }}>
          {title}
        </Text>
      </View>
      {onViewAll && (
        <TouchableOpacity onPress={onViewAll}>
          <Text style={{ fontSize: 12, color: theme.primary[600], fontWeight: '600' }}>View all →</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

function RevenueCard({ value }: { readonly value: string }) {
  const theme = useTheme()
  return (
    <View style={{
      backgroundColor: theme.primary[600], borderRadius: 16, padding: 20,
      flexDirection: 'row', alignItems: 'center', gap: 16,
      shadowColor: theme.primary[600], shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
    }}>
      <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="trending-up-outline" size={24} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: '500', marginBottom: 2 }}>Revenue This Month</Text>
        <Text style={{ fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.5 }}>Rs. {fmtNum(value)}</Text>
      </View>
    </View>
  )
}

function TicketCard({ ticket, onPress }: { readonly ticket: TicketRow; readonly onPress: () => void }) {
  const theme = useTheme()
  return (
    <TouchableOpacity
      onPress={onPress} activeOpacity={0.8}
      style={{
        backgroundColor: ticket.sla_breached ? '#fff5f5' : theme.colors.surface,
        borderRadius: 12, padding: 12,
        borderLeftWidth: 3,
        borderLeftColor: ticket.sla_breached ? '#ef4444' : theme.primary[400],
        borderWidth: 1,
        borderColor: ticket.sla_breached ? '#fca5a5' : theme.colors.border,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 3, elevation: 2,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ fontSize: 10, color: theme.primary[600], fontWeight: '700' }}>{ticket.ticket_number}</Text>
        {ticket.sla_breached && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Ionicons name="warning" size={10} color="#ef4444" />
            <Text style={{ fontSize: 9, color: '#ef4444', fontWeight: '700' }}>SLA BREACHED</Text>
          </View>
        )}
      </View>
      <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.text, marginBottom: 6 }} numberOfLines={1}>
        {ticket.title}
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <StatusBadge status={ticket.status as never} />
          <PriorityBadge priority={ticket.priority as never} />
        </View>
        {(ticket.customer_name || ticket.customer) ? (
          <Text style={{ fontSize: 10, color: theme.colors.textMuted }} numberOfLines={1}>
            {ticket.customer_name ?? ticket.customer}
          </Text>
        ) : null}
      </View>
      {ticket.assigned_to_name ? (
        <Text style={{ fontSize: 10, color: theme.colors.textMuted, marginTop: 4 }}>
          👤 {ticket.assigned_to_name}
        </Text>
      ) : null}
    </TouchableOpacity>
  )
}

// ── AdminBody — full org view (owner / admin) ──────────────────────────────────

interface AdminListsProps {
  readonly stats: DashboardStats | undefined
  readonly openTickets: TicketRow[]
  readonly activeProjects: ProjectRow[]
  readonly pendingCoins: CoinRow[]
  readonly unpaidInvoices: InvoiceRow[]
  readonly showTickets: boolean
  readonly showProjects: boolean
  readonly showCoins: boolean
  readonly showAccounting: boolean
}

function AdminLists({ stats, openTickets, activeProjects, pendingCoins, unpaidInvoices, showTickets, showProjects, showCoins, showAccounting }: AdminListsProps) {
  const theme = useTheme()
  const router = useRouter()
  return (
    <>
      {showTickets && (
        <View>
          <SectionHeader title={`Open Tickets (${stats?.open_tickets ?? 0})`} iconName="pricetag-outline" iconColor={theme.primary[500]} onViewAll={() => router.navigate('/(app)/(tabs)/tickets' as never)} />
          {openTickets.length === 0 ? (
            <View style={{ padding: 24, alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border }}>
              <Text style={{ fontSize: 28, marginBottom: 6 }}>🎉</Text>
              <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>No open tickets — all caught up!</Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {openTickets.map(t => (
                <TicketCard key={t.id} ticket={t} onPress={() => router.push(`/(app)/(tabs)/tickets/${t.id}` as never)} />
              ))}
            </View>
          )}
        </View>
      )}

      {showProjects && (
        <View>
          <SectionHeader title={`Active Projects (${stats?.active_projects ?? 0})`} iconName="briefcase-outline" iconColor="#059669" onViewAll={() => router.navigate('/(app)/(tabs)/projects' as never)} />
          {activeProjects.length === 0 ? (
            <View style={{ padding: 20, alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border }}>
              <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>No active projects</Text>
            </View>
          ) : (
            <View style={{ backgroundColor: theme.colors.surface, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border }}>
              {activeProjects.map((p, idx) => (
                <TouchableOpacity key={p.id} onPress={() => router.push(`/(app)/(tabs)/projects/${p.id}` as never)} activeOpacity={0.75}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: theme.colors.border }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 10, color: theme.primary[500], fontWeight: '700' }}>{p.project_number}</Text>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.text }} numberOfLines={1}>{p.name}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 12 }}>
                    {p.completion_percentage != null && <Text style={{ fontSize: 13, fontWeight: '700', color: '#059669' }}>{p.completion_percentage}%</Text>}
                    <Ionicons name="chevron-forward" size={14} color={theme.colors.textMuted} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}

      {showCoins && pendingCoins.length > 0 && (
        <View>
          <SectionHeader title="Pending Coin Approvals" iconName="star-outline" iconColor="#ca8a04" />
          <View style={{ backgroundColor: theme.colors.surface, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#fde68a' }}>
            {pendingCoins.map((c, idx) => (
              <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: '#fef3c7' }}>
                <Text style={{ fontSize: 14, fontWeight: '500', color: theme.colors.text }} numberOfLines={1}>{c.staff_name}</Text>
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#fef9c3', borderRadius: 20, borderWidth: 1, borderColor: '#fde68a' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#854d0e' }}>{c.coins ?? c.amount ?? 0} coins</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {showAccounting && unpaidInvoices.length > 0 && (
        <View>
          <SectionHeader title="Unpaid Invoices" iconName="document-text-outline" iconColor="#0d9488" />
          <View style={{ backgroundColor: theme.colors.surface, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border }}>
            {unpaidInvoices.map((inv, idx) => (
              <View key={inv.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: theme.colors.border }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 10, color: theme.primary[500], fontWeight: '700' }}>{inv.invoice_number}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '500', color: theme.colors.text }} numberOfLines={1}>{inv.customer_name}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', marginLeft: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.text }}>Rs. {fmtNum(inv.total)}</Text>
                  {inv.due_date ? <Text style={{ fontSize: 10, color: theme.colors.textMuted }}>Due {inv.due_date}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        </View>
      )}
    </>
  )
}

function AdminBody({ stats }: { readonly stats: DashboardStats | undefined }) {
  const theme = useTheme()
  const router = useRouter()
  const hasModule = useAuthStore((s) => s.hasModule)
  const { can } = usePermissions()

  const showTickets    = hasModule('tickets') && can('tickets.view')
  const showProjects   = hasModule('projects') && can('projects.view')
  const showAccounting = hasModule('accounting') && can('accounting.view')
  const showCoins      = hasModule('accounting') && can('accounting.coins.approve')

  const { data: openTicketsRaw } = useQuery({
    queryKey: ['dash-open-tickets'],
    queryFn: () => apiClient.get(TICKETS.LIST, { params: { status: 'open', page_size: 8 } }).then(r => r.data),
    enabled: showTickets, staleTime: 60_000,
  })
  const { data: activeProjectsRaw } = useQuery({
    queryKey: ['dash-active-projects'],
    queryFn: () => apiClient.get(PROJECTS.LIST, { params: { status: 'active', page_size: 6 } }).then(r => r.data),
    enabled: showProjects, staleTime: 60_000,
  })
  const { data: pendingCoinsRaw } = useQuery({
    queryKey: ['dash-pending-coins'],
    queryFn: () => apiClient.get(ACCOUNTING.COINS, { params: { status: 'pending', page_size: 5 } }).then(r => r.data),
    enabled: showCoins, staleTime: 60_000,
  })
  const { data: unpaidInvoicesRaw } = useQuery({
    queryKey: ['dash-unpaid-invoices'],
    queryFn: () => apiClient.get(ACCOUNTING.INVOICES, { params: { status: 'issued', page_size: 5 } }).then(r => r.data),
    enabled: showAccounting, staleTime: 60_000,
  })

  const openTickets    = useMemo(() => toArray<TicketRow>(openTicketsRaw), [openTicketsRaw])
  const activeProjects = useMemo(() => toArray<ProjectRow>(activeProjectsRaw), [activeProjectsRaw])
  const pendingCoins   = useMemo(() => toArray<CoinRow>(pendingCoinsRaw), [pendingCoinsRaw])
  const unpaidInvoices = useMemo(() => toArray<InvoiceRow>(unpaidInvoicesRaw), [unpaidInvoicesRaw])

  const breachedCount = stats?.sla_breached ?? 0
  const warningCount  = stats?.sla_warning ?? 0

  const slaMsg = (() => {
    const bSuffix = breachedCount === 1 ? '' : 's'
    const b = breachedCount > 0 ? `${breachedCount} ticket${bSuffix} breached SLA.` : ''
    const w = warningCount  > 0 ? `${warningCount} approaching breach.` : ''
    return [b, w].filter(Boolean).join(' ')
  })()

  return (
    <>
      {showTickets && (breachedCount > 0 || warningCount > 0) && (
        <AlertBanner message={slaMsg} onPress={() => router.navigate('/(app)/(tabs)/tickets' as never)} />
      )}

      {showAccounting && (
        <>
          <RevenueCard value={stats?.revenue_this_month ?? '0.00'} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <StatCard
              label="Unpaid Invoices"
              value={stats?.unpaid_invoices_count ?? 0}
              sub={(stats?.unpaid_invoices_count ?? 0) > 0 ? `Rs. ${fmtNum(stats?.unpaid_invoices_total ?? 0)} outstanding` : undefined}
              icon="document-text-outline"
              iconBg={(stats?.unpaid_invoices_count ?? 0) > 0 ? '#fff7ed' : '#f9fafb'}
              iconColor={(stats?.unpaid_invoices_count ?? 0) > 0 ? '#f97316' : '#9ca3af'}
              alert={(stats?.unpaid_invoices_count ?? 0) > 0}
            />
            <StatCard
              label="New Customers" value={stats?.new_customers_this_month ?? 0} sub="this month"
              icon="person-add-outline" iconBg="#f5f3ff" iconColor="#7c3aed"
              onPress={() => router.navigate('/(app)/(tabs)/customers' as never)}
            />
          </View>
          {(stats?.pending_coins ?? 0) > 0 && (
            <View style={{ backgroundColor: '#fefce8', borderWidth: 1, borderColor: '#fde68a', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: '#fef9c3', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="star-outline" size={22} color="#ca8a04" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: '#854d0e', fontWeight: '600' }}>Coins Pending Approval</Text>
                <Text style={{ fontSize: 22, fontWeight: '800', color: '#78350f' }}>{stats?.pending_coins}</Text>
              </View>
            </View>
          )}
        </>
      )}

      {showTickets && (
        <>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <StatCard label="Open Tickets" value={stats?.open_tickets ?? 0} icon="pricetag-outline" iconBg={`${theme.primary[500]}22`} iconColor={theme.primary[600]} onPress={() => router.navigate('/(app)/(tabs)/tickets' as never)} />
            <StatCard label="In Progress" value={stats?.in_progress_tickets ?? 0} icon="time-outline" iconBg="#fef3c7" iconColor="#d97706" onPress={() => router.navigate('/(app)/(tabs)/tickets' as never)} />
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <StatCard label="SLA Breached" value={breachedCount} icon="alert-circle-outline" iconBg={breachedCount > 0 ? '#fee2e2' : '#f9fafb'} iconColor={breachedCount > 0 ? '#dc2626' : '#9ca3af'} alert={breachedCount > 0} onPress={() => router.navigate('/(app)/(tabs)/tickets' as never)} />
            <StatCard label="SLA Warning" value={warningCount} icon="shield-outline" iconBg={warningCount > 0 ? '#fff7ed' : '#f9fafb'} iconColor={warningCount > 0 ? '#ea580c' : '#9ca3af'} onPress={() => router.navigate('/(app)/(tabs)/tickets' as never)} />
          </View>
        </>
      )}

      {showProjects && (
        <>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <StatCard label="Active Projects" value={stats?.active_projects ?? 0} icon="briefcase-outline" iconBg="#ecfdf5" iconColor="#059669" onPress={() => router.navigate('/(app)/(tabs)/projects' as never)} />
            <StatCard label="Pending Tasks" value={stats?.pending_tasks ?? 0} icon="list-outline" iconBg="#f0f9ff" iconColor="#0284c7" onPress={() => router.navigate('/(app)/(tabs)/projects' as never)} />
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <StatCard label="Overdue Tasks" value={stats?.overdue_tasks ?? 0} icon="calendar-outline" iconBg={(stats?.overdue_tasks ?? 0) > 0 ? '#fee2e2' : '#f9fafb'} iconColor={(stats?.overdue_tasks ?? 0) > 0 ? '#dc2626' : '#9ca3af'} alert={(stats?.overdue_tasks ?? 0) > 0} onPress={() => router.navigate('/(app)/(tabs)/projects' as never)} />
            <StatCard label="Completed" value={stats?.completed_projects_month ?? 0} sub="this month" icon="checkmark-circle-outline" iconBg="#f0fdfa" iconColor="#0d9488" onPress={() => router.navigate('/(app)/(tabs)/projects' as never)} />
          </View>
        </>
      )}

      <AdminLists
        stats={stats}
        openTickets={openTickets}
        activeProjects={activeProjects}
        pendingCoins={pendingCoins}
        unpaidInvoices={unpaidInvoices}
        showTickets={showTickets}
        showProjects={showProjects}
        showCoins={showCoins}
        showAccounting={showAccounting}
      />

      <QuickActions />
    </>
  )
}

// ── ManagerBody — department-scoped (manager role) ─────────────────────────────

function ManagerBody({ stats }: { readonly stats: DashboardStats | undefined }) {
  const theme = useTheme()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const hasModule = useAuthStore((s) => s.hasModule)
  const { can } = usePermissions()

  const deptId   = user?.department_id ?? null
  const deptName = user?.department_name ?? 'Your Department'

  const showTickets  = hasModule('tickets') && can('tickets.view')
  const showProjects = hasModule('projects') && can('projects.view')

  const { data: deptTicketsRaw } = useQuery({
    queryKey: ['dash-mgr-dept-tickets', deptId],
    queryFn: () => apiClient.get(TICKETS.LIST, { params: { department: deptId, status: 'open', page_size: 10 } }).then(r => r.data),
    enabled: showTickets && !!deptId, staleTime: 60_000,
  })
  const { data: allDeptOpenRaw } = useQuery({
    queryKey: ['dash-mgr-unassigned', deptId],
    queryFn: () => apiClient.get(TICKETS.LIST, { params: { department: deptId, status: 'open', page_size: 50 } }).then(r => r.data),
    enabled: showTickets && !!deptId, staleTime: 60_000,
  })
  const { data: activeProjectsRaw } = useQuery({
    queryKey: ['dash-mgr-projects'],
    queryFn: () => apiClient.get(PROJECTS.LIST, { params: { status: 'active', page_size: 5 } }).then(r => r.data),
    enabled: showProjects, staleTime: 60_000,
  })
  const { data: staffRaw } = useQuery({
    queryKey: ['dash-mgr-staff', deptId],
    queryFn: () => apiClient.get(STAFF.LIST, { params: { department: deptId, page_size: 20 } }).then(r => r.data),
    enabled: !!deptId && can('staff.view'), staleTime: 120_000,
  })

  const deptTickets    = useMemo(() => toArray<TicketRow>(deptTicketsRaw), [deptTicketsRaw])
  const allDeptOpen    = useMemo(() => toArray<TicketRow>(allDeptOpenRaw), [allDeptOpenRaw])
  const unassigned     = useMemo(
    () => allDeptOpen.filter((t: TicketRow) => !t.assigned_to && !t.assigned_to_id && !t.assigned_to_name),
    [allDeptOpen],
  )
  const activeProjects = useMemo(() => toArray<ProjectRow>(activeProjectsRaw), [activeProjectsRaw])
  const teamMembers    = useMemo(() => toArray<StaffMemberRow>(staffRaw), [staffRaw])

  const deptBreached   = stats?.dept_sla_breached ?? 0
  const deptUnassigned = stats?.dept_unassigned_tickets ?? 0

  return (
    <>
      {showTickets && deptBreached > 0 && (
        <AlertBanner
          message={`${deptBreached} ticket${deptBreached === 1 ? '' : 's'} in ${deptName} have breached SLA.`}
          onPress={() => router.navigate('/(app)/(tabs)/tickets' as never)}
        />
      )}

      {showTickets && (
        <>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <StatCard
              label="Open in Dept" value={stats?.dept_open_tickets ?? 0}
              icon="pricetag-outline" iconBg={`${theme.primary[500]}22`} iconColor={theme.primary[600]}
              onPress={() => router.navigate('/(app)/(tabs)/tickets' as never)}
            />
            <StatCard
              label="SLA Breached" value={deptBreached}
              icon="alert-circle-outline"
              iconBg={deptBreached > 0 ? '#fee2e2' : '#f9fafb'}
              iconColor={deptBreached > 0 ? '#dc2626' : '#9ca3af'}
              alert={deptBreached > 0}
              onPress={() => router.navigate('/(app)/(tabs)/tickets' as never)}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <StatCard
              label="Unassigned" value={deptUnassigned}
              icon="person-remove-outline"
              iconBg={deptUnassigned > 0 ? '#fff7ed' : '#f9fafb'}
              iconColor={deptUnassigned > 0 ? '#ea580c' : '#9ca3af'}
              alert={deptUnassigned > 0}
              onPress={() => router.navigate('/(app)/(tabs)/tickets' as never)}
            />
            <StatCard
              label="Team Members" value={stats?.dept_team_size ?? teamMembers.length}
              icon="people-outline" iconBg="#f5f3ff" iconColor="#7c3aed"
            />
          </View>
        </>
      )}

      {showProjects && (
        <>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <StatCard label="Active Projects" value={stats?.active_projects ?? 0} icon="briefcase-outline" iconBg="#ecfdf5" iconColor="#059669" onPress={() => router.navigate('/(app)/(tabs)/projects' as never)} />
            <StatCard label="Pending Tasks" value={stats?.pending_tasks ?? 0} icon="list-outline" iconBg="#f0f9ff" iconColor="#0284c7" onPress={() => router.navigate('/(app)/(tabs)/projects' as never)} />
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <StatCard label="Overdue Tasks" value={stats?.overdue_tasks ?? 0} icon="calendar-outline" iconBg={(stats?.overdue_tasks ?? 0) > 0 ? '#fee2e2' : '#f9fafb'} iconColor={(stats?.overdue_tasks ?? 0) > 0 ? '#dc2626' : '#9ca3af'} alert={(stats?.overdue_tasks ?? 0) > 0} onPress={() => router.navigate('/(app)/(tabs)/projects' as never)} />
            <StatCard label="Completed" value={stats?.completed_projects_month ?? 0} sub="this month" icon="checkmark-circle-outline" iconBg="#f0fdfa" iconColor="#0d9488" />
          </View>
        </>
      )}

      {showTickets && (stats?.sla_warning ?? 0) > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 }}>
          <Ionicons name="time-outline" size={16} color="#ea580c" />
          <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: '#9a3412' }}>
            {stats!.sla_warning} ticket{stats!.sla_warning === 1 ? '' : 's'} approaching SLA breach.
          </Text>
        </View>
      )}

      {showTickets && (
        <View>
          <SectionHeader title={`${deptName} — Open Tickets`} iconName="pricetag-outline" iconColor={theme.primary[500]} onViewAll={() => router.navigate('/(app)/(tabs)/tickets' as never)} />
          {deptTickets.length === 0 ? (
            <View style={{ padding: 24, alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border }}>
              <Text style={{ fontSize: 28, marginBottom: 6 }}>🎉</Text>
              <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>No open tickets in this department</Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {deptTickets.map(t => (
                <TicketCard key={t.id} ticket={t} onPress={() => router.push(`/(app)/(tabs)/tickets/${t.id}` as never)} />
              ))}
            </View>
          )}
        </View>
      )}

      {showTickets && unassigned.length > 0 && (
        <View>
          <SectionHeader title={`Unassigned (${unassigned.length})`} iconName="person-remove-outline" iconColor="#ea580c" onViewAll={() => router.navigate('/(app)/(tabs)/tickets' as never)} />
          <View style={{ backgroundColor: theme.colors.surface, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#fed7aa' }}>
            {unassigned.slice(0, 6).map((t, idx) => (
              <TouchableOpacity key={t.id} onPress={() => router.push(`/(app)/(tabs)/tickets/${t.id}` as never)} activeOpacity={0.75}
                style={{ paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: '#fff7ed' }}>
                <Text style={{ fontSize: 10, color: theme.primary[500], fontWeight: '700' }}>{t.ticket_number}</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.text }} numberOfLines={1}>{t.title}</Text>
                {(t.customer_name ?? t.customer) ? <Text style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 2 }}>{t.customer_name ?? t.customer}</Text> : null}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {showProjects && activeProjects.length > 0 && (
        <View>
          <SectionHeader title={`Active Projects (${stats?.active_projects ?? 0})`} iconName="briefcase-outline" iconColor="#059669" onViewAll={() => router.navigate('/(app)/(tabs)/projects' as never)} />
          <View style={{ backgroundColor: theme.colors.surface, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border }}>
            {activeProjects.map((p, idx) => (
              <TouchableOpacity key={p.id} onPress={() => router.push(`/(app)/(tabs)/projects/${p.id}` as never)} activeOpacity={0.75}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: theme.colors.border }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 10, color: theme.primary[500], fontWeight: '700' }}>{p.project_number}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.text }} numberOfLines={1}>{p.name}</Text>
                </View>
                {p.completion_percentage != null && <Text style={{ fontSize: 13, fontWeight: '700', color: '#059669' }}>{p.completion_percentage}%</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {teamMembers.length > 0 && (
        <View>
          <SectionHeader title={`Team (${teamMembers.length})`} iconName="people-outline" iconColor="#7c3aed" />
          <View style={{ backgroundColor: theme.colors.surface, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border }}>
            {teamMembers.slice(0, 8).map((s, idx) => (
              <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: theme.colors.border }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#ede9fe', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#7c3aed' }}>{(s.full_name || s.email).charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.text }} numberOfLines={1}>{s.full_name || s.email}</Text>
                  {s.full_name ? <Text style={{ fontSize: 11, color: theme.colors.textMuted }} numberOfLines={1}>{s.email}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {!deptId && (
        <View style={{ backgroundColor: '#fefce8', borderWidth: 1, borderColor: '#fde68a', borderRadius: 14, padding: 16 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#854d0e', marginBottom: 4 }}>No department assigned</Text>
          <Text style={{ fontSize: 12, color: '#92400e' }}>Department-scoped stats appear once you are assigned to a department.</Text>
        </View>
      )}

      <QuickActions />
    </>
  )
}

// ── StaffBody — personal workspace (staff / viewer / custom) ───────────────────

function StaffBody({ stats }: { readonly stats: DashboardStats | undefined }) {
  const theme = useTheme()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const hasModule = useAuthStore((s) => s.hasModule)
  const { can } = usePermissions()

  const userId = user?.id ?? 0
  const deptId = user?.department_id ?? null
  const deptName = user?.department_name ?? null

  const canViewTickets    = hasModule('tickets') && can('tickets.view')
  const canViewAccounting = hasModule('accounting') && can('accounting.view')

  const { data: myTicketsRaw } = useQuery({
    queryKey: ['dash-staff-my-tickets', userId],
    queryFn: () =>
      apiClient.get(TICKETS.LIST, {
        params: { assigned_to: userId, status: 'open,in_progress', page_size: 15, ordering: 'sla_deadline' },
      }).then(r => r.data),
    enabled: canViewTickets && !!userId, staleTime: 60_000,
  })
  const { data: unassignedRaw } = useQuery({
    queryKey: ['dash-staff-unassigned', deptId],
    queryFn: () =>
      apiClient.get(TICKETS.LIST, { params: { department: deptId, status: 'open', page_size: 20 } }).then(r => r.data),
    enabled: canViewTickets && !!deptId, staleTime: 60_000,
  })
  const { data: coinsRaw } = useQuery({
    queryKey: ['dash-staff-coins', userId],
    queryFn: () => apiClient.get(ACCOUNTING.COINS_STAFF_HISTORY(userId)).then(r => r.data),
    enabled: canViewAccounting && !!userId, staleTime: 120_000,
  })

  const myTickets  = useMemo(() => toArray<TicketRow>(myTicketsRaw), [myTicketsRaw])
  const allDeptOpen = useMemo(() => toArray<TicketRow>(unassignedRaw), [unassignedRaw])
  const unassigned = useMemo(
    () => allDeptOpen.filter((t: TicketRow) => !t.assigned_to && !t.assigned_to_id && !t.assigned_to_name),
    [allDeptOpen],
  )
  const coinHistory = useMemo(() => toArray<CoinEntry>(coinsRaw).slice(0, 8), [coinsRaw])

  const myBreached = stats?.my_sla_breached ?? 0

  const COIN_STATUS: Record<string, { bg: string; color: string }> = {
    pending:  { bg: '#fef9c3', color: '#854d0e' },
    approved: { bg: '#f0fdf4', color: '#166534' },
    rejected: { bg: '#fef2f2', color: '#991b1b' },
  }

  return (
    <>
      {canViewTickets && myBreached > 0 && (
        <AlertBanner
          message={`You have ${myBreached} ticket${myBreached === 1 ? '' : 's'} with a breached SLA — action required.`}
          onPress={() => router.navigate('/(app)/(tabs)/tickets' as never)}
        />
      )}

      {canViewTickets && (
        <>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <StatCard label="My Open Tickets" value={stats?.my_open_tickets ?? 0} icon="pricetag-outline" iconBg={`${theme.primary[500]}22`} iconColor={theme.primary[600]} onPress={() => router.navigate('/(app)/(tabs)/tickets' as never)} />
            <StatCard label="In Progress" value={stats?.my_in_progress_tickets ?? 0} icon="time-outline" iconBg="#fef3c7" iconColor="#d97706" onPress={() => router.navigate('/(app)/(tabs)/tickets' as never)} />
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <StatCard label="SLA Breached" value={myBreached} icon="alert-circle-outline" iconBg={myBreached > 0 ? '#fee2e2' : '#f9fafb'} iconColor={myBreached > 0 ? '#dc2626' : '#9ca3af'} alert={myBreached > 0} onPress={() => router.navigate('/(app)/(tabs)/tickets' as never)} />
            <StatCard label="Today's Tickets" value={stats?.my_tickets_today ?? 0} icon="calendar-outline" iconBg="#f0f9ff" iconColor="#0284c7" onPress={() => router.navigate('/(app)/(tabs)/tickets' as never)} />
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <StatCard label="Resolved This Month" value={stats?.my_resolved_this_month ?? 0} icon="checkmark-circle-outline" iconBg="#ecfdf5" iconColor="#059669" />
            <StatCard label="Overdue Tasks" value={stats?.my_overdue_tasks ?? 0} icon="calendar-outline" iconBg={(stats?.my_overdue_tasks ?? 0) > 0 ? '#fff7ed' : '#f9fafb'} iconColor={(stats?.my_overdue_tasks ?? 0) > 0 ? '#ea580c' : '#9ca3af'} alert={(stats?.my_overdue_tasks ?? 0) > 0} />
          </View>
        </>
      )}

      {canViewAccounting && (
        <View style={{ backgroundColor: '#fefce8', borderWidth: 1, borderColor: '#fde68a', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: '#fef9c3', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="star-outline" size={22} color="#ca8a04" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, color: '#854d0e', fontWeight: '600', marginBottom: 4 }}>My Coins</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#fef9c3', borderRadius: 20, borderWidth: 1, borderColor: '#fde68a' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#854d0e' }}>{fmtNum(stats?.my_coins_pending)} pending</Text>
              </View>
              <View style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#f0fdf4', borderRadius: 20, borderWidth: 1, borderColor: '#bbf7d0' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#166534' }}>{fmtNum(stats?.my_coins_approved)} approved</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {canViewTickets && (
        <View>
          <SectionHeader title="My Active Tickets" iconName="pricetag-outline" iconColor={theme.primary[500]} onViewAll={() => router.navigate('/(app)/(tabs)/tickets' as never)} />
          {myTickets.length === 0 ? (
            <View style={{ padding: 24, alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border }}>
              <Text style={{ fontSize: 28, marginBottom: 6 }}>✅</Text>
              <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>No active tickets assigned to you</Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {myTickets.map(t => (
                <TicketCard key={t.id} ticket={t} onPress={() => router.push(`/(app)/(tabs)/tickets/${t.id}` as never)} />
              ))}
            </View>
          )}
        </View>
      )}

      {canViewTickets && unassigned.length > 0 && (
        <View>
          <SectionHeader
            title={deptName ? `Dept. Unassigned (${deptName})` : 'Dept. Unassigned'}
            iconName="inbox-outline"
            iconColor="#9ca3af"
            onViewAll={() => router.navigate('/(app)/(tabs)/tickets' as never)}
          />
          <View style={{ backgroundColor: theme.colors.surface, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border }}>
            {unassigned.slice(0, 6).map((t, idx) => (
              <TouchableOpacity key={t.id} onPress={() => router.push(`/(app)/(tabs)/tickets/${t.id}` as never)} activeOpacity={0.75}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: theme.colors.border }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.sla_breached ? '#ef4444' : '#f97316', marginTop: 2 }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: theme.colors.text }} numberOfLines={1}>{t.ticket_number} — {t.title}</Text>
                  {(t.customer_name ?? t.customer) ? <Text style={{ fontSize: 10, color: theme.colors.textMuted }}>{t.customer_name ?? t.customer}</Text> : null}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {canViewAccounting && coinHistory.length > 0 && (
        <View>
          <SectionHeader title="Coin History" iconName="star-outline" iconColor="#ca8a04" />
          <View style={{ backgroundColor: theme.colors.surface, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border }}>
            {coinHistory.map((c, idx) => (
              <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: theme.colors.border }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>{new Date(c.created_at).toLocaleDateString()}</Text>
                  {c.ticket_number ? <Text style={{ fontSize: 11, color: theme.colors.textMuted }}>{c.ticket_number}</Text> : null}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: theme.colors.text }}>+{c.coins}</Text>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: COIN_STATUS[c.status]?.bg ?? '#f9fafb' }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: COIN_STATUS[c.status]?.color ?? '#6b7280' }}>{c.status}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      <QuickActions />
    </>
  )
}

// ── Quick actions (shared across all roles) ────────────────────────────────────

function QuickActions() {
  const theme = useTheme()
  const router = useRouter()
  const hasModule = useAuthStore((s) => s.hasModule)
  const { can } = usePermissions()
  return (
    <View>
      <SectionHeader title="Quick Actions" iconName="flash-outline" iconColor={theme.primary[500]} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {[
          {
            icon: 'add-circle-outline' as IoniconName,
            label: 'New Ticket',
            show: hasModule('tickets') && can('tickets.create'),
            action: () => router.push('/(app)/tickets/new' as never),
          },
          {
            icon: 'list-outline' as IoniconName,
            label: 'All Tickets',
            show: hasModule('tickets') && can('tickets.view'),
            action: () => router.navigate('/(app)/(tabs)/tickets' as never),
          },
          {
            icon: 'people-outline' as IoniconName,
            label: 'Customers',
            show: can('customers.view'),
            action: () => router.navigate('/(app)/(tabs)/customers' as never),
          },
        ]
          .filter(a => a.show)
          .map(({ icon, label, action }) => (
            <TouchableOpacity
              key={label}
              onPress={action}
              style={{
                flex: 1,
                backgroundColor: theme.colors.surface,
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: 'center',
                gap: 6,
                borderWidth: 1,
                borderColor: theme.colors.border,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05,
                shadowRadius: 4,
                elevation: 2,
              }}
            >
              <Ionicons name={icon} size={22} color={theme.primary[600]} />
              <Text style={{ fontSize: 11, fontWeight: '600', color: theme.colors.textSecondary }}>{label}</Text>
            </TouchableOpacity>
          ))}
      </View>
    </View>
  )
}

// ── DashboardScreen — shell + role dispatch ────────────────────────────────────

interface DashboardBodyProps {
  readonly stats: DashboardStats | undefined
  readonly isAdminView: boolean
  readonly isManagerView: boolean
}
function DashboardBody({ stats, isAdminView, isManagerView }: DashboardBodyProps) {
  if (isAdminView)   return <AdminBody stats={stats} />
  if (isManagerView) return <ManagerBody stats={stats} />
  return <StaffBody stats={stats} />
}

export default function DashboardScreen() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const tenant = useTenantStore((s) => s.tenant)
  const queryClient = useQueryClient()

  const { data: stats, isLoading, refetch } = useDashboardStats()
  const { data: unread } = useUnreadCount()

  const [refreshing, setRefreshing] = useState(false)
  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([
      refetch(),
      queryClient.invalidateQueries({ predicate: q => typeof q.queryKey[0] === 'string' && q.queryKey[0].startsWith('dash-') }),
    ])
    setRefreshing(false)
  }, [refetch, queryClient])

  const role = user?.role ?? 'staff'
  const isAdminView   = role === 'owner' || role === 'admin' || !!(user?.is_superadmin)
  const isManagerView = role === 'manager'

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  })()

  let roleLabel: string | null = null
  if (!isAdminView) {
    roleLabel = isManagerView ? '📋 Manager view' : '👤 My workspace'
  }

  const unreadCount = (unread as Record<string, number>)?.unread_count
    ?? (unread as Record<string, number>)?.count
    ?? 0

  return (
    <View style={{ flex: 1 }}>
      {/* Floating drawer button */}
      <TouchableOpacity
        onPress={() => useDrawerStore.getState().toggle()}
        style={{
          position: 'absolute', top: insets.top + 8, left: 16, zIndex: 100,
          width: 46, height: 46, borderRadius: 13, backgroundColor: '#fff',
          alignItems: 'center', justifyContent: 'center',
          shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.18, shadowRadius: 6, elevation: 8,
        }}
      >
        <Ionicons name="menu" size={26} color={theme.primary[600]} />
      </TouchableOpacity>

      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.primary[500]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 16,
          paddingBottom: 32,
          backgroundColor: theme.primary[600],
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <View style={{ width: 46, height: 46 }} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.8)', letterSpacing: 0.5, textTransform: 'uppercase' }}>
              {tenant?.name ?? 'NEXUS BMS'}
            </Text>
            <TouchableOpacity
              onPress={() => router.push('/(app)/notifications')}
              style={{ width: 42, height: 42, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="notifications-outline" size={22} color="#fff" />
              {unreadCount > 0 && (
                <View style={{
                  position: 'absolute', top: 8, right: 8,
                  width: 8, height: 8, borderRadius: 4,
                  backgroundColor: '#f87171',
                  borderWidth: 1.5, borderColor: theme.primary[600],
                }} />
              )}
            </TouchableOpacity>
          </View>

          <Text style={{ fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: -0.5 }}>
            {greeting}, {user?.first_name ?? 'there'} 👋
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 }}>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </Text>
            {roleLabel ? (
              <View style={{ paddingHorizontal: 8, paddingVertical: 2, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20 }}>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: '600' }}>{roleLabel}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* ── Content ── */}
        <View style={{ paddingHorizontal: 16, marginTop: -16, gap: 16 }}>
          {isLoading ? (
            <View style={{ alignItems: 'center', paddingTop: 80 }}>
              <ActivityIndicator size="large" color={theme.primary[500]} />
            </View>
          ) : (
            <DashboardBody stats={stats} isAdminView={isAdminView} isManagerView={isManagerView} />
          )}
        </View>
      </ScrollView>
    </View>
  )
}
