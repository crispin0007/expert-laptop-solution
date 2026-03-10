import React, { useCallback, useState } from 'react'
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  RefreshControl, TextInput, Alert, Modal, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { FlashList } from '@shopify/flash-list'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/theme/ThemeContext'
import { DrawerToggle } from '@/components/ui/AppDrawer'
import { RoleGuard } from '@/guards/RoleGuard'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useQueryClient } from '@tanstack/react-query'
import { useStaffList, useInviteStaff, useUpdateStaff, useDeactivateStaff, useReactivateStaff, useDepartmentOptions, type StaffMember, type Department } from '@/features/staff/useStaff'

const ROLES_LIST = ['owner', 'admin', 'manager', 'staff', 'viewer'] as const

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  owner: { bg: '#ede9fe', text: '#6d28d9' },
  admin: { bg: '#dbeafe', text: '#1d4ed8' },
  manager: { bg: '#d1fae5', text: '#065f46' },
  staff: { bg: '#f3f4f6', text: '#374151' },
  viewer: { bg: '#f9fafb', text: '#6b7280' },
}

// Modal helpers
function RolePicker({ value, onChange }: { value: string; onChange: (r: string) => void }) {
  const theme = useTheme()
  return (
    <View>
      <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: 8 }}>Role</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {ROLES_LIST.map((r) => { const rc = ROLE_COLORS[r]; const sel = value === r; return (
          <TouchableOpacity key={r} onPress={() => onChange(r)} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: sel ? rc.bg : theme.colors.background, borderWidth: 2, borderColor: sel ? rc.text : theme.colors.border }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: sel ? rc.text : theme.colors.textMuted, textTransform: 'capitalize' }}>{r}</Text>
          </TouchableOpacity>
        )})}
      </View>
    </View>
  )
}

function DeptPicker({ value, onChange, departments }: { value: string; onChange: (d: string) => void; departments: Department[] }) {
  const theme = useTheme()
  if (!departments.length) return null
  return (
    <View>
      <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: 8 }}>Department</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {[{ id: '', name: 'None' }, ...departments].map((d) => { const sel = value === String(d.id); return (
          <TouchableOpacity key={String(d.id)} onPress={() => onChange(String(d.id))} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: sel ? theme.primary[50] : theme.colors.background, borderWidth: 1, borderColor: sel ? theme.primary[500] : theme.colors.border }}>
            <Text style={{ fontSize: 12, color: sel ? theme.primary[700] : theme.colors.textMuted }}>{d.name}</Text>
          </TouchableOpacity>
        )})}
      </View>
    </View>
  )
}

function InviteModal({ visible, onClose, departments, onInvited }: { visible: boolean; onClose: () => void; departments: Department[]; onInvited?: () => void }) {
  const theme = useTheme()
  const BLANK = { email: '', full_name: '', phone: '', password: '', role: 'staff', department: '', employee_id: '' }
  const [form, setForm] = useState(BLANK)
  const f = (k: keyof typeof form) => (v: string) => setForm((p) => ({ ...p, [k]: v }))

  const mutation = useInviteStaff()

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: theme.colors.text }}>Invite Staff Member</Text>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={theme.colors.textMuted} /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
          <Input label="Email *" value={form.email} onChangeText={f('email')} keyboardType="email-address" autoCapitalize="none" placeholder="staff@company.com" />
          <Input label="Full Name" value={form.full_name} onChangeText={f('full_name')} placeholder="Jane Doe" />
          <Input label="Phone" value={form.phone} onChangeText={f('phone')} keyboardType="phone-pad" placeholder="+977 98..." />
          <Input label="Temp Password" value={form.password} onChangeText={f('password')} secureTextEntry placeholder="Auto-generated if empty" />
          <Input label="Employee ID" value={form.employee_id} onChangeText={f('employee_id')} placeholder="EMP-001" />
          <RolePicker value={form.role} onChange={(r) => setForm((p) => ({ ...p, role: r }))} />
          <DeptPicker value={form.department} onChange={(d) => setForm((p) => ({ ...p, department: d }))} departments={departments} />
          <Button label="Send Invitation" onPress={() => {
            if (!form.email.trim()) { Alert.alert('Email required'); return }
            const payload: Record<string, unknown> = { email: form.email.trim(), role: form.role }
            if (form.full_name.trim()) payload.full_name = form.full_name.trim()
            if (form.phone.trim()) payload.phone = form.phone.trim()
            if (form.password.trim()) payload.password = form.password.trim()
            if (form.employee_id.trim()) payload.employee_id = form.employee_id.trim()
            if (form.department) payload.department = Number(form.department)
            mutation.mutate(payload, {
              onSuccess: () => { onInvited?.(); setForm(BLANK); onClose() },
              onError: (err: any) => Alert.alert('Error', typeof err?.response?.data === 'object' ? Object.values((err.response.data as Record<string, unknown>)).flat().join(', ') : 'Failed to invite'),
            })
          }} loading={mutation.isPending} fullWidth />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function EditStaffModal({ member, visible, onClose, departments, onSaved }: { member: StaffMember | null; visible: boolean; onClose: () => void; departments: Department[]; onSaved?: () => void }) {
  const theme = useTheme()
  const [form, setForm] = useState({ full_name: '', phone: '', role: 'staff', department: '' })

  React.useEffect(() => {
    if (member) setForm({ full_name: member.full_name, phone: member.phone ?? '', role: member.role, department: member.department_id ? String(member.department_id) : '' })
  }, [member?.id])

  const mutation = useUpdateStaff(member?.id ?? 0)

  if (!member) return null
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: theme.colors.text }}>Edit Staff</Text>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={theme.colors.textMuted} /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
          <Input label="Full Name" value={form.full_name} onChangeText={(v) => setForm((p) => ({ ...p, full_name: v }))} />
          <Input label="Phone" value={form.phone} onChangeText={(v) => setForm((p) => ({ ...p, phone: v }))} keyboardType="phone-pad" />
          <RolePicker value={form.role} onChange={(r) => setForm((p) => ({ ...p, role: r }))} />
          <DeptPicker value={form.department} onChange={(d) => setForm((p) => ({ ...p, department: d }))} departments={departments} />
          <Button label="Save Changes" onPress={() => mutation.mutate({ full_name: form.full_name || undefined, phone: form.phone || undefined, role: form.role, department: form.department ? Number(form.department) : null }, { onSuccess: () => { onSaved?.(); onClose() }, onError: () => Alert.alert('Error', 'Failed to update staff member') })} loading={mutation.isPending} fullWidth />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function StaffCard({ member, onPress, onEdit, onDeactivate, onReactivate }: {
  member: StaffMember; onPress: () => void; onEdit: () => void; onDeactivate: () => void; onReactivate: () => void
}) {
  const theme = useTheme()
  const roleColor = ROLE_COLORS[member.role] ?? ROLE_COLORS.staff
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={{ backgroundColor: theme.colors.surface, marginHorizontal: 16, marginVertical: 5, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2, opacity: member.is_active ? 1 : 0.65 }}>
      <View style={{ position: 'relative' }}>
        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: `${theme.primary[500]}18`, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: theme.primary[600] }}>{member.full_name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: member.is_available ? '#10b981' : '#d1d5db', borderWidth: 2, borderColor: theme.colors.surface }} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: theme.colors.text }} numberOfLines={1}>{member.full_name}</Text>
        <Text style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 1 }} numberOfLines={1}>{member.email}</Text>
        <Text style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 2 }}>{member.department_name ?? 'No department'}{member.open_tickets_count != null ? ` · ${member.open_tickets_count} open` : ''}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <View style={{ backgroundColor: roleColor.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: roleColor.text, textTransform: 'capitalize' }}>{member.custom_role_name ?? member.role}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity onPress={onEdit} style={{ backgroundColor: theme.colors.background, borderRadius: 20, padding: 5 }}>
            <Ionicons name="pencil-outline" size={14} color={theme.colors.textMuted} />
          </TouchableOpacity>
          {member.is_active ? (
            <TouchableOpacity onPress={onDeactivate} style={{ backgroundColor: '#fee2e2', borderRadius: 20, padding: 5 }}>
              <Ionicons name="power" size={14} color="#dc2626" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={onReactivate} style={{ backgroundColor: '#d1fae5', borderRadius: 20, padding: 5 }}>
              <Ionicons name="play" size={14} color="#059669" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  )
}

export default function StaffScreen() {
  const theme = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [search, setSearch] = useState('')
  const [showInvite, setShowInvite] = useState(false)
  const [editTarget, setEditTarget] = useState<StaffMember | null>(null)
  const qc = useQueryClient()

  const { data: deptData } = useDepartmentOptions()
  const departments = deptData ?? []

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch, isRefetching } = useStaffList({ search })

  const allStaff = (data?.pages ?? []).flatMap((p) => p?.results ?? []).filter(Boolean) as StaffMember[]

  const deactivateMutation = useDeactivateStaff()
  const reactivateMutation = useReactivateStaff()

  function confirmDeactivate(m: StaffMember) {
    Alert.alert('Deactivate', `Deactivate ${m.full_name}? They will lose app access.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Deactivate', style: 'destructive', onPress: () => deactivateMutation.mutate(m.id, { onError: () => Alert.alert('Error', 'Could not deactivate') }) },
    ])
  }

  function confirmReactivate(m: StaffMember) {
    Alert.alert('Reactivate', `Reactivate ${m.full_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reactivate', onPress: () => reactivateMutation.mutate(m.id, { onError: () => Alert.alert('Error', 'Could not reactivate') }) },
    ])
  }

  const renderItem = useCallback(({ item }: { item: StaffMember }) => (
    <StaffCard
      member={item}
      onPress={() => router.push(`/(app)/staff/${item.id}` as never)}
      onEdit={() => setEditTarget(item)}
      onDeactivate={() => confirmDeactivate(item)}
      onReactivate={() => confirmReactivate(item)}
    />
  ), [router])

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + 14, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: theme.primary[600] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <DrawerToggle />
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
            <Ionicons name="arrow-back" size={20} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
          <Text style={{ flex: 1, fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: -0.3 }}>Staff</Text>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
            <Text style={{ fontSize: 12, color: '#fff', fontWeight: '600' }}>{allStaff.length} members</Text>
          </View>
          <RoleGuard permission="staff.manage">
            <TouchableOpacity onPress={() => setShowInvite(true)} style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: 7 }}>
              <Ionicons name="person-add-outline" size={18} color="#fff" />
            </TouchableOpacity>
          </RoleGuard>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingHorizontal: 10 }}>
          <Ionicons name="search-outline" size={16} color="rgba(255,255,255,0.7)" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search staff…"
            placeholderTextColor="rgba(255,255,255,0.5)"
            style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 9, fontSize: 14, color: '#fff' }}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.primary[500]} />
        </View>
      ) : (
        <FlashList
          data={allStaff}
          renderItem={renderItem}
          estimatedItemSize={90}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={{ paddingTop: 10, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.primary[500]} />}
          onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage() }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={isFetchingNextPage ? <ActivityIndicator color={theme.primary[400]} style={{ marginVertical: 12 }} /> : null}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 80, gap: 12 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="people-outline" size={28} color={theme.colors.textMuted} />
              </View>
              <Text style={{ fontSize: 15, color: theme.colors.textMuted, fontWeight: '500' }}>No staff members found</Text>
            </View>
          }
        />
      )}

      <InviteModal
        visible={showInvite}
        onClose={() => setShowInvite(false)}
        departments={departments}
        onInvited={() => qc.invalidateQueries({ queryKey: ['staff'] })}
      />
      {editTarget && (
        <EditStaffModal
          visible
          member={editTarget}
          onClose={() => setEditTarget(null)}
          departments={departments}
          onSaved={() => qc.invalidateQueries({ queryKey: ['staff'] })}
        />
      )}
    </View>
  )
}
