import React, { useState, useCallback, useMemo } from 'react'
import {
  View, Text, TouchableOpacity, TextInput,
  ActivityIndicator, ScrollView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list'
// FlashList has a known type incompatibility with react-native's StyleProp — cast to bypass
const TypedFlashList = FlashList as React.ComponentType<any>
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { formatDistanceToNowStrict } from 'date-fns'
import { useTheme } from '@/theme/ThemeContext'
import { StatusBadge, PriorityBadge, SlaBadge } from '@/components/ui/Badge'
import { RoleGuard } from '@/guards/RoleGuard'
import { ModuleGuard, ModuleLockedScreen } from '@/guards/ModuleGuard'
import { DrawerToggle } from '@/components/ui/AppDrawer'
import { useTicketList, type Ticket, type TicketFilters } from '@/features/tickets/useTickets'
import { usePermissions } from '@/hooks/usePermissions'

// ── Priority colours ──────────────────────────────────────────────────────────

const PRIORITY_DOT: Record<string, string> = {
  low: '#16a34a',
  medium: '#2563eb',
  high: '#ea580c',
  critical: '#dc2626',
}

const PRIORITY_BORDER: Record<string, string> = {
  low: '#bbf7d0',
  medium: '#bfdbfe',
  high: '#fed7aa',
  critical: '#fecaca',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeDate(iso: string): string {
  try {
    return formatDistanceToNowStrict(new Date(iso), { addSuffix: true })
  } catch {
    return ''
  }
}

// ── Stats Card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon, color, bg, onPress, active,
}: {
  label: string; value: number; icon: string; color: string; bg: string; onPress?: () => void; active?: boolean
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      style={{
        flex: 1,
        backgroundColor: active ? color : bg,
        borderRadius: 14,
        padding: 12,
        alignItems: 'center',
        gap: 4,
        borderWidth: active ? 0 : 1.5,
        borderColor: active ? 'transparent' : color + '40',
      }}
    >
      <Ionicons name={icon as never} size={18} color={active ? '#fff' : color} />
      <Text style={{ fontSize: 20, fontWeight: '800', color: active ? '#fff' : color }}>{value}</Text>
      <Text style={{ fontSize: 10, fontWeight: '600', color: active ? '#ffffffcc' : color, letterSpacing: 0.3, textAlign: 'center' }}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}



// ── Ticket Card ───────────────────────────────────────────────────────────────

function TicketCard({ ticket, onPress }: { ticket: Ticket; onPress: () => void }) {
  const theme = useTheme()
  const dotColor = PRIORITY_DOT[ticket.priority] ?? theme.colors.border
  const borderColor = ticket.sla_breached
    ? '#fca5a5'
    : PRIORITY_BORDER[ticket.priority] ?? theme.colors.border

  const assigneeInitial = ticket.assigned_to_name
    ? ticket.assigned_to_name.trim()[0]?.toUpperCase()
    : null

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        backgroundColor: theme.colors.surface,
        marginHorizontal: 16,
        marginVertical: 5,
        borderRadius: 16,
        borderWidth: 1,
        borderColor,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07,
        shadowRadius: 6,
        elevation: 3,
        overflow: 'hidden',
      }}
    >
      {/* Top strip */}
      <View style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingTop: 12,
        paddingBottom: 6,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotColor }} />
          <Text style={{ fontSize: 11, color: theme.colors.textMuted, fontWeight: '700', letterSpacing: 0.4 }}>
            {ticket.ticket_number}
          </Text>
          {ticket.ticket_type_name ? (
            <View style={{
              backgroundColor: theme.primary[50],
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderRadius: 6,
            }}>
              <Text style={{ fontSize: 10, color: theme.primary[700], fontWeight: '600' }}>
                {ticket.ticket_type_name}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {ticket.sla_deadline && (
            <SlaBadge deadline={ticket.sla_deadline} breached={ticket.sla_breached} />
          )}
          {assigneeInitial ? (
            <View style={{
              width: 26, height: 26, borderRadius: 13,
              backgroundColor: theme.primary[100],
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 1.5, borderColor: theme.primary[200],
            }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: theme.primary[700] }}>{assigneeInitial}</Text>
            </View>
          ) : (
            <View style={{
              width: 26, height: 26, borderRadius: 13,
              backgroundColor: theme.colors.background,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: theme.colors.border, borderStyle: 'dashed',
            }}>
              <Ionicons name="person-outline" size={12} color={theme.colors.textMuted} />
            </View>
          )}
        </View>
      </View>

      {/* Title & customer */}
      <View style={{ paddingHorizontal: 14, paddingBottom: 10 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: theme.colors.text, lineHeight: 20, marginBottom: 3 }} numberOfLines={2}>
          {ticket.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="person-outline" size={11} color={theme.colors.textMuted} />
          <Text style={{ fontSize: 12, color: theme.colors.textMuted, flex: 1 }} numberOfLines={1}>
            {ticket.customer_name}
            {ticket.assigned_to_name ? ` · ${ticket.assigned_to_name}` : ' · Unassigned'}
          </Text>
        </View>
      </View>

      {/* Footer strip */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 14, paddingBottom: 12,
      }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <StatusBadge status={ticket.status as never} />
          <PriorityBadge priority={ticket.priority as never} />
        </View>
        <Text style={{ fontSize: 11, color: theme.colors.textMuted, fontWeight: '500' }}>
          {relativeDate(ticket.created_at)}
        </Text>
      </View>
    </TouchableOpacity>
  )
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function TicketsScreen() {
  const theme = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { isStaff } = usePermissions()
  // Viewers (field workers) only see their assigned tickets — enforce at mount
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [myTickets, setMyTickets] = useState(!isStaff)

  const filters: TicketFilters = {
    ...(search ? { search } : {}),
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(myTickets ? { assigned_to: 'me' as const } : {}),
  }

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
    isRefetching,
  } = useTicketList(filters)

  const allTickets = useMemo(
    () => (data?.pages ?? []).flatMap((p) => p?.results ?? []).filter(Boolean),
    [data],
  )

  // Stats — computed from the first page of unfiltered data as a snapshot
  const { data: statsData } = useTicketList({})
  const allUnfiltered = useMemo(
    () => (statsData?.pages ?? []).flatMap((p) => p?.results ?? []).filter(Boolean),
    [statsData],
  )
  const openCount = allUnfiltered.filter((t: Ticket) => t.status === 'open').length
  const inProgressCount = allUnfiltered.filter((t: Ticket) => t.status === 'in_progress').length
  const breachedCount = allUnfiltered.filter((t: Ticket) => t.sla_breached).length

  const statuses = ['', 'open', 'in_progress', 'pending_customer', 'resolved', 'closed']
  const statusLabels: Record<string, string> = {
    '': 'All', open: 'Open', in_progress: 'In Progress',
    pending_customer: 'Pending', resolved: 'Resolved', closed: 'Closed',
  }

  const renderItem = useCallback(({ item }: ListRenderItemInfo<Ticket>) => (
    <TicketCard
      ticket={item}
      onPress={() => router.push(`/(app)/(tabs)/tickets/${item.id}` as never)}
    />
  ), [router])

  return (
    <ModuleGuard module="tickets" fallback={<ModuleLockedScreen module="Tickets" />}>
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>

        {/* ── Header ── */}
        <View style={{
          paddingTop: insets.top + 14,
          paddingHorizontal: 16,
          paddingBottom: 12,
          backgroundColor: theme.colors.surface,
          borderBottomWidth: 0.5,
          borderBottomColor: theme.colors.border,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
          elevation: 3,
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <DrawerToggle light />
              <Text style={{ fontSize: 22, fontWeight: '800', color: theme.colors.text, letterSpacing: -0.5 }}>Tickets</Text>
            </View>
            <RoleGuard permission="tickets.create">
              <TouchableOpacity
                onPress={() => router.push('/(app)/tickets/new')}
                style={{
                  backgroundColor: theme.primary[600],
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  shadowColor: theme.primary[600],
                  shadowOffset: { width: 0, height: 3 },
                  shadowOpacity: 0.3,
                  shadowRadius: 6,
                  elevation: 4,
                }}
              >
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>New</Text>
              </TouchableOpacity>
            </RoleGuard>
          </View>

          {/* Search */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: theme.colors.background,
            borderRadius: 12,
            paddingHorizontal: 12,
            marginBottom: 10,
            borderWidth: 1,
            borderColor: theme.colors.border,
            height: 40,
          }}>
            <Ionicons name="search-outline" size={16} color={theme.colors.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search tickets…"
              placeholderTextColor={theme.colors.textMuted}
              style={{ flex: 1, paddingHorizontal: 8, fontSize: 14, color: theme.colors.text }}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color={theme.colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Status filter pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -4, marginBottom: 8 }}
            contentContainerStyle={{ paddingHorizontal: 4, gap: 7, flexDirection: 'row' }}
          >
            {statuses.map((s) => (
              <TouchableOpacity
                key={s}
                onPress={() => setStatus(s)}
                style={{
                  paddingHorizontal: 13,
                  paddingVertical: 6,
                  borderRadius: 20,
                  backgroundColor: status === s ? theme.primary[600] : theme.colors.background,
                  borderWidth: 1,
                  borderColor: status === s ? theme.primary[600] : theme.colors.border,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: status === s ? '#fff' : theme.colors.textMuted }}>
                  {statusLabels[s]}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Priority + My Tickets row */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -4 }}
            contentContainerStyle={{ paddingHorizontal: 4, gap: 7, flexDirection: 'row', alignItems: 'center' }}
          >
            <TouchableOpacity
              onPress={() => setMyTickets(!myTickets)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 20,
                backgroundColor: myTickets ? '#0f172a' : theme.colors.background,
                borderWidth: 1,
                borderColor: myTickets ? '#0f172a' : theme.colors.border,
              }}
            >
              <Ionicons name="person" size={11} color={myTickets ? '#fff' : theme.colors.textMuted} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: myTickets ? '#fff' : theme.colors.textMuted }}>Mine</Text>
            </TouchableOpacity>

            {(['', 'low', 'medium', 'high', 'critical'] as const).map((p) => {
              const label = p === '' ? 'All Priority' : p.charAt(0).toUpperCase() + p.slice(1)
              const active = priority === p
              const dotColor = PRIORITY_DOT[p]
              return (
                <TouchableOpacity
                  key={p}
                  onPress={() => setPriority(p)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 20,
                    backgroundColor: active ? (dotColor ?? theme.primary[600]) : theme.colors.background,
                    borderWidth: 1,
                    borderColor: active ? (dotColor ?? theme.primary[600]) : theme.colors.border,
                  }}
                >
                  {dotColor && !active && (
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dotColor }} />
                  )}
                  <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : theme.colors.textMuted }}>{label}</Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </View>

        {/* ── Stats Row ── */}
        {!isLoading && (
          <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
            <StatCard
              label="Open"
              value={openCount}
              icon="radio-button-on-outline"
              color="#1d4ed8"
              bg="#dbeafe"
              active={status === 'open'}
              onPress={() => setStatus(status === 'open' ? '' : 'open')}
            />
            <StatCard
              label="In Progress"
              value={inProgressCount}
              icon="sync-outline"
              color="#b45309"
              bg="#fef3c7"
              active={status === 'in_progress'}
              onPress={() => setStatus(status === 'in_progress' ? '' : 'in_progress')}
            />
            <StatCard
              label="SLA Breached"
              value={breachedCount}
              icon="warning-outline"
              color="#dc2626"
              bg="#fee2e2"
              active={false}
            />
          </View>
        )}

        {/* ── List ── */}
        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={theme.primary[500]} />
            <Text style={{ marginTop: 12, color: theme.colors.textMuted, fontSize: 13 }}>Loading tickets…</Text>
          </View>
        ) : (
          <TypedFlashList
            data={allTickets}
            renderItem={renderItem}
            estimatedItemSize={140}
            keyExtractor={(t: Ticket) => String(t.id)}
            contentContainerStyle={{ paddingTop: 10, paddingBottom: insets.bottom + 24 }}
            onRefresh={refetch}
            refreshing={isRefetching}
            onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage() }}
            onEndReachedThreshold={0.4}
            ListFooterComponent={isFetchingNextPage
              ? <ActivityIndicator color={theme.primary[400]} style={{ marginVertical: 12 }} />
              : null}
            ListEmptyComponent={() => (
              <View style={{ alignItems: 'center', paddingTop: 70, gap: 12 }}>
                <View style={{
                  width: 72, height: 72, borderRadius: 36,
                  backgroundColor: theme.primary[50],
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Ionicons name="ticket-outline" size={36} color={theme.primary[300]} />
                </View>
                <Text style={{ fontSize: 16, fontWeight: '700', color: theme.colors.text }}>No tickets found</Text>
                <Text style={{ fontSize: 13, color: theme.colors.textMuted, textAlign: 'center', paddingHorizontal: 32 }}>
                  {search || status || priority || myTickets
                    ? 'Try adjusting your filters or search query.'
                    : 'Create your first ticket to get started.'}
                </Text>
                {(search || status || priority || myTickets) && (
                  <TouchableOpacity
                    onPress={() => { setSearch(''); setStatus(''); setPriority(''); setMyTickets(false) }}
                    style={{
                      paddingHorizontal: 16, paddingVertical: 8,
                      borderRadius: 10,
                      backgroundColor: theme.primary[50],
                      borderWidth: 1, borderColor: theme.primary[200],
                    }}
                  >
                    <Text style={{ color: theme.primary[700], fontWeight: '600', fontSize: 13 }}>Clear Filters</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          />
        )}
      </View>
    </ModuleGuard>
  )
}
