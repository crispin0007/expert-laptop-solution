import React, { useCallback, useState } from 'react'
import {
  View, Text, TouchableOpacity, ActivityIndicator, RefreshControl, ScrollView,
  Modal, TextInput, KeyboardAvoidingView, Platform, Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import apiClient from '@/api/client'
import { ROLES } from '@/api/endpoints'
import { QK } from '@/constants/queryKeys'
import { useTheme } from '@/theme/ThemeContext'
import { DrawerToggle } from '@/components/ui/AppDrawer'
import { RoleGuard } from '@/guards/RoleGuard'
import { useRoleList } from '@/features/roles/useRoles'

interface Permission {
  codename: string
  name: string
}

interface Role {
  id: number
  name: string
  description?: string | null
  permissions?: Permission[] | string[]
  staff_count?: number
  is_system?: boolean
}

// Map backend permission codenames to friendly labels
const PERM_GROUPS: Record<string, { label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  can_view_tickets:      { label: 'View Tickets',      icon: 'document-text-outline' },
  can_create_tickets:    { label: 'Create Tickets',    icon: 'add-circle-outline' },
  can_manage_tickets:    { label: 'Manage Tickets',    icon: 'create-outline' },
  can_view_customers:    { label: 'View Customers',    icon: 'people-outline' },
  can_manage_customers:  { label: 'Manage Customers',  icon: 'person-add-outline' },
  can_view_projects:     { label: 'View Projects',     icon: 'briefcase-outline' },
  can_manage_projects:   { label: 'Manage Projects',   icon: 'construct-outline' },
  can_view_inventory:    { label: 'View Inventory',    icon: 'cube-outline' },
  can_manage_inventory:  { label: 'Manage Inventory',  icon: 'archive-outline' },
  can_view_accounting:   { label: 'View Accounting',   icon: 'cash-outline' },
  can_manage_accounting: { label: 'Manage Accounting', icon: 'wallet-outline' },
  can_manage_staff:      { label: 'Manage Staff',      icon: 'person-circle-outline' },
  can_manage_settings:   { label: 'Manage Settings',   icon: 'settings-outline' },
}

// ─── Role Modal ─────────────────────────────────────────────────────────────
function RoleModal({ visible, role, onClose, onSaved }: {
  visible: boolean; role?: Role | null; onClose: () => void; onSaved: () => void
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [name, setName] = useState(role?.name ?? '')
  const [description, setDescription] = useState(role?.description ?? '')
  const [selectedPerms, setSelectedPerms] = useState<string[]>(() => {
    if (!role?.permissions) return []
    return (role.permissions as any[]).map((p) => typeof p === 'string' ? p : p.codename)
  })
  const isEdit = !!role

  const { data: permData } = useQuery({
    queryKey: ['roles', 'permissions'],
    queryFn: () => apiClient.get(ROLES.PERMISSIONS).then((r) => { const d = r.data.data ?? r.data; return Array.isArray(d) ? d : [] }),
    staleTime: 300_000,
  })
  const allPerms: Permission[] = permData ?? Object.keys(PERM_GROUPS).map((k) => ({ codename: k, name: PERM_GROUPS[k].label }))

  React.useEffect(() => {
    setName(role?.name ?? '')
    setDescription(role?.description ?? '')
    setSelectedPerms(role?.permissions ? (role.permissions as any[]).map((p) => typeof p === 'string' ? p : p.codename) : [])
  }, [role?.id])

  const mutation = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), description: description.trim() || null, permissions: selectedPerms }
      return isEdit ? apiClient.patch(ROLES.UPDATE(role!.id), body) : apiClient.post(ROLES.CREATE, body)
    },
    onSuccess: () => { onSaved(); onClose() },
    onError: (e: any) => Alert.alert('Error', e?.response?.data?.message ?? 'Could not save role'),
  })

  function togglePerm(codename: string) {
    setSelectedPerms((prev) => prev.includes(codename) ? prev.filter((p) => p !== codename) : [...prev, codename])
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderColor: theme.colors.border, flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ flex: 1, fontSize: 18, fontWeight: '800', color: theme.colors.text }}>{isEdit ? 'Edit Role' : 'New Role'}</Text>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={theme.colors.textMuted} /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
          <View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Name *</Text>
            <TextInput value={name} onChangeText={setName} placeholder="e.g. Support Lead" placeholderTextColor={theme.colors.textMuted} style={{ backgroundColor: theme.colors.surface, borderRadius: 10, padding: 12, fontSize: 15, color: theme.colors.text, borderWidth: 1, borderColor: theme.colors.border }} />
          </View>
          <View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Description</Text>
            <TextInput value={description} onChangeText={setDescription} placeholder="Optional description…" placeholderTextColor={theme.colors.textMuted} multiline numberOfLines={2} style={{ backgroundColor: theme.colors.surface, borderRadius: 10, padding: 12, fontSize: 15, color: theme.colors.text, borderWidth: 1, borderColor: theme.colors.border, minHeight: 70, textAlignVertical: 'top' }} />
          </View>
          <View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.textMuted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Permissions</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {allPerms.map((p) => {
                const active = selectedPerms.includes(p.codename)
                return (
                  <TouchableOpacity key={p.codename} onPress={() => togglePerm(p.codename)} style={{ backgroundColor: active ? theme.primary[600] : theme.colors.surface, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: active ? theme.primary[600] : theme.colors.border }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : theme.colors.textSecondary }}>{PERM_GROUPS[p.codename]?.label ?? p.name}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
          <TouchableOpacity
            onPress={() => { if (!name.trim()) { Alert.alert('Validation', 'Name is required'); return } mutation.mutate() }}
            disabled={mutation.isPending}
            style={{ backgroundColor: theme.primary[600], borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 8 }}
          >
            {mutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{isEdit ? 'Save Changes' : 'Create Role'}</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function RoleCard({ role, onEdit, onDelete }: { role: Role; onEdit: () => void; onDelete: () => void }) {
  const theme = useTheme()
  const perms = Array.isArray(role.permissions) ? role.permissions : []

  const permLabels = perms
    .map((p) => {
      const key = typeof p === 'string' ? p : (p as Permission).codename
      return PERM_GROUPS[key]?.label ?? key.replace(/can_|_/g, ' ').trim()
    })
    .slice(0, 5)

  const extra = perms.length - permLabels.length

  return (
    <View style={{
      backgroundColor: theme.colors.surface,
      marginHorizontal: 16,
      marginVertical: 6,
      borderRadius: 14,
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
    }}>
      {/* Role header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
<View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: `${theme.primary[500]}15`, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={role.is_system ? 'shield' : 'shield-outline'} size={20} color={theme.primary[600]} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: theme.colors.text }}>{role.name}</Text>
          {role.is_system && <View style={{ backgroundColor: '#ede9fe', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 }}><Text style={{ fontSize: 9, fontWeight: '700', color: '#7c3aed' }}>SYSTEM</Text></View>}
        </View>
        {role.description ? <Text style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 1 }} numberOfLines={1}>{role.description}</Text> : null}
      </View>
      {role.staff_count != null && (
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: theme.colors.text }}>{role.staff_count}</Text>
          <Text style={{ fontSize: 10, color: theme.colors.textMuted }}>staff</Text>
        </View>
      )}
      {!role.is_system && (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <RoleGuard permission="roles.manage">
            <TouchableOpacity onPress={onEdit} style={{ backgroundColor: theme.colors.background, borderRadius: 20, padding: 7 }}>
              <Ionicons name="pencil-outline" size={14} color={theme.colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity onPress={onDelete} style={{ backgroundColor: '#fee2e2', borderRadius: 20, padding: 7 }}>
              <Ionicons name="trash-outline" size={14} color="#dc2626" />
            </TouchableOpacity>
          </RoleGuard>
        </View>
      )}
      </View>

      {/* Permissions */}
      {permLabels.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {permLabels.map((label) => (
            <View
              key={label}
              style={{
                backgroundColor: theme.colors.background,
                borderRadius: 20,
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '500', color: theme.colors.textSecondary }}>
                {label}
              </Text>
            </View>
          ))}
          {extra > 0 && (
            <View style={{ backgroundColor: `${theme.primary[500]}12`, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: theme.primary[600] }}>+{extra} more</Text>
            </View>
          )}
        </View>
      )}
    </View>
  )
}

export default function RolesScreen() {
  const theme = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<Role | null>(null)

  const { data, isLoading, refetch, isRefetching } = useRoleList()
  const roles: Role[] = (data as any) ?? []

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(ROLES.DELETE(id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.roles }),
    onError: () => Alert.alert('Error', 'Could not delete role'),
  })

  function confirmDelete(r: Role) {
    Alert.alert('Delete Role', `Delete "${r.name}"? Staff with this role may lose permissions.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(r.id) },
    ])
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={{ paddingTop: insets.top + 14, paddingHorizontal: 16, paddingBottom: 18, backgroundColor: theme.primary[600] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <DrawerToggle />
          <Text style={{ flex: 1, fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: -0.3 }}>Roles</Text>
          {roles.length > 0 && (
            <View style={{ backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
              <Text style={{ fontSize: 12, color: '#fff', fontWeight: '600' }}>{roles.length} roles</Text>
            </View>
          )}
          <RoleGuard permission="roles.manage">
            <TouchableOpacity onPress={() => setShowCreate(true)} style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: 7 }}>
              <Ionicons name="add" size={20} color="#fff" />
            </TouchableOpacity>
          </RoleGuard>
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.primary[500]} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingTop: 10, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.primary[500]} />}
          showsVerticalScrollIndicator={false}
        >
          {roles.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 80, gap: 12 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="shield-outline" size={28} color={theme.colors.textMuted} />
              </View>
              <Text style={{ fontSize: 15, color: theme.colors.textMuted, fontWeight: '500' }}>No roles configured</Text>
            </View>
          ) : (
            roles.map((role) => <RoleCard key={role.id} role={role} onEdit={() => setEditTarget(role)} onDelete={() => confirmDelete(role)} />)
          )}
        </ScrollView>
      )}

      <RoleModal visible={showCreate} onClose={() => setShowCreate(false)} onSaved={() => qc.invalidateQueries({ queryKey: QK.roles })} />
      {editTarget && (
        <RoleModal visible role={editTarget} onClose={() => setEditTarget(null)} onSaved={() => qc.invalidateQueries({ queryKey: QK.roles })} />
      )}
    </View>
  )
}
