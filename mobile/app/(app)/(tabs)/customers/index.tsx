import React, { useCallback, useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, RefreshControl, TextInput, Modal, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { FlashList } from '@shopify/flash-list'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/theme/ThemeContext'
import { DrawerToggle } from '@/components/ui/AppDrawer'
import { RoleGuard } from '@/guards/RoleGuard'
import { ModuleGuard, ModuleLockedScreen } from '@/guards/ModuleGuard'
import { useCustomerList, useCreateCustomer, type Customer } from '@/features/customers/useCustomers'
import { useQueryClient } from '@tanstack/react-query'

// ─── Create Customer Modal ─────────────────────────────────────────────
function CreateCustomerModal({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: () => void }) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [type, setType] = useState<'individual' | 'organization'>('individual')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')

  const createCustomer = useCreateCustomer()

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderColor: theme.colors.border, flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ flex: 1, fontSize: 18, fontWeight: '800', color: theme.colors.text }}>New Customer</Text>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={theme.colors.textMuted} /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
          <View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.textMuted, marginBottom: 6, textTransform: 'uppercase' }}>Name *</Text>
            <TextInput value={name} onChangeText={setName} placeholder="Full name or company" placeholderTextColor={theme.colors.textMuted} style={{ backgroundColor: theme.colors.surface, borderRadius: 10, padding: 12, fontSize: 15, color: theme.colors.text, borderWidth: 1, borderColor: theme.colors.border }} />
          </View>
          <View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.textMuted, marginBottom: 6, textTransform: 'uppercase' }}>Type</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {(['individual', 'organization'] as const).map((t) => (
                <TouchableOpacity key={t} onPress={() => setType(t)} style={{ flex: 1, padding: 10, borderRadius: 10, borderWidth: 2, borderColor: type === t ? theme.primary[600] : theme.colors.border, backgroundColor: type === t ? `${theme.primary[500]}10` : theme.colors.surface, alignItems: 'center' }}>
                  <Text style={{ fontWeight: '600', color: type === t ? theme.primary[600] : theme.colors.textMuted, textTransform: 'capitalize' }}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.textMuted, marginBottom: 6, textTransform: 'uppercase' }}>Phone</Text>
            <TextInput value={phone} onChangeText={setPhone} placeholder="+977-xxx" placeholderTextColor={theme.colors.textMuted} keyboardType="phone-pad" style={{ backgroundColor: theme.colors.surface, borderRadius: 10, padding: 12, fontSize: 15, color: theme.colors.text, borderWidth: 1, borderColor: theme.colors.border }} />
          </View>
          <View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.textMuted, marginBottom: 6, textTransform: 'uppercase' }}>Email</Text>
            <TextInput value={email} onChangeText={setEmail} placeholder="email@example.com" placeholderTextColor={theme.colors.textMuted} keyboardType="email-address" autoCapitalize="none" style={{ backgroundColor: theme.colors.surface, borderRadius: 10, padding: 12, fontSize: 15, color: theme.colors.text, borderWidth: 1, borderColor: theme.colors.border }} />
          </View>
          <View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.textMuted, marginBottom: 6, textTransform: 'uppercase' }}>Address</Text>
            <TextInput value={address} onChangeText={setAddress} placeholder="City, District" placeholderTextColor={theme.colors.textMuted} style={{ backgroundColor: theme.colors.surface, borderRadius: 10, padding: 12, fontSize: 15, color: theme.colors.text, borderWidth: 1, borderColor: theme.colors.border }} />
          </View>
          <View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.textMuted, marginBottom: 6, textTransform: 'uppercase' }}>Notes</Text>
            <TextInput value={notes} onChangeText={setNotes} placeholder="Optional notes…" placeholderTextColor={theme.colors.textMuted} multiline numberOfLines={3} style={{ backgroundColor: theme.colors.surface, borderRadius: 10, padding: 12, fontSize: 15, color: theme.colors.text, borderWidth: 1, borderColor: theme.colors.border, minHeight: 80, textAlignVertical: 'top' }} />
          </View>
          <TouchableOpacity
            onPress={() => {
              if (!name.trim()) { Alert.alert('Validation', 'Name is required'); return }
              createCustomer.mutate(
                { name: name.trim(), phone: phone.trim() || null, email: email.trim() || null, type, street: address.trim() || null, notes: notes.trim() || null },
                {
                  onSuccess: () => { onCreated(); onClose(); setName(''); setPhone(''); setEmail(''); setAddress(''); setNotes('') },
                  onError: (e: any) => Alert.alert('Error', e?.response?.data?.message ?? 'Could not create customer'),
                },
              )
            }}
            disabled={createCustomer.isPending}
            style={{ backgroundColor: theme.primary[600], borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 4 }}
          >
            {createCustomer.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Create Customer</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function CustomerCard({ customer, onPress }: { customer: Customer; onPress: () => void }) {
  const theme = useTheme()
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        backgroundColor: theme.colors.surface, marginHorizontal: 16, marginVertical: 5,
        borderRadius: theme.radius.lg, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
        ...theme.shadow.sm,
      }}
    >
      {/* Avatar */}
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: theme.primary[100], alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: theme.fontSize.base, fontWeight: theme.fontWeight.bold, color: theme.primary[600] }}>
          {customer.name.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold, color: theme.colors.text }}>{customer.name}</Text>
        <Text style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted, marginTop: 2 }}>
          {customer.customer_number} · {customer.type}
        </Text>
        {(customer.phone || customer.email) && (
          <Text style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted, marginTop: 1 }}>
            {customer.phone ?? customer.email}
          </Text>
        )}
      </View>
      {!customer.is_active && (
        <View style={{ backgroundColor: theme.colors.errorLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: theme.radius.full }}>
          <Text style={{ fontSize: 10, color: theme.colors.error, fontWeight: theme.fontWeight.semibold }}>Inactive</Text>
        </View>
      )}
    </TouchableOpacity>
  )
}

export default function CustomersScreen() {
  const theme = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch, isRefetching } = useCustomerList({ search })

  const allCustomers = (data?.pages ?? []).flatMap((p: any) =>
    Array.isArray(p) ? p : (p?.results ?? [])
  ).filter(Boolean) as Customer[]

  const renderItem = useCallback(({ item }: { item: Customer }) => (
    <CustomerCard customer={item} onPress={() => router.push(`/(app)/(tabs)/customers/${item.id}` as never)} />
  ), [router])

  return (
    <ModuleGuard module="customers" fallback={<ModuleLockedScreen module="Customers" />}>
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={{ paddingTop: insets.top + 14, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: theme.colors.surface, borderBottomWidth: 0.5, borderBottomColor: theme.colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <DrawerToggle light />
          <Text style={{ fontSize: 20, fontWeight: '800', color: theme.colors.text, letterSpacing: -0.3 }}>Customers</Text>
          <RoleGuard permission="customers.manage">
            <TouchableOpacity onPress={() => setShowCreate(true)} style={{ backgroundColor: theme.primary[600], borderRadius: 20, padding: 7 }}>
              <Ionicons name="person-add-outline" size={18} color="#fff" />
            </TouchableOpacity>
          </RoleGuard>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.background, borderRadius: 10, paddingHorizontal: 10, borderWidth: 1, borderColor: theme.colors.border }}>
          <Ionicons name="search-outline" size={16} color={theme.colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search customers…"
            placeholderTextColor={theme.colors.textMuted}
            style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 8, fontSize: 14, color: theme.colors.text }}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={theme.colors.textMuted} />
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
          data={allCustomers}
          renderItem={renderItem}
          estimatedItemSize={80}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={{ paddingTop: 10, paddingBottom: insets.bottom + 20 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.primary[500]} />}
          onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage() }}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Text style={{ fontSize: theme.fontSize.base, color: theme.colors.textMuted }}>No customers found</Text>
            </View>
          }
        />
      )}
      <CreateCustomerModal visible={showCreate} onClose={() => setShowCreate(false)} onCreated={() => qc.invalidateQueries({ queryKey: ['customers'] })} />
    </View>
    </ModuleGuard>
  )
}
