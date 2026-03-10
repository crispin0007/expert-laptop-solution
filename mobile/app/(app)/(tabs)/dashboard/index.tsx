import React from 'react'
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuthStore } from '@/store/authStore'
import { useTenantStore } from '@/store/tenantStore'
import { useTheme } from '@/theme/ThemeContext'
import { StatusBadge, PriorityBadge } from '@/components/ui/Badge'
import { useDrawerStore } from '@/store/drawerStore'
import { useDashboardStats, type DashboardStats } from '@/features/dashboard/useDashboard'
import { useUnreadCount } from '@/features/notifications/useNotifications'



type IoniconName = React.ComponentProps<typeof Ionicons>['name']

interface StatCardProps {
  label: string
  value: number | string
  icon: IoniconName
  iconBg: string
  iconColor: string
  onPress?: () => void
}

function StatCard({ label, value, icon, iconBg, iconColor, onPress }: StatCardProps) {
  const theme = useTheme()
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.75 : 1}
      style={{
        flex: 1,
        backgroundColor: theme.colors.surface,
        borderRadius: 16,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 3,
      }}
    >
      <View style={{
        width: 40, height: 40, borderRadius: 12,
        backgroundColor: iconBg,
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 12,
      }}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <Text style={{
        fontSize: 28,
        fontWeight: '800',
        color: theme.colors.text,
        letterSpacing: -0.5,
      }}>
        {value}
      </Text>
      <Text style={{
        fontSize: 12,
        fontWeight: '500',
        color: theme.colors.textMuted,
        marginTop: 2,
      }}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}

function RevenueCard({ value }: { value: string }) {
  const theme = useTheme()
  return (
    <View style={{
      backgroundColor: theme.primary[600],
      borderRadius: 16,
      padding: 20,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      shadowColor: theme.primary[600],
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 6,
    }}>
      <View style={{
        width: 48, height: 48, borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Ionicons name="trending-up-outline" size={24} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: '500', marginBottom: 2 }}>
          Revenue This Month
        </Text>
        <Text style={{ fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: -0.5 }}>
          Rs. {value}
        </Text>
      </View>
    </View>
  )
}

export default function DashboardScreen() {
  const theme = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const user = useAuthStore((s) => s.user)
  const tenant = useTenantStore((s) => s.tenant)

  const { data: stats, isLoading, refetch, isRefetching } = useDashboardStats()
  const { data: unread } = useUnreadCount()

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  })()

  const unreadCount = (unread as any)?.unread_count ?? (unread as any)?.count ?? 0

  return (
    <View style={{ flex: 1 }}>
      {/* ── Floating drawer button — always on top ── */}
      <TouchableOpacity
        onPress={() => useDrawerStore.getState().toggle()}
        style={{
          position: 'absolute',
          top: insets.top + 8,
          left: 16,
          zIndex: 100,
          width: 46,
          height: 46,
          borderRadius: 13,
          backgroundColor: '#fff',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.18,
          shadowRadius: 6,
          elevation: 8,
        }}
      >
        <Ionicons name="menu" size={26} color={theme.primary[600]} />
      </TouchableOpacity>

      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.primary[500]} />}
        showsVerticalScrollIndicator={false}
      >
      {/* ── Header ── */}
      <View style={{
        paddingTop: insets.top + 12,
        paddingHorizontal: 16,
        paddingBottom: 32,
        backgroundColor: theme.primary[600],
      }}>
        {/* Nav row: spacer (floating hamburger sits here) | title | bell */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          {/* Spacer matching the floating hamburger button */}
          <View style={{ width: 46, height: 46 }} />

          <Text style={{ fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.8)', letterSpacing: 0.5, textTransform: 'uppercase' }}>
            {tenant?.name ?? 'NEXUS BMS'}
          </Text>

          {/* Bell */}
          <TouchableOpacity
            onPress={() => router.push('/(app)/notifications')}
            style={{
              width: 42, height: 42,
              backgroundColor: 'rgba(255,255,255,0.15)',
              borderRadius: 12,
              alignItems: 'center', justifyContent: 'center',
            }}
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

        {/* Greeting row */}
        <View>
          <Text style={{ fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: -0.5 }}>
            {greeting}, {user?.first_name ?? 'there'} 👋
          </Text>
          <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 5 }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: 16, marginTop: -16, gap: 14 }}>
        {isLoading ? (
          <View style={{ alignItems: 'center', paddingTop: 80 }}>
            <ActivityIndicator size="large" color={theme.primary[500]} />
          </View>
        ) : (
          <>
            {/* ── Stat Grid Row 1 ── */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <StatCard
                label="Open Tickets"
                value={stats?.open_tickets ?? 0}
                icon="pricetag-outline"
                iconBg={`${theme.primary[500]}22`}
                iconColor={theme.primary[600]}
                onPress={() => router.push('/(app)/(tabs)/tickets')}
              />
              <StatCard
                label="In Progress"
                value={stats?.in_progress_tickets ?? 0}
                icon="time-outline"
                iconBg="#fef3c7"
                iconColor="#d97706"
                onPress={() => router.push('/(app)/(tabs)/tickets')}
              />
            </View>

            {/* ── Stat Grid Row 2 ── */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <StatCard
                label="SLA Breached"
                value={stats?.sla_breached ?? 0}
                icon="alert-circle-outline"
                iconBg="#fee2e2"
                iconColor="#dc2626"
                onPress={() => router.push('/(app)/(tabs)/tickets')}
              />
              <StatCard
                label="Active Projects"
                value={stats?.active_projects ?? 0}
                icon="briefcase-outline"
                iconBg="#ede9fe"
                iconColor="#7c3aed"
                onPress={() => router.push('/(app)/(tabs)/projects')}
              />
            </View>

            {/* ── Revenue Banner ── */}
            <RevenueCard value={stats?.revenue_this_month ?? '0.00'} />

            {/* ── Coins pending (only if non-zero) ── */}
            {(stats?.pending_coins ?? 0) > 0 && (
              <View style={{
                backgroundColor: theme.colors.surface,
                borderRadius: 16,
                padding: 16,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.06,
                shadowRadius: 8,
                elevation: 3,
              }}>
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#fef9c3', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="star-outline" size={22} color="#ca8a04" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: theme.colors.textMuted, fontWeight: '500' }}>Coins Pending Approval</Text>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: theme.colors.text }}>{stats?.pending_coins}</Text>
                </View>
              </View>
            )}

            {/* ── Quick Actions ── */}
            <View>
              <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 }}>
                Quick Actions
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {[
                  { icon: 'add-circle-outline' as IoniconName, label: 'New Ticket', route: '/(app)/tickets/new' as never },
                  { icon: 'list-outline' as IoniconName, label: 'All Tickets', route: '/(app)/(tabs)/tickets' as never },
                  { icon: 'people-outline' as IoniconName, label: 'Customers', route: '/(app)/(tabs)/customers' as never },
                ].map(({ icon, label, route }) => (
                  <TouchableOpacity
                    key={label}
                    onPress={() => router.push(route)}
                    style={{
                      flex: 1,
                      backgroundColor: theme.colors.surface,
                      borderRadius: 14,
                      paddingVertical: 14,
                      alignItems: 'center',
                      gap: 6,
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.05,
                      shadowRadius: 4,
                      elevation: 2,
                    }}
                  >
                    <Ionicons name={icon} size={24} color={theme.primary[600]} />
                    <Text style={{ fontSize: 11, fontWeight: '600', color: theme.colors.textSecondary }}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* ── Recent Tickets (only if returned by API) ── */}
            {(stats?.recent_tickets?.length ?? 0) > 0 && (
              <View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                    Recent Tickets
                  </Text>
                  <TouchableOpacity onPress={() => router.push('/(app)/(tabs)/tickets')}>
                    <Text style={{ fontSize: 12, color: theme.primary[600], fontWeight: '600' }}>View all →</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ gap: 10 }}>
                  {stats!.recent_tickets!.map((t) => (
                    <TouchableOpacity
                      key={t.id}
                      onPress={() => router.push(`/(app)/(tabs)/tickets/${t.id}` as never)}
                      style={{
                        backgroundColor: theme.colors.surface,
                        borderRadius: 14,
                        padding: 14,
                        borderLeftWidth: 3,
                        borderLeftColor: t.sla_breached ? theme.colors.error : theme.primary[400],
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.04,
                        shadowRadius: 4,
                        elevation: 2,
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                        <Text style={{ fontSize: 11, color: theme.colors.textMuted, fontWeight: '600' }}>{t.ticket_number}</Text>
                        {t.sla_breached && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                            <Ionicons name="warning" size={11} color={theme.colors.error} />
                            <Text style={{ fontSize: 10, color: theme.colors.error, fontWeight: '700' }}>SLA BREACHED</Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.text, marginBottom: 8 }} numberOfLines={2}>
                        {t.title}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <StatusBadge status={t.status as never} />
                        <PriorityBadge priority={t.priority as never} />
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </View>
    </ScrollView>
    </View>
  )
}
