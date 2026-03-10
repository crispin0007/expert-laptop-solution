import React from 'react'
import { Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@/theme/ThemeContext'

export type TicketStatus = 'open' | 'in_progress' | 'pending_customer' | 'resolved' | 'closed' | 'cancelled'
export type Priority = 'low' | 'medium' | 'high' | 'critical'

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  pending_customer: 'Pending',
  resolved: 'Resolved',
  closed: 'Closed',
  cancelled: 'Cancelled',
}

const STATUS_ICON: Record<TicketStatus, string> = {
  open: 'radio-button-on-outline',
  in_progress: 'sync-outline',
  pending_customer: 'hourglass-outline',
  resolved: 'checkmark-circle-outline',
  closed: 'lock-closed-outline',
  cancelled: 'close-circle-outline',
}

const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
}

const PRIORITY_ICON: Record<Priority, string> = {
  low: 'arrow-down-outline',
  medium: 'remove-outline',
  high: 'arrow-up-outline',
  critical: 'flame-outline',
}

// ── Status Badge ─────────────────────────────────────────────────────────────

interface StatusBadgeProps {
  status: TicketStatus
  showIcon?: boolean
}

export function StatusBadge({ status, showIcon = true }: StatusBadgeProps) {
  const theme = useTheme()
  const { bg, text } = theme.status[status] ?? theme.status.open
  const icon = STATUS_ICON[status]

  return (
    <View style={{
      backgroundColor: bg,
      paddingHorizontal: showIcon ? 7 : 8,
      paddingVertical: 3,
      borderRadius: theme.radius.full,
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    }}>
      {showIcon && <Ionicons name={icon as never} size={10} color={text} />}
      <Text style={{ fontSize: theme.fontSize.xs, fontWeight: theme.fontWeight.semibold, color: text }}>
        {STATUS_LABEL[status] ?? status}
      </Text>
    </View>
  )
}

// ── Priority Badge ────────────────────────────────────────────────────────────

interface PriorityBadgeProps {
  priority: Priority
  showIcon?: boolean
}

export function PriorityBadge({ priority, showIcon = true }: PriorityBadgeProps) {
  const theme = useTheme()
  const { bg, text } = theme.priority[priority] ?? theme.priority.medium
  const icon = PRIORITY_ICON[priority]

  return (
    <View style={{
      backgroundColor: bg,
      paddingHorizontal: showIcon ? 7 : 8,
      paddingVertical: 3,
      borderRadius: theme.radius.full,
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    }}>
      {showIcon && <Ionicons name={icon as never} size={10} color={text} />}
      <Text style={{ fontSize: theme.fontSize.xs, fontWeight: theme.fontWeight.semibold, color: text, textTransform: 'capitalize' }}>
        {PRIORITY_LABEL[priority] ?? priority}
      </Text>
    </View>
  )
}

// ── Generic Badge ─────────────────────────────────────────────────────────────

interface BadgeProps {
  label: string
  color?: string
  textColor?: string
  icon?: string
}

export function Badge({ label, color, textColor, icon }: BadgeProps) {
  const theme = useTheme()
  return (
    <View style={{
      backgroundColor: color ?? theme.primary[100],
      paddingHorizontal: icon ? 7 : 8,
      paddingVertical: 3,
      borderRadius: theme.radius.full,
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    }}>
      {icon && <Ionicons name={icon as never} size={10} color={textColor ?? theme.primary[700]} />}
      <Text style={{ fontSize: theme.fontSize.xs, fontWeight: theme.fontWeight.semibold, color: textColor ?? theme.primary[700] }}>
        {label}
      </Text>
    </View>
  )
}

// ── SLA Badge ─────────────────────────────────────────────────────────────────

interface SlaBadgeProps {
  deadline: string
  breached: boolean
}

export function SlaBadge({ deadline, breached }: SlaBadgeProps) {
  const label = formatSlaRemaining(deadline, breached)
  const isUrgent = !breached && getRemainingMs(deadline) < 4 * 3600_000

  const bg = breached ? '#fee2e2' : isUrgent ? '#fff7ed' : '#f0fdf4'
  const textColor = breached ? '#dc2626' : isUrgent ? '#c2410c' : '#15803d'
  const icon = breached ? 'warning-outline' : isUrgent ? 'time-outline' : 'timer-outline'

  return (
    <View style={{
      backgroundColor: bg,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 99,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      alignSelf: 'flex-start',
    }}>
      <Ionicons name={icon as never} size={10} color={textColor} />
      <Text style={{ fontSize: 10, fontWeight: '700', color: textColor, letterSpacing: 0.2 }}>{label}</Text>
    </View>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getRemainingMs(deadline: string): number {
  return new Date(deadline).getTime() - Date.now()
}

export function formatSlaRemaining(deadline: string, breached: boolean): string {
  const diffMs = getRemainingMs(deadline)
  if (diffMs <= 0 || breached) {
    const abs = Math.abs(diffMs)
    const hrs = Math.floor(abs / 3_600_000)
    if (hrs < 1) return `${Math.floor(abs / 60_000)}m overdue`
    if (hrs < 24) return `${hrs}h overdue`
    return `${Math.floor(hrs / 24)}d overdue`
  }
  const hrs = Math.floor(diffMs / 3_600_000)
  if (hrs < 1) return `${Math.floor(diffMs / 60_000)}m left`
  if (hrs < 24) return `${hrs}h left`
  return `${Math.floor(hrs / 24)}d left`
}
