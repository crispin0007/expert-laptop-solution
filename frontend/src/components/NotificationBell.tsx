import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, Loader2, Trash2, X, Settings } from 'lucide-react'
import apiClient from '../api/client'
import { NOTIFICATIONS } from '../api/endpoints'
import { adStringToBsDisplay } from '../utils/nepaliDate'
import { usePreferenceStore } from '../store/preferenceStore'
import { useAuthStore } from '../store/authStore'

// ── Types ─────────────────────────────────────────────────────────────────────

interface NotificationItem {
  id: number
  title: string
  body: string
  notification_type: string
  is_read: boolean
  read_at: string | null
  source_type: string
  source_id: number | null
  metadata: Record<string, string | number | boolean | null>
  created_at: string
}

// ── Deep link mapper ──────────────────────────────────────────────────────────

function getDeepLink(n: NotificationItem): string | null {
  const { notification_type, source_type, source_id, metadata } = n
  const sid = source_id
  switch (notification_type) {
    case 'ticket_assigned':
    case 'ticket_status':
    case 'ticket_comment':
    case 'ticket_transfer':
    case 'sla_warning':
    case 'sla_breached':
      if (source_type === 'ticket' && sid) return `/tickets/${sid}`
      if (metadata?.ticket_id) return `/tickets/${metadata.ticket_id}`
      return '/tickets'
    case 'project_assigned':
      if (source_type === 'project' && sid) return `/projects/${sid}`
      if (metadata?.project_id) return `/projects/${metadata.project_id}`
      return '/projects'
    case 'task_assigned':
    case 'task_done':
      if (metadata?.project_id) return `/projects/${metadata.project_id}`
      if (source_type === 'project' && sid) return `/projects/${sid}`
      return '/projects'
    case 'coin_approved':
    case 'coin_rejected':
      return '/accounting?tab=coins'
    case 'low_stock':
    case 'po_status':
    case 'return_status':
      return '/inventory'
    default:
      return null
  }
}

// ── Metadata subtitle ─────────────────────────────────────────────────────────

function getSubtitle(n: NotificationItem): string | null {
  const m = n.metadata
  if (!m || Object.keys(m).length === 0) return null
  if (m.ticket_number) return `#${m.ticket_number}`
  if (m.project_name)  return String(m.project_name)
  if (m.task_name)     return String(m.task_name)
  if (m.product_name)  return String(m.product_name)
  return null
}

// ── Type dot colour ───────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  ticket_assigned:  'bg-indigo-500',
  ticket_comment:   'bg-indigo-400',
  ticket_transfer:  'bg-violet-500',
  ticket_status:    'bg-blue-400',
  task_assigned:    'bg-violet-500',
  task_done:        'bg-emerald-500',
  project_assigned: 'bg-blue-600',
  coin_approved:    'bg-emerald-500',
  coin_rejected:    'bg-red-500',
  sla_warning:      'bg-yellow-500',
  sla_breached:     'bg-red-600',
  low_stock:        'bg-orange-500',
  po_status:        'bg-sky-500',
  return_status:    'bg-teal-500',
  general:          'bg-gray-400',
}

// ── Time formatter ────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso)
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60)    return 'just now'
  if (diff < 3600)  return `${Math.round(diff / 60)}m ago`
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`
  const dateStr = d.toISOString().slice(0, 10)
  const mode = usePreferenceStore.getState().dateMode
  if (mode === 'ad') return dateStr
  return adStringToBsDisplay(dateStr)?.bs ?? dateStr
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const qc = useQueryClient()
  const navigate = useNavigate()

  const user = useAuthStore(s => s.user)
  const isSuperAdmin = user?.is_superadmin ?? false

  // Close on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: countData } = useQuery<{ success: boolean; data: { count: number } }>({
    queryKey: ['notifications-count'],
    queryFn: () => apiClient.get(NOTIFICATIONS.UNREAD_COUNT).then(r => r.data),
    refetchInterval: 60_000,
    staleTime: 15_000,
    enabled: !isSuperAdmin,
  })

  const { data: notifications = [], isLoading } = useQuery<NotificationItem[]>({
    queryKey: ['notifications-list'],
    queryFn: () =>
      apiClient.get(NOTIFICATIONS.LIST, { params: { page_size: 25 } })
        .then(r => r.data.data ?? r.data.results ?? []),
    enabled: open && !isSuperAdmin,
    staleTime: 10_000,
  })

  // ── Mutations ──────────────────────────────────────────────────────────────

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['notifications-list'] })
    qc.invalidateQueries({ queryKey: ['notifications-count'] })
  }, [qc])

  const markReadMutation    = useMutation({ mutationFn: (id: number) => apiClient.post(NOTIFICATIONS.MARK_READ(id)), onSuccess: invalidate })
  const markAllReadMutation = useMutation({ mutationFn: () => apiClient.post(NOTIFICATIONS.MARK_ALL_READ), onSuccess: invalidate })
  const dismissMutation     = useMutation({ mutationFn: (id: number) => apiClient.delete(NOTIFICATIONS.DISMISS(id)), onSuccess: invalidate })
  const clearReadMutation   = useMutation({ mutationFn: () => apiClient.delete(NOTIFICATIONS.CLEAR_READ), onSuccess: invalidate })

  // Superadmin guard — notification endpoints are tenant-only
  if (isSuperAdmin) return null

  // ── Derived state ──────────────────────────────────────────────────────────

  const unreadCount = countData?.data?.count ?? 0
  const hasRead     = notifications.some(n => n.is_read)

  function handleClick(n: NotificationItem) {
    const link = getDeepLink(n)
    if (!n.is_read) markReadMutation.mutate(n.id)
    if (link) { setOpen(false); navigate(link) }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="relative" ref={ref}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition"
        title="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 overflow-hidden flex flex-col max-h-[520px]">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 shrink-0">
            <span className="font-semibold text-sm text-gray-800">
              Notifications
              {unreadCount > 0 && (
                <span className="ml-1.5 text-xs font-bold text-indigo-600">{unreadCount} new</span>
              )}
            </span>

            <div className="flex items-center gap-0.5">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllReadMutation.mutate()}
                  disabled={markAllReadMutation.isPending}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50 rounded-lg disabled:opacity-50 transition"
                  title="Mark all as read"
                >
                  <CheckCheck size={12} /> All read
                </button>
              )}
              {hasRead && (
                <button
                  onClick={() => clearReadMutation.mutate()}
                  disabled={clearReadMutation.isPending}
                  className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-50 rounded-lg disabled:opacity-50 transition"
                  title="Clear all read notifications"
                >
                  <Trash2 size={12} />
                </button>
              )}
              <button
                onClick={() => { setOpen(false); navigate('/settings?tab=notifications') }}
                className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition"
                title="Notification preferences"
              >
                <Settings size={13} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-10 text-gray-400">
                <Loader2 size={18} className="animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-10 text-center">
                <Bell size={28} className="mx-auto text-gray-200 mb-2" />
                <p className="text-sm text-gray-400">All caught up!</p>
              </div>
            ) : (
              notifications.map(n => {
                const link    = getDeepLink(n)
                const subtitle = getSubtitle(n)
                return (
                  <div
                    key={n.id}
                    className={`group relative flex gap-3 px-4 py-3 border-b border-gray-50 transition ${
                      !n.is_read ? 'bg-indigo-50/40 hover:bg-indigo-50/70' : 'hover:bg-gray-50'
                    } ${link ? 'cursor-pointer' : ''}`}
                    onClick={() => handleClick(n)}
                  >
                    {/* Unread stripe */}
                    {!n.is_read && (
                      <span className="absolute left-0 top-3 bottom-3 w-0.5 bg-indigo-500 rounded-r" />
                    )}

                    {/* Type dot */}
                    <span className={`mt-1.5 shrink-0 w-2 h-2 rounded-full ${TYPE_COLORS[n.notification_type] ?? 'bg-gray-400'}`} />

                    {/* Content */}
                    <div className="flex-1 min-w-0 pr-5">
                      <p className={`text-sm leading-snug ${n.is_read ? 'text-gray-500' : 'font-semibold text-gray-800'}`}>
                        {n.title}
                      </p>
                      {subtitle && (
                        <p className="text-xs text-indigo-500 font-medium mt-0.5">{subtitle}</p>
                      )}
                      {n.body && (
                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{n.body}</p>
                      )}
                      <p className="text-xs text-gray-300 mt-1">{formatTime(n.created_at)}</p>
                    </div>

                    {/* Dismiss — visible on hover */}
                    <button
                      onClick={e => { e.stopPropagation(); dismissMutation.mutate(n.id) }}
                      className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded transition"
                      title="Dismiss"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-100 shrink-0 text-center">
              <button
                onClick={() => { setOpen(false); navigate('/settings?tab=notifications') }}
                className="text-xs text-indigo-500 hover:text-indigo-700 transition"
              >
                Manage notification preferences →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
