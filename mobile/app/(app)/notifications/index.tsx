import React, { useCallback, useEffect } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, RefreshControl, AppState } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect } from 'expo-router'
import { useTheme } from '@/theme/ThemeContext'
import {
  useNotificationList, useMarkRead, useMarkAllRead,
  type Notification,
} from '@/features/notifications/useNotifications'



const TYPE_ICON: Record<string, string> = {
  ticket_assigned: '🎫',
  ticket_status: '🔄',
  ticket_comment: '💬',
  ticket_transfer: '↔️',
  sla_warning: '⏰',
  sla_breached: '🚨',
  coin_approved: '🪙',
  coin_rejected: '❌',
  project_assigned: '📁',
  task_assigned: '✅',
  task_done: '🏆',
  low_stock: '📦',
  general: '🔔',
}

function NotificationRow({ item, onPress, onMarkRead }: { item: Notification; onPress: () => void; onMarkRead: (id: number) => void }) {
  const theme = useTheme()
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        flexDirection: 'row',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        backgroundColor: item.is_read ? theme.colors.background : theme.primary[50],
      }}
    >
      <Text style={{ fontSize: 22, marginTop: 2 }}>{TYPE_ICON[item.notification_type] ?? '🔔'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: theme.fontSize.sm, fontWeight: item.is_read ? theme.fontWeight.regular : theme.fontWeight.semibold, color: theme.colors.text }}>
          {item.title}
        </Text>
        <Text style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted, marginTop: 3, lineHeight: 16 }} numberOfLines={2}>
          {item.body}
        </Text>
        <Text style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted, marginTop: 4 }}>
          {new Date(item.created_at).toLocaleString()}
        </Text>
      </View>
      {!item.is_read && (
        <TouchableOpacity onPress={() => onMarkRead(item.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: theme.primary[500], marginTop: 6 }} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  )
}

export default function NotificationsScreen() {
  const theme = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch, isRefetching } = useNotificationList()
  const markReadMutation = useMarkRead()
  const markAllMutation = useMarkAllRead()

  // Refetch on screen focus
  useFocusEffect(useCallback(() => { refetch() }, [refetch]))

  // Refetch on foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refetch()
    })
    return () => sub.remove()
  }, [refetch])

  function handleNotificationPress(n: Notification) {
    if (!n.is_read) markReadMutation.mutate(n.id)
    if (n.source_type === 'ticket' && n.source_id) {
      router.push(`/(app)/(tabs)/tickets/${n.source_id}` as never)
    } else if (n.source_type === 'project' && n.source_id) {
      router.push(`/(app)/(tabs)/projects/${n.source_id}` as never)
    }
  }

  const allNotifications = (data?.pages.flatMap((p: { results: Notification[] }) => p.results) ?? []).filter(Boolean)

  const renderItem = useCallback(({ item }: { item: Notification }) => (
    <NotificationRow
      item={item}
      onPress={() => handleNotificationPress(item)}
      onMarkRead={(id) => markReadMutation.mutate(id)}
    />
  ), [])

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 14, backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: theme.primary[600], fontSize: theme.fontSize.sm }}>←</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: theme.fontSize.lg, fontWeight: theme.fontWeight.bold, color: theme.colors.text }}>Notifications</Text>
        </View>
        <TouchableOpacity onPress={() => markAllMutation.mutate()} disabled={markAllMutation.isPending}>
          <Text style={{ fontSize: theme.fontSize.xs, color: theme.primary[600], fontWeight: theme.fontWeight.semibold }}>Mark all read</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.primary[500]} />
        </View>
      ) : (
        <FlashList
          data={allNotifications}
          renderItem={renderItem}
          estimatedItemSize={80}
          keyExtractor={(n) => String(n.id)}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.primary[500]} />}
          onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage() }}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>🔔</Text>
              <Text style={{ fontSize: theme.fontSize.base, color: theme.colors.textMuted }}>No notifications yet</Text>
            </View>
          }
        />
      )}
    </View>
  )
}
