import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck, Loader2 } from 'lucide-react'
import apiClient from '../api/client'
import { NOTIFICATIONS } from '../api/endpoints'

interface NotificationItem {
  id: number
  title: string
  body: string
  notification_type: string
  is_read: boolean
  created_at: string
}

const TYPE_COLORS: Record<string, string> = {
  ticket_assigned: 'bg-indigo-500',
  ticket_comment:  'bg-indigo-400',
  ticket_transfer: 'bg-violet-500',
  ticket_status:   'bg-blue-400',
  task_assigned:   'bg-violet-500',
  task_done:       'bg-emerald-500',
  project_assigned:'bg-blue-600',
  coin_approved:   'bg-emerald-500',
  coin_rejected:   'bg-red-500',
  sla_warning:     'bg-yellow-500',
  sla_breached:    'bg-red-600',
  low_stock:       'bg-orange-500',
  po_status:       'bg-sky-500',
  return_status:   'bg-teal-500',
  general:         'bg-gray-400',
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const qc = useQueryClient()

  // Close on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  // Poll unread count every 30s
  const { data: countData } = useQuery<{ success: boolean; data: { count: number } }>({
    queryKey: ['notifications-count'],
    queryFn: () => apiClient.get(NOTIFICATIONS.UNREAD_COUNT).then(r => r.data),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const unreadCount = countData?.data?.count ?? 0

  // Fetch latest notifications when dropdown is open
  const { data: notifications = [], isLoading } = useQuery<NotificationItem[]>({
    queryKey: ['notifications-list'],
    queryFn: () =>
      apiClient.get(NOTIFICATIONS.LIST, { params: { page_size: 15 } })
        .then(r => r.data.data ?? r.data.results ?? []),
    enabled: open,
    staleTime: 10_000,
  })

  const markReadMutation = useMutation({
    mutationFn: (id: number) => apiClient.post(NOTIFICATIONS.MARK_READ(id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications-list'] })
      qc.invalidateQueries({ queryKey: ['notifications-count'] })
    },
  })

  const markAllReadMutation = useMutation({
    mutationFn: () => apiClient.post(NOTIFICATIONS.MARK_ALL_READ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications-list'] })
      qc.invalidateQueries({ queryKey: ['notifications-count'] })
    },
  })

  function formatTime(iso: string) {
    const d = new Date(iso)
    const now = Date.now()
    const diff = (now - d.getTime()) / 1000
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.round(diff / 60)}m ago`
    if (diff < 86400) return `${Math.round(diff / 3600)}h ago`
    return d.toLocaleDateString()
  }

  return (
    <div className="relative" ref={ref}>
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

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="font-semibold text-sm text-gray-800">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
              >
                <CheckCheck size={12} /> Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-gray-400">
                <Loader2 size={16} className="animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">All caught up!</div>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => !n.is_read && markReadMutation.mutate(n.id)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition flex gap-3 ${
                    n.is_read ? 'opacity-60' : ''
                  }`}
                >
                  {/* Type dot */}
                  <span className={`mt-1.5 shrink-0 w-2 h-2 rounded-full ${TYPE_COLORS[n.notification_type] ?? 'bg-gray-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${n.is_read ? 'text-gray-500' : 'font-semibold text-gray-800'}`}>
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">{n.body}</p>
                    )}
                    <p className="text-xs text-gray-300 mt-1">{formatTime(n.created_at)}</p>
                  </div>
                  {!n.is_read && (
                    <span className="shrink-0 mt-1.5 w-2 h-2 rounded-full bg-indigo-500" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
