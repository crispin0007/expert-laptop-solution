import React, { useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, FlatList, Linking, RefreshControl, Modal, TextInput, KeyboardAvoidingView, Platform, Alert } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import apiClient from '@/api/client'
import { TICKETS } from '@/api/endpoints'
import { QK } from '@/constants/queryKeys'
import { useTheme } from '@/theme/ThemeContext'
import { StatusBadge, PriorityBadge } from '@/components/ui/Badge'
import { RoleGuard } from '@/guards/RoleGuard'
import { useCustomer, useUpdateCustomer, useCustomerContacts, useCreateContact } from '@/features/customers/useCustomers'
import { useQuery, useQueryClient } from '@tanstack/react-query'

const PROVINCE_CHOICES: { value: string; label: string }[] = [
  { value: 'koshi', label: 'Koshi Province' },
  { value: 'madhesh', label: 'Madhesh Province' },
  { value: 'bagmati', label: 'Bagmati Province' },
  { value: 'gandaki', label: 'Gandaki Province' },
  { value: 'lumbini', label: 'Lumbini Province' },
  { value: 'karnali', label: 'Karnali Province' },
  { value: 'sudurpashchim', label: 'Sudurpashchim Province' },
]

interface Customer {
  id: number
  customer_number?: string
  name: string
  type?: 'individual' | 'organization'
  email?: string | null
  phone?: string | null
  /** street / tole — backend field name is `street` (not `address`) */
  street?: string | null
  district?: string | null
  municipality?: string | null
  ward_no?: string | null
  province?: string | null
  is_active: boolean
  created_at: string
  notes?: string | null
  full_address?: string | null
}

interface Ticket {
  id: number
  ticket_number: string
  title: string
  status: string
  priority: string
  created_at: string
  sla_deadline?: string
  assigned_to_name?: string | null
  team_member_names?: string[]
}

type Tab = 'info' | 'tickets'

// ─── Edit Customer Modal ───────────────────────────────────────────────────────
function EditCustomerModal({ visible, customer, onClose, onSaved }: { visible: boolean; customer: Customer; onClose: () => void; onSaved: () => void }) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [name, setName] = useState(customer.name)
  const [phone, setPhone] = useState(customer.phone ?? '')
  const [email, setEmail] = useState(customer.email ?? '')
  const [street, setStreet] = useState(customer.street ?? '')
  const [province, setProvince] = useState(customer.province ?? '')
  const [district, setDistrict] = useState(customer.district ?? '')
  const [municipality, setMunicipality] = useState(customer.municipality ?? '')
  const [wardNo, setWardNo] = useState(customer.ward_no ?? '')
  const [notes, setNotes] = useState(customer.notes ?? '')

  React.useEffect(() => {
    setName(customer.name)
    setPhone(customer.phone ?? '')
    setEmail(customer.email ?? '')
    setStreet(customer.street ?? '')
    setProvince(customer.province ?? '')
    setDistrict(customer.district ?? '')
    setMunicipality(customer.municipality ?? '')
    setWardNo(customer.ward_no ?? '')
    setNotes(customer.notes ?? '')
  }, [customer.id])

  const mutation = useUpdateCustomer(customer.id)

  const fieldStyle = { backgroundColor: theme.colors.surface, borderRadius: 10, padding: 12, fontSize: 15, color: theme.colors.text, borderWidth: 1, borderColor: theme.colors.border } as const
  const labelStyle = { fontSize: 12, fontWeight: '600' as const, color: theme.colors.textMuted, marginBottom: 6, textTransform: 'uppercase' as const }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderColor: theme.colors.border, flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ flex: 1, fontSize: 18, fontWeight: '800', color: theme.colors.text }}>Edit Customer</Text>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={theme.colors.textMuted} /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
          {/* Basic fields */}
          {[{ label: 'Name *', value: name, onChange: setName, placeholder: 'Full name' },
            { label: 'Phone', value: phone, onChange: setPhone, placeholder: '+977-xxx', keyboardType: 'phone-pad' as const },
            { label: 'Email', value: email, onChange: setEmail, placeholder: 'email@example.com', autoCapitalize: 'none' as const },
          ].map(({ label, value, onChange, placeholder, ...props }) => (
            <View key={label}>
              <Text style={labelStyle}>{label}</Text>
              <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={theme.colors.textMuted} style={fieldStyle} {...props} />
            </View>
          ))}

          {/* Province picker */}
          <View>
            <Text style={labelStyle}>Province</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {PROVINCE_CHOICES.map((p) => (
                <TouchableOpacity
                  key={p.value}
                  onPress={() => setProvince(province === p.value ? '' : p.value)}
                  style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: province === p.value ? theme.primary[500] : theme.colors.border, backgroundColor: province === p.value ? `${theme.primary[500]}18` : theme.colors.surface }}
                >
                  <Text style={{ fontSize: 13, color: province === p.value ? theme.primary[600] : theme.colors.textMuted, fontWeight: province === p.value ? '700' : '400' }}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* District */}
          <View>
            <Text style={labelStyle}>District</Text>
            <TextInput value={district} onChangeText={setDistrict} placeholder="e.g. Kathmandu" placeholderTextColor={theme.colors.textMuted} style={fieldStyle} />
          </View>

          {/* Municipality */}
          <View>
            <Text style={labelStyle}>Municipality / City</Text>
            <TextInput value={municipality} onChangeText={setMunicipality} placeholder="e.g. Kathmandu Metropolitan" placeholderTextColor={theme.colors.textMuted} style={fieldStyle} />
          </View>

          {/* Ward No */}
          <View>
            <Text style={labelStyle}>Ward No.</Text>
            <TextInput value={wardNo} onChangeText={setWardNo} placeholder="e.g. 10" placeholderTextColor={theme.colors.textMuted} keyboardType="numeric" style={fieldStyle} />
          </View>

          {/* Street address */}
          <View>
            <Text style={labelStyle}>Street / Tole</Text>
            <TextInput value={street} onChangeText={setStreet} placeholder="Street / Tole / Landmark" placeholderTextColor={theme.colors.textMuted} style={fieldStyle} />
          </View>

          <View>
            <Text style={labelStyle}>Notes</Text>
            <TextInput value={notes} onChangeText={setNotes} placeholder="Notes…" placeholderTextColor={theme.colors.textMuted} multiline numberOfLines={3} style={{ ...fieldStyle, minHeight: 80, textAlignVertical: 'top' }} />
          </View>
          <TouchableOpacity
            onPress={() => {
              if (!name.trim()) { Alert.alert('Validation', 'Name is required'); return }
              mutation.mutate(
                { name: name.trim(), phone: phone.trim() || null, email: email.trim() || null, street: street.trim() || null, province: province || null, district: district.trim() || null, municipality: municipality.trim() || null, ward_no: wardNo.trim() || null, notes: notes.trim() || null },
                { onSuccess: () => { onSaved(); onClose() }, onError: (e: any) => Alert.alert('Error', e?.response?.data?.message ?? 'Could not update customer') }
              )
            }}
            disabled={mutation.isPending}
            style={{ backgroundColor: theme.primary[600], borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 4 }}
          >
            {mutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Save Changes</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const theme = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<Tab>('info')
  const [showEdit, setShowEdit] = useState(false)

  const validId = id && id !== 'undefined'

  const { data: customerData, isLoading, refetch, isRefetching } = useCustomer(id!)
  const customer = customerData as unknown as Customer

  // Use a distinct key ('customer-tickets') to avoid stale-cache collisions with the
  // global tickets infinite-query which previously stored the raw envelope under QK.tickets(...).
  const { data: tickets, isLoading: ticketsLoading } = useQuery<Ticket[]>({
    queryKey: ['customer-tickets', id],
    queryFn: () =>
      apiClient.get(TICKETS.LIST, { params: { customer: id, page_size: 100 } }).then((r) => {
        // NexusPageNumberPagination envelope: { success, data: [...], meta: {...} }
        const raw = r.data
        if (Array.isArray(raw?.data)) return raw.data as Ticket[]
        if (Array.isArray(raw?.results)) return raw.results as Ticket[]
        if (Array.isArray(raw)) return raw as Ticket[]
        return []
      }),
    enabled: !!validId && activeTab === 'tickets',
    staleTime: 30_000,
  })

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator size="large" color={theme.primary[500]} />
      </View>
    )
  }

  if (!customer) return null

  const initials = (customer.name || '?').split(' ').slice(0, 2).map((w: string) => w[0]?.toUpperCase()).join('')

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 20, backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(app)/(tabs)/customers')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ padding: 4 }}>
            <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <RoleGuard permission="customers.manage">
            <TouchableOpacity onPress={() => setShowEdit(true)} style={{ backgroundColor: `${theme.primary[500]}12`, borderRadius: 20, padding: 8, marginLeft: 'auto' as any }}>
              <Ionicons name="pencil-outline" size={16} color={theme.primary[600]} />
            </TouchableOpacity>
          </RoleGuard>
        </View>

        {/* Customer avatar + name */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: theme.primary[100], alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: theme.fontWeight.bold, color: theme.primary[700] }}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: theme.fontSize.xl, fontWeight: theme.fontWeight.bold, color: theme.colors.text }}>{customer.name}</Text>
            <View style={{ marginTop: 6 }}>
              <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, backgroundColor: customer.is_active ? '#f0fdf4' : '#fef2f2', alignSelf: 'flex-start' }}>
                <Text style={{ fontSize: theme.fontSize.xs, color: customer.is_active ? '#166534' : '#991b1b', fontWeight: theme.fontWeight.semibold }}>
                  {customer.is_active ? 'Active' : 'Inactive'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* Tab bar */}
      <View style={{ flexDirection: 'row', backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
        {(['info', 'tickets'] as Tab[]).map((tab) => (
          <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)} style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: activeTab === tab ? theme.primary[500] : 'transparent' }}>
            <Text style={{ fontSize: theme.fontSize.sm, fontWeight: activeTab === tab ? theme.fontWeight.semibold : theme.fontWeight.regular, color: activeTab === tab ? theme.primary[600] : theme.colors.textMuted, textTransform: 'capitalize' }}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Info tab */}
      {activeTab === 'info' && (
        <ScrollView refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.primary[500]} />} contentContainerStyle={{ padding: 16, gap: 16 }}>
          <View style={{ backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' }}>
            <Text style={{ fontSize: theme.fontSize.xs, fontWeight: theme.fontWeight.semibold, color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>Contact</Text>

            {customer.email && (
              <TouchableOpacity onPress={() => Linking.openURL(`mailto:${customer.email}`)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                <Text style={{ fontSize: theme.fontSize.sm, color: theme.colors.textMuted }}>Email</Text>
                <Text style={{ fontSize: theme.fontSize.sm, color: theme.primary[600], fontWeight: theme.fontWeight.medium }}>{customer.email}</Text>
              </TouchableOpacity>
            )}
            {customer.phone && (
              <TouchableOpacity onPress={() => Linking.openURL(`tel:${customer.phone}`)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                <Text style={{ fontSize: theme.fontSize.sm, color: theme.colors.textMuted }}>Phone</Text>
                <Text style={{ fontSize: theme.fontSize.sm, color: theme.primary[600], fontWeight: theme.fontWeight.medium }}>{customer.phone}</Text>
              </TouchableOpacity>
            )}
            {customer.province && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                <Text style={{ fontSize: theme.fontSize.sm, color: theme.colors.textMuted }}>Province</Text>
                <Text style={{ fontSize: theme.fontSize.sm, color: theme.colors.text, fontWeight: theme.fontWeight.medium }}>{PROVINCE_CHOICES.find((p) => p.value === customer.province)?.label ?? customer.province}</Text>
              </View>
            )}
            {customer.district && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                <Text style={{ fontSize: theme.fontSize.sm, color: theme.colors.textMuted }}>District</Text>
                <Text style={{ fontSize: theme.fontSize.sm, color: theme.colors.text, fontWeight: theme.fontWeight.medium }}>{customer.district}</Text>
              </View>
            )}
            {customer.municipality && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                <Text style={{ fontSize: theme.fontSize.sm, color: theme.colors.textMuted }}>Municipality</Text>
                <Text style={{ fontSize: theme.fontSize.sm, color: theme.colors.text, fontWeight: theme.fontWeight.medium }}>{customer.municipality}</Text>
              </View>
            )}
            {customer.ward_no && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                <Text style={{ fontSize: theme.fontSize.sm, color: theme.colors.textMuted }}>Ward No.</Text>
                <Text style={{ fontSize: theme.fontSize.sm, color: theme.colors.text, fontWeight: theme.fontWeight.medium }}>{customer.ward_no}</Text>
              </View>
            )}
            {customer.street && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                <Text style={{ fontSize: theme.fontSize.sm, color: theme.colors.textMuted }}>Street</Text>
                <Text style={{ fontSize: theme.fontSize.sm, color: theme.colors.text, fontWeight: theme.fontWeight.medium, flex: 1, textAlign: 'right', marginLeft: 16 }}>{customer.street}</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
              <Text style={{ fontSize: theme.fontSize.sm, color: theme.colors.textMuted }}>Customer since</Text>
              <Text style={{ fontSize: theme.fontSize.sm, color: theme.colors.text, fontWeight: theme.fontWeight.medium }}>{new Date(customer.created_at).toLocaleDateString()}</Text>
            </View>
          </View>

          {customer.notes && (
            <View style={{ backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, padding: 16 }}>
              <Text style={{ fontSize: theme.fontSize.xs, fontWeight: theme.fontWeight.semibold, color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Notes</Text>
              <Text style={{ fontSize: theme.fontSize.sm, color: theme.colors.text, lineHeight: 22 }}>{customer.notes}</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Tickets tab */}
      {activeTab === 'tickets' && (
        ticketsLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={theme.primary[500]} />
          </View>
        ) : (
          <FlatList
            data={tickets ?? []}
            keyExtractor={(t) => String(t.id)}
            renderItem={({ item: ticket }) => {
              const isBreached = ticket.sla_deadline && new Date(ticket.sla_deadline) < new Date() && !['closed', 'resolved', 'cancelled'].includes(ticket.status)
              return (
                <TouchableOpacity
                  onPress={() => router.push(`/(app)/(tabs)/tickets/${ticket.id}` as never)}
                  activeOpacity={0.8}
                  style={{ paddingHorizontal: 16, paddingVertical: 14, borderLeftWidth: 3, borderLeftColor: isBreached ? '#ef4444' : 'transparent', borderBottomWidth: 1, borderBottomColor: theme.colors.border }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <Text style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted }}>{ticket.ticket_number}</Text>
                    <Text style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted }}>{new Date(ticket.created_at).toLocaleDateString()}</Text>
                  </View>
                  <Text style={{ fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium, color: theme.colors.text, marginBottom: 8 }} numberOfLines={2}>{ticket.title}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <StatusBadge status={ticket.status} />
                    <PriorityBadge priority={ticket.priority} />
                    {/* Show all assigned staff — supports multi-staff (team_members) */}
                    {(() => {
                      const names = ticket.team_member_names?.length
                        ? ticket.team_member_names
                        : ticket.assigned_to_name ? [ticket.assigned_to_name] : []
                      return names.map((n) => (
                        <View key={n} style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, backgroundColor: `${theme.primary[500]}14` }}>
                          <Text style={{ fontSize: theme.fontSize.xs, color: theme.primary[700] }}>{n}</Text>
                        </View>
                      ))
                    })()}
                  </View>
                </TouchableOpacity>
              )
            }}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingTop: 40 }}>
                <Text style={{ fontSize: 32, marginBottom: 12 }}>🎫</Text>
                <Text style={{ color: theme.colors.textMuted }}>No tickets for this customer</Text>
              </View>
            }
          />
        )
      )}
      {showEdit && customer && (
        <EditCustomerModal
          visible
          customer={customer}
          onClose={() => setShowEdit(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: QK.customer(id!) })}
        />
      )}
    </View>
  )
}
