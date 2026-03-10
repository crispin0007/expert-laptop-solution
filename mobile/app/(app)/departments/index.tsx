import React, { useCallback, useState } from 'react'
import {
  View, Text, TouchableOpacity, ActivityIndicator, RefreshControl,
  Modal, TextInput, KeyboardAvoidingView, ScrollView, Platform, Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { FlashList } from '@shopify/flash-list'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import apiClient from '@/api/client'
import { DEPARTMENTS } from '@/api/endpoints'
import { QK } from '@/constants/queryKeys'
import { useTheme } from '@/theme/ThemeContext'
import { DrawerToggle } from '@/components/ui/AppDrawer'
import { RoleGuard } from '@/guards/RoleGuard'
import { useDepartmentList, type Department } from '@/features/departments/useDepartments'

// ─── Dept Modal (create + edit) ────────────────────────────────────────────
function DeptModal({ visible, dept, onClose, onSaved }: {
  visible: boolean; dept?: Department | null; onClose: () => void; onSaved: () => void
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [name, setName] = useState(dept?.name ?? '')
  const [description, setDescription] = useState(dept?.description ?? '')
  const isEdit = !!dept

  React.useEffect(() => {
    setName(dept?.name ?? '')
    setDescription(dept?.description ?? '')
  }, [dept?.id])

  const mutation = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), description: description.trim() || null }
      return isEdit
        ? apiClient.patch(DEPARTMENTS.UPDATE(dept!.id), body)
        : apiClient.post(DEPARTMENTS.CREATE, body)
    },
    onSuccess: () => { onSaved(); onClose(); setName(''); setDescription('') },
    onError: (e: any) => Alert.alert('Error', e?.response?.data?.message ?? 'Could not save department'),
  })

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderColor: theme.colors.border, flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ flex: 1, fontSize: 18, fontWeight: '800', color: theme.colors.text }}>{isEdit ? 'Edit Department' : 'New Department'}</Text>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={theme.colors.textMuted} /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
          <View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Name *</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Engineering"
              placeholderTextColor={theme.colors.textMuted}
              style={{ backgroundColor: theme.colors.surface, borderRadius: 10, padding: 12, fontSize: 15, color: theme.colors.text, borderWidth: 1, borderColor: theme.colors.border }}
            />
          </View>
          <View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Description</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Optional description…"
              placeholderTextColor={theme.colors.textMuted}
              multiline
              numberOfLines={3}
              style={{ backgroundColor: theme.colors.surface, borderRadius: 10, padding: 12, fontSize: 15, color: theme.colors.text, borderWidth: 1, borderColor: theme.colors.border, minHeight: 80, textAlignVertical: 'top' }}
            />
          </View>
          <TouchableOpacity
            onPress={() => { if (!name.trim()) { Alert.alert('Validation', 'Name is required'); return } mutation.mutate() }}
            disabled={mutation.isPending}
            style={{ backgroundColor: theme.primary[600], borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 8 }}
          >
            {mutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{isEdit ? 'Save Changes' : 'Create Department'}</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ─── Department Card ────────────────────────────────────────────────────────
function DepartmentCard({ dept, onEdit, onDelete }: { dept: Department; onEdit: () => void; onDelete: () => void }) {
  const theme = useTheme()
  const initials = dept.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
  return (
    <View style={{ backgroundColor: theme.colors.surface, marginHorizontal: 16, marginVertical: 5, borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 }}>
      <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: `${theme.primary[500]}15`, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: theme.primary[600] }}>{initials}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: theme.colors.text }}>{dept.name}</Text>
        {dept.description ? <Text style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 2 }} numberOfLines={1}>{dept.description}</Text> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 }}>
          {dept.staff_count != null && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="people-outline" size={12} color={theme.colors.textMuted} />
              <Text style={{ fontSize: 11, color: theme.colors.textMuted }}>{dept.staff_count} members</Text>
            </View>
          )}
          {dept.head_name ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="person-circle-outline" size={12} color={theme.colors.textMuted} />
              <Text style={{ fontSize: 11, color: theme.colors.textMuted }} numberOfLines={1}>{dept.head_name}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <RoleGuard permission="departments.manage">
          <TouchableOpacity onPress={onEdit} style={{ backgroundColor: theme.colors.background, borderRadius: 20, padding: 7 }}>
            <Ionicons name="pencil-outline" size={15} color={theme.colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} style={{ backgroundColor: '#fee2e2', borderRadius: 20, padding: 7 }}>
            <Ionicons name="trash-outline" size={15} color="#dc2626" />
          </TouchableOpacity>
        </RoleGuard>
      </View>
    </View>
  )
}

export default function DepartmentsScreen() {
  const theme = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<Department | null>(null)

  const { data, isLoading, refetch, isRefetching } = useDepartmentList()
  const departments: Department[] = data ?? []

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(DEPARTMENTS.DELETE(id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.departments }),
    onError: () => Alert.alert('Error', 'Could not delete department'),
  })

  function confirmDelete(d: Department) {
    Alert.alert('Delete Department', `Delete "${d.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(d.id) },
    ])
  }

  const renderItem = useCallback(({ item }: { item: Department }) => (
    <DepartmentCard dept={item} onEdit={() => setEditTarget(item)} onDelete={() => confirmDelete(item)} />
  ), [])

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={{ paddingTop: insets.top + 14, paddingHorizontal: 16, paddingBottom: 18, backgroundColor: theme.primary[600] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <DrawerToggle />
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
            <Ionicons name="arrow-back" size={20} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
          <Text style={{ flex: 1, fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: -0.3 }}>Departments</Text>
          {departments.length > 0 && (
            <View style={{ backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
              <Text style={{ fontSize: 12, color: '#fff', fontWeight: '600' }}>{departments.length}</Text>
            </View>
          )}
          <RoleGuard permission="departments.manage">
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
        <FlashList
          data={departments}
          renderItem={renderItem}
          estimatedItemSize={90}
          keyExtractor={(d) => String(d.id)}
          contentContainerStyle={{ paddingTop: 10, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.primary[500]} />}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 80, gap: 12 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="business-outline" size={28} color={theme.colors.textMuted} />
              </View>
              <Text style={{ fontSize: 15, color: theme.colors.textMuted, fontWeight: '500' }}>No departments yet</Text>
              <RoleGuard permission="departments.manage">
                <TouchableOpacity onPress={() => setShowCreate(true)} style={{ backgroundColor: theme.primary[600], borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 }}>
                  <Text style={{ color: '#fff', fontWeight: '600' }}>Create first department</Text>
                </TouchableOpacity>
              </RoleGuard>
            </View>
          }
        />
      )}

      <DeptModal visible={showCreate} onClose={() => setShowCreate(false)} onSaved={() => qc.invalidateQueries({ queryKey: QK.departments })} />
      {editTarget && (
        <DeptModal visible dept={editTarget} onClose={() => setEditTarget(null)} onSaved={() => qc.invalidateQueries({ queryKey: QK.departments })} />
      )}
    </View>
  )
}
