/**
 * Notifications service hooks.
 */
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { NOTIFICATIONS } from '@/api/endpoints'
import { QK } from '@/constants/queryKeys'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Notification {
  id: number
  title: string
  body: string
  notification_type: string
  is_read: boolean
  created_at: string
  source_type: string | null
  source_id: number | null
}

export interface PaginatedResponse<T> {
  results: T[]
  next: string | null
}

function extractCursor(nextUrl: string | null): string | undefined {
  if (!nextUrl) return undefined
  try { return new URL(nextUrl).searchParams.get('cursor') ?? undefined } catch { return undefined }
}

// ── List (infinite) ───────────────────────────────────────────────────────────

export function useNotificationList() {
  return useInfiniteQuery<PaginatedResponse<Notification>>({
    queryKey: QK.notifications(),
    queryFn: ({ pageParam }) =>
      apiClient
        .get(NOTIFICATIONS.LIST, { params: { cursor: pageParam } })
        .then((r) => r.data.data ?? r.data),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => extractCursor(lastPage?.next),
    staleTime: 30_000,
  })
}

// ── Unread count ──────────────────────────────────────────────────────────────

export function useUnreadCount() {
  return useQuery<{ unread_count: number }>({
    queryKey: QK.unreadCount,
    queryFn: () => apiClient.get(NOTIFICATIONS.UNREAD_COUNT).then((r) => r.data.data ?? r.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

// ── Mark read ─────────────────────────────────────────────────────────────────

export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiClient.post(NOTIFICATIONS.MARK_READ(id), {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.unreadCount })
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.post(NOTIFICATIONS.MARK_ALL_READ, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.unreadCount })
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}
