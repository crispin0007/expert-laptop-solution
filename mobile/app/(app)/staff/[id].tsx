import React, { useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator,
  Alert, Modal, TextInput, KeyboardAvoidingView, Platform, FlatList,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/theme/ThemeContext'
import { RoleGuard } from '@/guards/RoleGuard'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { StatusBadge, PriorityBadge } from '@/components/ui/Badge'
import {
  useStaffMember, useUpdateStaff, useDeactivateStaff, useReactivateStaff,
  useResetStaffPassword, useDepartmentOptions, type StaffMember, type Department,
} from '@/features/staff/useStaff'
import { useTicketList } from '@/features/tickets/useTickets'

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'info' | 'tickets'

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  owner:   { bg: '#ede9fe', text: '#6d28d9' },
  admin:   { bg: '#dbeafe', text: '#1d4ed8' },
  manager: { bg: '#d1fae5', text: '#065f46' },
  staff:   { bg: '#f3f4f6', text: '#374151' },
  viewer:  { bg: '#f9fafb', text: '#6b7280' },
}

const ROLES_LIST = ['owner', 'admin', 'manager', 'staff', 'viewer'] as const

// ── Edit Staff Modal ──────────────────────────────────────────────────────────

function EditStaffModal({
  member,
  visible,
  onClose,
  departments,
}: {
  member: StaffMember
  visible: boolean
  onClose: () => void
  departments: Department[]
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [form, setForm] = useState({
    full_name: member.full_name,
    phone: member.phone ?? '',
    role: member.role,
    department: member.department_id ? String(member.department_id) : '',
  })

  React.useEffect(() => {
    setForm({
      full_name: member.full_name,
      phone: member.phone ?? '',
      role: member.role,
      department: member.department_id ? String(member.department_id) : '',
    })
  }, [member.id])

  const mutation = useUpdateStaff(member.id)

  function handleSave() {
    mutation.mutate(
      {
        full_name: form.full_name.trim() || undefined,
        phone: form.phone.trim() || null,
        role: form.role,
        department: form.department ? Number(form.department) : null,
      },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
          onClose()
        },
        onError: () => Alert.alert('Error', 'Failed to update staff member'),
      },
    )
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{
          paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 12,
          borderBottomWidth: 1, borderBottomColor: theme.colors.border,
          flexDirection: 'row', alignItems: 'center',
        }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: theme.colors.text }}>Edit Staff</Text>
          </View>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={22} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
          <Input
            label="Full Name"
            value={form.full_name}
            onChangeText={(v) => setForm((p) => ({ ...p, full_name: v }))}
          />
          <Input
            label="Phone"
            value={form.phone}
            onChangeText={(v) => setForm((p) => ({ ...p, phone: v }))}
            keyboardType="phone-pad"
          />

          {/* Role picker */}
          <View>
            <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Role</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {ROLES_LIST.map((r) => {
                const rc = ROLE_COLORS[r]
                const sel = form.role === r
                return (
                  <TouchableOpacity
                    key={r}
                    onPress={() => setForm((p) => ({ ...p, role: r }))}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                      backgroundColor: sel ? rc.bg : theme.colors.background,
                      borderWidth: 2, borderColor: sel ? rc.text : theme.colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: sel ? rc.text : theme.colors.textMuted, textTransform: 'capitalize' }}>{r}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          {/* Department picker */}
          {departments.length > 0 && (
            <View>
              <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Department</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {[{ id: '', name: 'None' }, ...departments].map((d) => {
                  const sel = form.department === String(d.id)
                  return (
                    <TouchableOpacity
                      key={String(d.id)}
                      onPress={() => setForm((p) => ({ ...p, department: String(d.id) }))}
                      style={{
                        paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
                        backgroundColor: sel ? theme.primary[50] : theme.colors.background,
                        borderWidth: 1, borderColor: sel ? theme.primary[500] : theme.colors.border,
                      }}
                    >
                      <Text style={{ fontSize: 12, color: sel ? theme.primary[700] : theme.colors.textMuted }}>{d.name}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>
          )}

          <Button label="Save Changes" onPress={handleSave} loading={mutation.isPending} fullWidth />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ── Reset Password Modal ──────────────────────────────────────────────────────

function ResetPasswordModal({
  staffId,
  visible,
  onClose,
}: {
  staffId: number
  visible: boolean
  onClose: () => void
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const mutation = useResetStaffPassword()

  function handleReset() {
    if (newPassword.length < 8) { Alert.alert('Validation', 'Password must be at least 8 characters'); return }
    if (newPassword !== confirm) { Alert.alert('Validation', 'Passwords do not match'); return }
    mutation.mutate(
      { staffId, newPassword },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
          Alert.alert('Success', 'Password has been reset.')
          onClose()
          setNewPassword('')
          setConfirm('')
        },
        onError: () => Alert.alert('Error', 'Failed to reset password'),
      },
    )
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{
          paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 12,
          borderBottomWidth: 1, borderBottomColor: theme.colors.border,
          flexDirection: 'row', alignItems: 'center',
        }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: theme.colors.text }}>Reset Password</Text>
            <Text style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 2 }}>Set a new temporary password for this staff member.</Text>
          </View>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={22} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
          <Input label="New Password" value={newPassword} onChangeText={setNewPassword} secureTextEntry placeholder="Min. 8 characters" />
          <Input label="Confirm Password" value={confirm} onChangeText={setConfirm} secureTextEntry placeholder="Repeat password" />
          <Button label="Reset Password" variant="destructive" onPress={handleReset} loading={mutation.isPending} fullWidth />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ── Info Tab ──────────────────────────────────────────────────────────────────

function InfoRow({ icon, label, value }: { icon: string; label: string; value?: string | null }) {
  const theme = useTheme()
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border,
    }}>
      <View style={{
        width: 32, height: 32, borderRadius: 10,
        backgroundColor: theme.colors.background,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Ionicons name={icon as never} size={15} color={theme.colors.textMuted} />
      </View>
      <Text style={{ fontSize: 13, color: theme.colors.textMuted, width: 100 }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.text, flex: 1, textAlign: 'right' }} numberOfLines={2}>
        {value ?? '—'}
      </Text>
    </View>
  )
}

function InfoTab({ member }: { member: StaffMember }) {
  const theme = useTheme()
  const roleColor = ROLE_COLORS[member.role] ?? ROLE_COLORS.staff

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }}>
      {/* Status badge */}
      <View style={{
        flexDirection: 'row', gap: 8, alignItems: 'center',
        backgroundColor: theme.colors.surface, borderRadius: 14, padding: 14,
        borderWidth: 1, borderColor: theme.colors.border,
      }}>
        <View style={{
          width: 10, height: 10, borderRadius: 5,
          backgroundColor: member.is_active ? '#10b981' : '#ef4444',
        }} />
        <Text style={{ fontSize: 13, fontWeight: '600', color: member.is_active ? '#065f46' : '#991b1b' }}>
          {member.is_active ? 'Active' : 'Deactivated'}
        </Text>
        <View style={{ width: 1, height: 14, backgroundColor: theme.colors.border, marginHorizontal: 4 }} />
        <View style={{
          width: 8, height: 8, borderRadius: 4,
          backgroundColor: member.is_available ? '#10b981' : '#d1d5db',
        }} />
        <Text style={{ fontSize: 13, color: theme.colors.textMuted }}>
          {member.is_available ? 'Available' : 'Unavailable'}
        </Text>
        <View style={{
          marginLeft: 'auto',
          paddingHorizontal: 10, paddingVertical: 4,
          borderRadius: 99, backgroundColor: roleColor.bg,
        }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: roleColor.text, textTransform: 'capitalize' }}>
            {member.custom_role_name ?? member.role}
          </Text>
        </View>
      </View>

      {/* Contact & identity */}
      <View style={{
        backgroundColor: theme.colors.surface, borderRadius: 14,
        borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 14,
      }}>
        <InfoRow icon="mail-outline" label="Email" value={member.email} />
        <InfoRow icon="call-outline" label="Phone" value={member.phone} />
        <InfoRow icon="business-outline" label="Department" value={member.department_name} />
        <InfoRow icon="id-card-outline" label="Employee ID" value={member.employee_id} />
        <InfoRow icon="person-outline" label="Staff Number" value={member.staff_number} />
      </View>

      {/* Activity */}
      <View style={{
        backgroundColor: theme.colors.surface, borderRadius: 14,
        borderWidth: 1, borderColor: theme.colors.border, padding: 14,
      }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Activity</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{
            flex: 1, backgroundColor: theme.colors.background, borderRadius: 12, padding: 12, alignItems: 'center',
          }}>
            <Text style={{ fontSize: 26, fontWeight: '900', color: theme.primary[600] }}>
              {member.open_tickets_count ?? 0}
            </Text>
            <Text style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 2 }}>Open Tickets</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  )
}

// ── Tickets Tab ───────────────────────────────────────────────────────────────

function TicketsTab({ staffId }: { staffId: number }) {
  const theme = useTheme()
  const router = useRouter()
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useTicketList({ assigned_to: staffId })

  const tickets = (data?.pages ?? []).flatMap((p) => p?.results ?? [])

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.primary[500]} />
      </View>
    )
  }

  if (tickets.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <Ionicons name="document-text-outline" size={44} color={theme.colors.textMuted} />
        <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.text }}>No tickets assigned</Text>
        <Text style={{ fontSize: 13, color: theme.colors.textMuted }}>This staff member has no tickets</Text>
      </View>
    )
  }

  return (
    <FlatList
      data={tickets}
      keyExtractor={(t) => String(t.id)}
      contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
      onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage() }}
      onEndReachedThreshold={0.4}
      renderItem={({ item: ticket }) => (
        <TouchableOpacity
          onPress={() => router.push(`/(app)/(tabs)/tickets/${ticket.id}` as never)}
          activeOpacity={0.75}
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 14,
            padding: 14,
            borderWidth: 1,
            borderColor: ticket.sla_breached ? '#fca5a5' : theme.colors.border,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 3,
            elevation: 2,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.textMuted, letterSpacing: 0.4 }}>
              {ticket.ticket_number}
            </Text>
            <StatusBadge status={ticket.status} />
          </View>
          <Text style={{ fontSize: 14, fontWeight: '700', color: theme.colors.text, marginBottom: 4 }} numberOfLines={2}>
            {ticket.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <PriorityBadge priority={ticket.priority} />
            <Text style={{ fontSize: 11, color: theme.colors.textMuted }}>
              {ticket.customer_name}
            </Text>
          </View>
        </TouchableOpacity>
      )}
    />
  )
}

// ── Main Screen ───────────────────────────────────────────────────────────────

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'info',    label: 'Info',    icon: 'person-outline' },
  { key: 'tickets', label: 'Tickets', icon: 'document-text-outline' },
]

export default function StaffDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const staffId = Number(id)
  const theme = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [activeTab, setActiveTab] = useState<Tab>('info')
  const [showEdit, setShowEdit] = useState(false)
  const [showResetPw, setShowResetPw] = useState(false)

  const { data: member, isLoading } = useStaffMember(staffId)
  const { data: departments = [] } = useDepartmentOptions()
  const deactivateMutation = useDeactivateStaff()
  const reactivateMutation = useReactivateStaff()

  function handleToggleActive() {
    if (!member) return
    const action = member.is_active ? 'deactivate' : 'reactivate'
    Alert.alert(
      member.is_active ? 'Deactivate Staff' : 'Reactivate Staff',
      `Are you sure you want to ${action} ${member.full_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: member.is_active ? 'Deactivate' : 'Reactivate',
          style: member.is_active ? 'destructive' : 'default',
          onPress: () => {
            const mutation = member.is_active ? deactivateMutation : reactivateMutation
            mutation.mutate(staffId, {
              onSuccess: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
              onError: () => Alert.alert('Error', `Failed to ${action} staff member`),
            })
          },
        },
      ],
    )
  }

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={theme.primary[500]} />
      </View>
    )
  }

  if (!member) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="alert-circle-outline" size={48} color={theme.colors.textMuted} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: theme.colors.text, marginTop: 12 }}>Staff member not found</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: theme.primary[500], fontWeight: '600' }}>Go back</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const initials = member.full_name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={{
        paddingTop: insets.top + 8,
        paddingHorizontal: 16,
        paddingBottom: 16,
        backgroundColor: theme.colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}>
        {/* Nav row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(app)/staff')} style={{ marginRight: 10, padding: 4 }}>
            <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: theme.colors.text }}>Staff Profile</Text>

          {/* Action menu */}
          <RoleGuard permission="staff.manage">
            <TouchableOpacity
              onPress={() => {
                Alert.alert(
                  member.full_name,
                  'Choose an action',
                  [
                    { text: 'Edit Details', onPress: () => setShowEdit(true) },
                    { text: 'Reset Password', onPress: () => setShowResetPw(true) },
                    {
                      text: member.is_active ? 'Deactivate' : 'Reactivate',
                      style: member.is_active ? 'destructive' : 'default',
                      onPress: handleToggleActive,
                    },
                    { text: 'Cancel', style: 'cancel' },
                  ],
                )
              }}
              style={{
                width: 36, height: 36, borderRadius: 10,
                backgroundColor: theme.colors.background,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={theme.colors.text} />
            </TouchableOpacity>
          </RoleGuard>
        </View>

        {/* Avatar + name */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{
            width: 60, height: 60, borderRadius: 30,
            backgroundColor: member.is_active ? `${theme.primary[500]}18` : '#f3f4f6',
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 2,
            borderColor: member.is_active ? theme.primary[200] : theme.colors.border,
          }}>
            <Text style={{ fontSize: 22, fontWeight: '900', color: member.is_active ? theme.primary[600] : theme.colors.textMuted }}>
              {initials}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '900', color: theme.colors.text }}>{member.full_name}</Text>
            <Text style={{ fontSize: 13, color: theme.colors.textMuted, marginTop: 2 }}>
              {member.department_name ?? 'No department'}
              {member.employee_id ? ` · ${member.employee_id}` : ''}
            </Text>
          </View>
        </View>
      </View>

      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      <View style={{
        flexDirection: 'row',
        backgroundColor: theme.colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}>
        {TABS.map((tab) => {
          const active = activeTab === tab.key
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={{
                flex: 1, alignItems: 'center', paddingVertical: 11,
                borderBottomWidth: 2,
                borderBottomColor: active ? theme.primary[600] : 'transparent',
                gap: 3,
              }}
            >
              <Ionicons name={tab.icon as never} size={17} color={active ? theme.primary[600] : theme.colors.textMuted} />
              <Text style={{ fontSize: 10, fontWeight: '700', color: active ? theme.primary[600] : theme.colors.textMuted, letterSpacing: 0.2 }}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* ── Tab content ─────────────────────────────────────────────────── */}
      <View style={{ flex: 1 }}>
        {activeTab === 'info' && <InfoTab member={member} />}
        {activeTab === 'tickets' && <TicketsTab staffId={staffId} />}
      </View>

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      {showEdit && (
        <EditStaffModal
          member={member}
          visible={showEdit}
          onClose={() => setShowEdit(false)}
          departments={departments}
        />
      )}
      <ResetPasswordModal staffId={staffId} visible={showResetPw} onClose={() => setShowResetPw(false)} />
    </View>
  )
}
