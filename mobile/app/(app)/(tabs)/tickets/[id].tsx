import React, { useState, useRef } from 'react'
import {
  View, Text, ScrollView, Animated, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, TextInput, Alert, Modal,
  KeyboardAvoidingView, Platform, ActionSheetIOS, Linking, Image, Dimensions,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import { formatDistanceToNowStrict } from 'date-fns'
import { useTheme } from '@/theme/ThemeContext'
import { StatusBadge, PriorityBadge, SlaBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { RoleGuard } from '@/guards/RoleGuard'
import { usePermissions } from '@/hooks/usePermissions'
import { useAuthStore } from '@/store/authStore'
import {
  useTicket, useTicketComments, useTicketTimeline, useTicketProducts,
  useUpdateTicketStatus, useAddComment, useAssignTicket, useTransferTicket,
  useCloseTicket, useAddTicketProduct, useDeleteTicketProduct,
  useTicketAttachments, useAddTicketAttachment, useDeleteTicketAttachment,
  useVehicleList, useUpdateTicketVehicles, useInventoryProductSearch,
  useAvailableSerialNumbers,
  STATUS_TRANSITIONS,
  type TicketComment, type TicketProduct, type TicketAttachment, type Vehicle,
} from '@/features/tickets/useTickets'
import { useStaffPicker, useDepartmentOptions } from '@/features/staff/useStaff'

// ─── Types ──────────────────────────────────────────────────────────────────

type TabKey = 'details' | 'comments' | 'products' | 'attachments' | 'timeline'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isImageFile(filename: string): boolean {
  return /\.(jpe?g|png|gif|webp|bmp)$/i.test(filename)
}

function InfoRow({ label, value, icon }: { label: string; value: string; icon?: string }) {
  const theme = useTheme()
  return (
    <View style={{
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 3,
      elevation: 1,
    }}>
      {icon ? (
        <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon as never} size={14} color={theme.colors.textMuted} />
        </View>
      ) : null}
      <Text style={{ fontSize: 13, color: theme.colors.textMuted, fontWeight: '500', flex: 1 }}>{label}</Text>
      <Text style={{ fontSize: 13, color: theme.colors.text, fontWeight: '600', maxWidth: '55%', textAlign: 'right' }} numberOfLines={2}>{value || '—'}</Text>
    </View>
  )
}

function SectionHeader({ title }: { title: string }) {
  const theme = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, marginTop: 6 }}>
      <View style={{ height: 1, flex: 1, backgroundColor: theme.colors.border }} />
      <Text style={{ fontSize: 10, fontWeight: '800', color: theme.colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase' }}>{title}</Text>
      <View style={{ height: 1, flex: 1, backgroundColor: theme.colors.border }} />
    </View>
  )
}

const STATUS_LABELS: Record<string, string> = {
  open: 'Open', in_progress: 'In Progress', pending_customer: 'Pending',
  resolved: 'Resolved', closed: 'Closed', cancelled: 'Cancelled',
}

// ─── Assign Modal ────────────────────────────────────────────────────────────

function AssignModal({ ticketId, visible, onClose }: { ticketId: number; visible: boolean; onClose: () => void }) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const { data: staff } = useStaffPicker(search)
  const assignMutation = useAssignTicket(ticketId)

  function handleConfirm() {
    if (!selectedId) return
    assignMutation.mutate(selectedId, {
      onSuccess: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); onClose(); setSelectedId(null); setSearch('') },
      onError: () => Alert.alert('Error', 'Failed to assign ticket.'),
    })
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <TouchableOpacity onPress={onClose}><Text style={{ color: theme.colors.textMuted, fontSize: 14 }}>Cancel</Text></TouchableOpacity>
            <Text style={{ fontSize: 16, fontWeight: '700', color: theme.colors.text }}>Assign Ticket</Text>
            <Button label="Assign" size="sm" onPress={handleConfirm} disabled={!selectedId} loading={assignMutation.isPending} />
          </View>
          <Input value={search} onChangeText={setSearch} placeholder="Search staff…" />
        </View>
        <FlatList
          data={staff ?? []}
          keyExtractor={(s) => String(s.id)}
          renderItem={({ item: s }) => {
            const selected = selectedId === s.id
            return (
              <TouchableOpacity onPress={() => setSelectedId(selected ? null : s.id)} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: selected ? theme.primary[50] : undefined }}>
                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: theme.primary[100], alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: theme.primary[700] }}>{(s.full_name ?? '?')[0]?.toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.text }}>{s.full_name}</Text>
                  {s.department_name ? <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>{s.department_name}</Text> : null}
                </View>
                {selected && <Ionicons name="checkmark-circle" size={22} color={theme.primary[500]} />}
              </TouchableOpacity>
            )
          }}
          ListEmptyComponent={<View style={{ alignItems: 'center', paddingTop: 40 }}><Text style={{ color: theme.colors.textMuted, fontSize: 14 }}>No staff found</Text></View>}
        />
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ─── Transfer Modal ──────────────────────────────────────────────────────────

function TransferModal({ ticketId, visible, onClose }: { ticketId: number; visible: boolean; onClose: () => void }) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const { data: departments } = useDepartmentOptions()
  const transferMutation = useTransferTicket(ticketId)

  function handleConfirm() {
    if (!selectedDeptId) return
    transferMutation.mutate({ department: selectedDeptId, reason: reason.trim() || undefined }, {
      onSuccess: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); onClose(); setSelectedDeptId(null); setReason('') },
      onError: () => Alert.alert('Error', 'Failed to transfer ticket.'),
    })
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <TouchableOpacity onPress={onClose}><Text style={{ color: theme.colors.textMuted, fontSize: 14 }}>Cancel</Text></TouchableOpacity>
            <Text style={{ fontSize: 16, fontWeight: '700', color: theme.colors.text }}>Transfer Ticket</Text>
            <Button label="Transfer" size="sm" onPress={handleConfirm} disabled={!selectedDeptId} loading={transferMutation.isPending} />
          </View>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
          <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>Select the department to transfer this ticket to.</Text>
          <View style={{ gap: 8 }}>
            {(departments ?? []).map((dept) => {
              const active = selectedDeptId === dept.id
              return (
                <TouchableOpacity key={dept.id} onPress={() => setSelectedDeptId(active ? null : dept.id)} style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 10, borderWidth: 2, borderColor: active ? theme.primary[500] : theme.colors.border, backgroundColor: active ? theme.primary[50] : theme.colors.surface }}>
                  <Ionicons name="business-outline" size={18} color={active ? theme.primary[600] : theme.colors.textMuted} style={{ marginRight: 10 }} />
                  <Text style={{ fontSize: 14, fontWeight: '600', color: active ? theme.primary[700] : theme.colors.text, flex: 1 }}>{dept.name}</Text>
                  {active && <Ionicons name="checkmark-circle" size={20} color={theme.primary[500]} />}
                </TouchableOpacity>
              )
            })}
          </View>
          <View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.text, marginBottom: 6 }}>Transfer Reason (optional)</Text>
            <TextInput value={reason} onChangeText={setReason} placeholder="Why are you transferring this ticket?" placeholderTextColor={theme.colors.textMuted} multiline numberOfLines={4} textAlignVertical="top" style={{ backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, padding: 12, fontSize: 14, color: theme.colors.text, minHeight: 90 }} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ─── Close Modal ─────────────────────────────────────────────────────────────

function CloseModal({ ticketId, visible, onClose }: { ticketId: number; visible: boolean; onClose: () => void }) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [notes, setNotes] = useState('')
  const closeMutation = useCloseTicket(ticketId)

  function handleClose() {
    Alert.alert('Close Ticket', 'This will permanently close the ticket. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Close Ticket', style: 'destructive', onPress: () => closeMutation.mutate({ resolution_notes: notes.trim() || undefined }, {
          onSuccess: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); onClose(); setNotes('') },
          onError: () => Alert.alert('Error', 'Failed to close ticket.'),
        }) },
    ])
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <TouchableOpacity onPress={onClose}><Text style={{ color: theme.colors.textMuted, fontSize: 14 }}>Cancel</Text></TouchableOpacity>
            <Text style={{ fontSize: 16, fontWeight: '700', color: theme.colors.text }}>Close Ticket</Text>
            <View style={{ width: 60 }} />
          </View>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          <View style={{ backgroundColor: '#fef2f2', borderRadius: 10, padding: 14, flexDirection: 'row', gap: 10 }}>
            <Ionicons name="warning-outline" size={20} color="#dc2626" />
            <Text style={{ fontSize: 13, color: '#991b1b', flex: 1, lineHeight: 20 }}>Closing a ticket moves it to a final state. Make sure all work is done and the customer is satisfied.</Text>
          </View>
          <View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.text, marginBottom: 6 }}>Resolution Notes</Text>
            <TextInput value={notes} onChangeText={setNotes} placeholder="Describe how the issue was resolved…" placeholderTextColor={theme.colors.textMuted} multiline numberOfLines={5} textAlignVertical="top" style={{ backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, padding: 12, fontSize: 14, color: theme.colors.text, minHeight: 110 }} />
          </View>
          <Button label="Close Ticket" variant="destructive" onPress={handleClose} loading={closeMutation.isPending} fullWidth />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ─── Add Product Modal ───────────────────────────────────────────────────────

function AddProductModal({ ticketId, visible, onClose }: { ticketId: number; visible: boolean; onClose: () => void }) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<{ id: number; has_warranty: boolean } | null>(null)
  const [selectedSerial, setSelectedSerial] = useState<number | null>(null)
  const [qty, setQty] = useState(1)
  const { data: products } = useInventoryProductSearch(search)
  const { data: availableSerials = [] } = useAvailableSerialNumbers(selectedProduct?.has_warranty ? selectedProduct.id : null)
  const addMutation = useAddTicketProduct(ticketId)

  function handleConfirm() {
    if (!selectedId) return
    if (selectedProduct?.has_warranty && !selectedSerial) return
    addMutation.mutate(
      { product: selectedId, quantity: qty, serial_number: selectedSerial ?? null },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
          onClose(); setSelectedId(null); setSelectedProduct(null); setSelectedSerial(null); setSearch(''); setQty(1)
        },
        onError: () => Alert.alert('Error', 'Failed to add product.'),
      },
    )
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <TouchableOpacity onPress={onClose}><Text style={{ color: theme.colors.textMuted, fontSize: 14 }}>Cancel</Text></TouchableOpacity>
            <Text style={{ fontSize: 16, fontWeight: '700', color: theme.colors.text }}>Add Product</Text>
            <Button label="Add" size="sm" onPress={handleConfirm} disabled={!selectedId || (selectedProduct?.has_warranty === true && !selectedSerial)} loading={addMutation.isPending} />
          </View>
          <Input value={search} onChangeText={setSearch} placeholder="Search products…" />
        </View>
        <FlatList
          data={products ?? []}
          keyExtractor={(p) => String(p.id)}
          renderItem={({ item: p }) => {
            const selected = selectedId === p.id
            return (
              <TouchableOpacity onPress={() => { setSelectedId(selected ? null : p.id); setSelectedProduct(selected ? null : { id: p.id, has_warranty: p.has_warranty }); setSelectedSerial(null); setQty(1) }} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: selected ? theme.primary[50] : undefined }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.text }}>{p.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {p.sku ? <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>SKU: {p.sku}</Text> : null}
                    {p.has_warranty && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                        <Ionicons name="shield-checkmark-outline" size={11} color="#16a34a" />
                        <Text style={{ fontSize: 11, color: '#16a34a', fontWeight: '600' }}>Warranty</Text>
                      </View>
                    )}
                  </View>
                </View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: theme.primary[600], marginRight: 10 }}>Rs {parseFloat(p.unit_price).toLocaleString()}</Text>
                {selected && <Ionicons name="checkmark-circle" size={22} color={theme.primary[500]} />}
              </TouchableOpacity>
            )
          }}
          ListFooterComponent={selectedId ? (
            <View style={{ padding: 16, gap: 14 }}>
              {/* Serial number picker — only for warranty products */}
              {selectedProduct?.has_warranty && (
                <View style={{ gap: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.text }}>Serial Number *</Text>
                  {availableSerials.length === 0 ? (
                    <View style={{ padding: 12, borderRadius: 10, backgroundColor: '#fef9c3', borderWidth: 1, borderColor: '#fde68a' }}>
                      <Text style={{ fontSize: 12, color: '#713f12' }}>No available serial numbers for this product.</Text>
                    </View>
                  ) : (
                    availableSerials.map((s) => (
                      <TouchableOpacity
                        key={s.id}
                        onPress={() => setSelectedSerial(selectedSerial === s.id ? null : s.id)}
                        style={{
                          flexDirection: 'row', alignItems: 'center', padding: 12,
                          borderRadius: 10, borderWidth: 1.5,
                          borderColor: selectedSerial === s.id ? theme.primary[500] : theme.colors.border,
                          backgroundColor: selectedSerial === s.id ? theme.primary[50] : theme.colors.surface,
                        }}
                      >
                        <Ionicons
                          name={selectedSerial === s.id ? 'radio-button-on' : 'radio-button-off'}
                          size={18}
                          color={selectedSerial === s.id ? theme.primary[600] : theme.colors.textMuted}
                          style={{ marginRight: 10 }}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.text }}>{s.serial_number}</Text>
                          {s.warranty_expires ? (
                            <Text style={{ fontSize: 11, color: theme.colors.textMuted }}>Expires {new Date(s.warranty_expires).toLocaleDateString()}</Text>
                          ) : null}
                        </View>
                        {selectedSerial === s.id && <Ionicons name="checkmark-circle" size={20} color={theme.primary[500]} />}
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              )}
              <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.text }}>Quantity</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <TouchableOpacity onPress={() => setQty(Math.max(1, qty - 1))} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="remove" size={18} color={theme.colors.text} />
                </TouchableOpacity>
                <Text style={{ fontSize: 20, fontWeight: '700', color: theme.colors.text, minWidth: 36, textAlign: 'center' }}>{qty}</Text>
                <TouchableOpacity onPress={() => setQty(qty + 1)} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: theme.primary[500], alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="add" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
          ListEmptyComponent={<View style={{ alignItems: 'center', paddingTop: 40 }}><Text style={{ color: theme.colors.textMuted, fontSize: 14 }}>No products found</Text></View>}
        />
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ─── Add Vehicle Modal ───────────────────────────────────────────────────────

function AddVehicleModal({ ticketId, currentVehicleIds, visible, onClose }: { ticketId: number; currentVehicleIds: number[]; visible: boolean; onClose: () => void }) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [selected, setSelected] = useState<number[]>(currentVehicleIds)
  const { data: vehicles } = useVehicleList()
  const updateMutation = useUpdateTicketVehicles(ticketId)

  function toggle(id: number) {
    setSelected((prev) => prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id])
  }

  function handleConfirm() {
    updateMutation.mutate(selected, {
      onSuccess: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); onClose() },
      onError: () => Alert.alert('Error', 'Failed to update vehicles.'),
    })
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <TouchableOpacity onPress={onClose}><Text style={{ color: theme.colors.textMuted, fontSize: 14 }}>Cancel</Text></TouchableOpacity>
            <Text style={{ fontSize: 16, fontWeight: '700', color: theme.colors.text }}>Assign Vehicles</Text>
            <Button label="Save" size="sm" onPress={handleConfirm} loading={updateMutation.isPending} />
          </View>
        </View>
        <FlatList
          data={(vehicles ?? []).filter((v: Vehicle) => v.is_active)}
          keyExtractor={(v) => String(v.id)}
          renderItem={({ item: v }) => {
            const active = selected.includes(v.id)
            return (
              <TouchableOpacity onPress={() => toggle(v.id)} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: active ? theme.primary[50] : undefined }}>
                <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: active ? theme.primary[100] : theme.colors.surface, borderWidth: 1, borderColor: active ? theme.primary[300] : theme.colors.border, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                  <Ionicons name="car-outline" size={18} color={active ? theme.primary[600] : theme.colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.text }}>{v.name}</Text>
                  <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>{v.plate_number}{v.model ? ` · ${v.model}` : ''}</Text>
                </View>
                {active && <Ionicons name="checkmark-circle" size={22} color={theme.primary[500]} />}
              </TouchableOpacity>
            )
          }}
          ListEmptyComponent={<View style={{ alignItems: 'center', paddingTop: 40 }}><Text style={{ color: theme.colors.textMuted, fontSize: 14 }}>No vehicles in fleet</Text></View>}
        />
      </View>
    </Modal>
  )
}

export default function TicketDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const ticketId = Number(id)
  const validId = !isNaN(ticketId) && ticketId > 0
  const theme = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  // ── Collapsing header ─────────────────────────────────────────────────
  const COLLAPSIBLE_H = 128
  // Single Animated.Value – drives both height and opacity from the JS thread
  // throttled to 100ms to prevent jank (10 updates/sec instead of 60)
  const scrollY = useRef(new Animated.Value(0)).current

  const collapsibleHeight = scrollY.interpolate({
    inputRange: [0, COLLAPSIBLE_H],
    outputRange: [COLLAPSIBLE_H, 0],
    extrapolate: 'clamp',
  })
  const collapsibleOpacity = scrollY.interpolate({
    inputRange: [0, COLLAPSIBLE_H * 0.55],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  })

  const [activeTab, setActiveTab] = useState<TabKey>('details')
  const [commentText, setCommentText] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [showAssign, setShowAssign] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [showClose, setShowClose] = useState(false)
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [showAddVehicle, setShowAddVehicle] = useState(false)

  const { isStaff, isManager } = usePermissions()
  const currentUserId = useAuthStore((s) => s.user?.id)

  const { data: ticket, isLoading, refetch, isRefetching } = useTicket(ticketId)
  const { data: comments } = useTicketComments(ticketId, validId && activeTab === 'comments')
  const { data: products, isLoading: productsLoading } = useTicketProducts(ticketId, validId && activeTab === 'products')
  const { data: attachments, isLoading: attachmentsLoading } = useTicketAttachments(ticketId, validId && activeTab === 'attachments')
  const { data: timeline } = useTicketTimeline(ticketId, validId && activeTab === 'timeline')

  // Viewer/custom users can edit only tickets assigned to them
  const isAssigned = !!currentUserId && !!ticket && (
    ticket.assigned_to === currentUserId ||
    (ticket.team_members ?? []).includes(currentUserId)
  )
  // canEdit mirrors web: staff+ always, viewer only if assigned
  const canEdit = isStaff || isAssigned

  // Viewer gets a limited safe-status set (backend enforces the same restriction)
  const VIEWER_SAFE_STATUSES = new Set(['in_progress', 'pending_customer', 'resolved'])

  const updateStatusMutation = useUpdateTicketStatus(ticketId)
  const addCommentMutation = useAddComment(ticketId)
  const deleteProductMutation = useDeleteTicketProduct(ticketId)
  const addAttachmentMutation = useAddTicketAttachment(ticketId)
  const deleteAttachmentMutation = useDeleteTicketAttachment(ticketId)

  function handleStatusChange(targetStatus: string) {
    Alert.alert(
      'Update Status',
      `Change status to "${STATUS_LABELS[targetStatus] ?? targetStatus}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => updateStatusMutation.mutate({ status: targetStatus }, {
            onSuccess: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
            onError: () => Alert.alert('Error', 'Status update failed.'),
          }) },
      ],
    )
  }

  async function handlePickCommentImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) { Alert.alert('Permission required', 'Allow photo access to attach images.'); return }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 })
    if (result.canceled || !result.assets[0]) return
    const asset = result.assets[0]
    const fd = new FormData()
    fd.append('file', { uri: asset.uri, name: asset.fileName ?? 'photo.jpg', type: asset.mimeType ?? 'image/jpeg' } as never)
    addAttachmentMutation.mutate(fd, {
      onSuccess: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); Alert.alert('Uploaded', 'Image attached to ticket.') },
      onError: () => Alert.alert('Error', 'Failed to upload image.'),
    })
  }

  async function handlePickCommentDoc() {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true })
    if (result.canceled || !result.assets[0]) return
    const asset = result.assets[0]
    const fd = new FormData()
    fd.append('file', { uri: asset.uri, name: asset.name, type: asset.mimeType ?? 'application/octet-stream' } as never)
    addAttachmentMutation.mutate(fd, {
      onSuccess: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); Alert.alert('Uploaded', 'File attached to ticket.') },
      onError: () => Alert.alert('Error', 'Failed to upload file.'),
    })
  }

  async function handleAttachmentUpload() {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Camera', 'Photo Library', 'Browse Files'], cancelButtonIndex: 0 },
        async (idx) => {
          if (idx === 1) {
            const perm = await ImagePicker.requestCameraPermissionsAsync()
            if (!perm.granted) return
            const res = await ImagePicker.launchCameraAsync({ quality: 0.8 })
            if (res.canceled || !res.assets[0]) return
            const a = res.assets[0]
            const fd = new FormData()
            fd.append('file', { uri: a.uri, name: a.fileName ?? 'photo.jpg', type: a.mimeType ?? 'image/jpeg' } as never)
            addAttachmentMutation.mutate(fd, { onError: () => Alert.alert('Error', 'Upload failed.') })
          } else if (idx === 2) {
            await handlePickCommentImage()
          } else if (idx === 3) {
            await handlePickCommentDoc()
          }
        },
      )
    } else {
      Alert.alert('Upload', 'Choose source', [
        { text: 'Photo Library', onPress: handlePickCommentImage },
        { text: 'Browse Files', onPress: handlePickCommentDoc },
        { text: 'Cancel', style: 'cancel' },
      ])
    }
  }

  function handleDeleteProduct(productId: number) {
    Alert.alert('Remove Product', 'Remove this product from the ticket?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => deleteProductMutation.mutate(productId, {
          onSuccess: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
          onError: () => Alert.alert('Error', 'Failed to remove product.'),
        }) },
    ])
  }

  function handleDeleteAttachment(attachmentId: number) {
    Alert.alert('Delete Attachment', 'Permanently delete this file?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteAttachmentMutation.mutate(attachmentId, {
          onError: () => Alert.alert('Error', 'Failed to delete attachment.'),
        }) },
    ])
  }

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator size="large" color={theme.primary[500]} />
      </View>
    )
  }

  if (!ticket) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}>
        <Text style={{ color: theme.colors.textMuted }}>Ticket not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={{ color: theme.primary[600] }}>Go back</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // For viewer (non-staff): filter to only the safe status transitions
  const allNextStatuses = STATUS_TRANSITIONS[ticket.status] ?? []
  const nextStatuses = isStaff
    ? allNextStatuses
    : allNextStatuses.filter((s) => VIEWER_SAFE_STATUSES.has(s))

  const tabs: { key: TabKey; label: string; icon: string }[] = [
    { key: 'details', label: 'Details', icon: 'document-text-outline' },
    { key: 'comments', label: 'Comments', icon: 'chatbubbles-outline' },
    { key: 'products', label: 'Products', icon: 'cube-outline' },
    { key: 'attachments', label: 'Files', icon: 'attach-outline' },
    { key: 'timeline', label: 'Timeline', icon: 'time-outline' },
  ]
  const STATUS_VARIANT_MAP: Record<string, 'outline' | 'destructive' | 'primary'> = {
    cancelled: 'destructive', closed: 'destructive', resolved: 'primary',
  }

  const isTicketActive = ticket.status !== 'closed' && ticket.status !== 'cancelled'

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>

      {/* ── Header ── */}
      <View style={{
        paddingTop: insets.top + 10,
        paddingHorizontal: 16,
        paddingBottom: 12,
        backgroundColor: theme.colors.surface,
        borderBottomWidth: 0.5,
        borderBottomColor: theme.colors.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07,
        shadowRadius: 6,
        elevation: 4,
      }}>
        {/* Nav row */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <TouchableOpacity
            onPress={() => router.canGoBack() ? router.back() : router.replace('/(app)/(tabs)/tickets')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4, marginLeft: -4 }}
          >
            <Ionicons name="chevron-back" size={20} color={theme.primary[600]} />
            <Text style={{ color: theme.primary[600], fontSize: 14, fontWeight: '600' }}>Tickets</Text>
          </TouchableOpacity>
          <View style={{
            backgroundColor: theme.primary[50],
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: theme.primary[100],
          }}>
            <Text style={{ fontSize: 11, color: theme.primary[700], fontWeight: '800', letterSpacing: 0.5 }}>
              {ticket.ticket_number}
            </Text>
          </View>
        </View>

        {/* ── Collapsible: title + badges + customer ── */}
        <Animated.View
          style={{ height: collapsibleHeight, overflow: 'hidden' }}
          // promote to GPU layer so height changes don't repaint siblings
          renderToHardwareTextureAndroid
          shouldRasterizeIOS
        >
          <Animated.View style={{ opacity: collapsibleOpacity }}>
          {/* Title */}
          <Text
            style={{ fontSize: 17, fontWeight: '800', color: theme.colors.text, lineHeight: 24, marginBottom: 8 }}
            numberOfLines={2}
          >
            {ticket.title}
          </Text>

          {/* Badge + SLA row */}
          <View style={{ flexDirection: 'row', gap: 7, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
            <StatusBadge status={ticket.status as never} />
            <PriorityBadge priority={ticket.priority as never} />
            {ticket.sla_deadline && (
              <SlaBadge deadline={ticket.sla_deadline} breached={ticket.sla_breached} />
            )}
            {ticket.ticket_type_name ? (
              <View style={{ backgroundColor: theme.colors.background, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: theme.colors.border }}>
                <Text style={{ fontSize: 10, color: theme.colors.textMuted, fontWeight: '600' }}>{ticket.ticket_type_name}</Text>
              </View>
            ) : null}
          </View>

          {/* Customer contact row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: theme.primary[100], alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: theme.primary[700] }}>
                  {(ticket.customer_name ?? '?')[0]?.toUpperCase()}
                </Text>
              </View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.text }}>{ticket.customer_name}</Text>
            </View>
            {ticket.customer_phone ? (
              <TouchableOpacity
                onPress={() => Linking.openURL(`tel:${ticket.customer_phone}`).catch(() => null)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
              >
                <Ionicons name="call-outline" size={12} color={theme.primary[600]} />
                <Text style={{ fontSize: 12, color: theme.primary[600], fontWeight: '500' }}>{ticket.customer_phone}</Text>
              </TouchableOpacity>
            ) : null}
            {ticket.customer_email ? (
              <TouchableOpacity
                onPress={() => Linking.openURL(`mailto:${ticket.customer_email}`).catch(() => null)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
              >
                <Ionicons name="mail-outline" size={12} color={theme.primary[600]} />
                <Text style={{ fontSize: 12, color: theme.primary[600], fontWeight: '500' }} numberOfLines={1}>{ticket.customer_email}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </Animated.View>
        </Animated.View>

      </View>

      {/* ── Tab Bar ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: 8 }}
      >
        {tabs.map((t) => {
          const isActive = activeTab === t.key
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => setActiveTab(t.key)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 11,
                alignItems: 'center',
                flexDirection: 'row',
                gap: 6,
                borderBottomWidth: 2.5,
                borderBottomColor: isActive ? theme.primary[600] : 'transparent',
              }}
            >
              <Ionicons
                name={t.icon as never}
                size={15}
                color={isActive ? theme.primary[600] : theme.colors.textMuted}
              />
              <Text style={{
                fontSize: 13,
                fontWeight: isActive ? '700' : '500',
                color: isActive ? theme.primary[600] : theme.colors.textMuted,
                letterSpacing: 0.1,
              }}>
                {t.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {/* ── Content ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 80, gap: 12 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.primary[500]} />}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false },
        )}
        scrollEventThrottle={100}
        keyboardShouldPersistTaps="handled"
      >

        {/* ════ DETAILS TAB ════ */}
        {activeTab === 'details' && (
          <>
            {/* ── People card ── */}
            <View style={{ backgroundColor: theme.colors.surface, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border }}>
              <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: theme.colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase' }}>People</Text>
              </View>
              <InfoRow label="Customer" value={ticket.customer_name} icon="person-outline" />
              <View style={{ height: 1, backgroundColor: theme.colors.border, marginLeft: 52 }} />
              <InfoRow label="Assigned to" value={ticket.assigned_to_name ?? 'Unassigned'} icon="person-circle-outline" />
              {(ticket.team_member_names ?? []).length > 0 && (
                <>
                  <View style={{ height: 1, backgroundColor: theme.colors.border, marginLeft: 52 }} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="people-outline" size={14} color={theme.colors.textMuted} />
                    </View>
                    <Text style={{ fontSize: 13, color: theme.colors.textMuted, fontWeight: '500', flex: 1 }}>Team</Text>
                    <View style={{ flex: 1, alignItems: 'flex-end', gap: 3 }}>
                      {(ticket.team_member_names ?? []).map((name: string, i: number) => (
                        <Text key={i} style={{ fontSize: 13, color: theme.colors.text, fontWeight: '600' }}>{name}</Text>
                      ))}
                    </View>
                  </View>
                </>
              )}
              <View style={{ height: 1, backgroundColor: theme.colors.border, marginLeft: 52 }} />
              <InfoRow label="Department" value={ticket.department_name ?? '—'} icon="business-outline" />
              <View style={{ height: 1, backgroundColor: theme.colors.border, marginLeft: 52 }} />
              <InfoRow label="Created by" value={ticket.created_by_name ?? '—'} icon="create-outline" />
            </View>

            {/* ── Classification card ── */}
            <View style={{ backgroundColor: theme.colors.surface, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border }}>
              <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: theme.colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase' }}>Classification</Text>
              </View>
              <InfoRow label="Type" value={ticket.ticket_type_name ?? '—'} icon="pricetag-outline" />
              <View style={{ height: 1, backgroundColor: theme.colors.border, marginLeft: 52 }} />
              <InfoRow label="Category" value={ticket.category_name ?? '—'} icon="folder-outline" />
            </View>

            {/* ── Dates card ── */}
            <View style={{ backgroundColor: theme.colors.surface, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border }}>
              <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: theme.colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase' }}>Dates</Text>
              </View>
              <InfoRow label="Created" value={new Date(ticket.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })} icon="calendar-outline" />
              {ticket.sla_deadline ? (
                <>
                  <View style={{ height: 1, backgroundColor: theme.colors.border, marginLeft: 52 }} />
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 13,
                    backgroundColor: ticket.sla_breached ? '#fef2f2' : 'transparent',
                  }}>
                    <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: ticket.sla_breached ? '#fee2e2' : theme.primary[50], alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="timer-outline" size={14} color={ticket.sla_breached ? '#dc2626' : theme.primary[600]} />
                    </View>
                    <Text style={{ fontSize: 13, color: ticket.sla_breached ? '#991b1b' : theme.colors.textMuted, fontWeight: '500', flex: 1 }}>SLA Deadline</Text>
                    <Text style={{ fontSize: 13, color: ticket.sla_breached ? '#dc2626' : theme.colors.text, fontWeight: '700' }}>{new Date(ticket.sla_deadline).toLocaleString()}</Text>
                  </View>
                </>
              ) : null}
              {ticket.resolved_at ? (
                <>
                  <View style={{ height: 1, backgroundColor: theme.colors.border, marginLeft: 52 }} />
                  <InfoRow label="Resolved at" value={new Date(ticket.resolved_at).toLocaleString()} icon="checkmark-circle-outline" />
                </>
              ) : null}
              {ticket.closed_at ? (
                <>
                  <View style={{ height: 1, backgroundColor: theme.colors.border, marginLeft: 52 }} />
                  <InfoRow label="Closed at" value={new Date(ticket.closed_at).toLocaleString()} icon="lock-closed-outline" />
                </>
              ) : null}
            </View>

            {/* ── Description ── */}
            {ticket.description ? (
              <View style={{ backgroundColor: theme.colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.colors.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: theme.primary[50], alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="document-text-outline" size={14} color={theme.primary[600]} />
                  </View>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' }}>Description</Text>
                </View>
                <Text style={{ fontSize: 14, color: theme.colors.textSecondary, lineHeight: 22 }}>{ticket.description}</Text>
              </View>
            ) : null}

            {/* ── Vehicles ── */}
            {((ticket.vehicle_names ?? []).length > 0 || isTicketActive) && (
              <>
                <SectionHeader title="Vehicles" />
                {(ticket.vehicle_names ?? []).length > 0 ? (
                  <View style={{ backgroundColor: theme.colors.surface, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border }}>
                    {ticket.vehicle_names.map((v, vi) => (
                      <View key={v.id}>
                        {vi > 0 && <View style={{ height: 1, backgroundColor: theme.colors.border, marginLeft: 52 }} />}
                        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 10 }}>
                          <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: theme.primary[50], alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name="car-outline" size={14} color={theme.primary[600]} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.text }}>{v.name}</Text>
                            <Text style={{ fontSize: 11, color: theme.colors.textMuted }}>{v.plate_number}</Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={{ fontSize: 13, color: theme.colors.textMuted, paddingVertical: 4 }}>No vehicles assigned</Text>
                )}
                {isTicketActive && (
                  <TouchableOpacity onPress={() => setShowAddVehicle(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderStyle: 'dashed' }}>
                    <Ionicons name="add-circle-outline" size={18} color={theme.primary[600]} />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: theme.primary[600] }}>Assign Vehicles</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            {/* ── Status quick-actions ── */}
            {isTicketActive && canEdit && nextStatuses.length > 0 && (
              <View style={{ backgroundColor: theme.colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.colors.border, gap: 10 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: theme.colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase' }}>Update Status</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {nextStatuses.map((s) => (
                    <Button key={s} label={STATUS_LABELS[s] ?? s} variant={STATUS_VARIANT_MAP[s] ?? 'outline'} size="sm" loading={updateStatusMutation.isPending} onPress={() => handleStatusChange(s)} />
                  ))}
                </View>
              </View>
            )}
          </>
        )}

        {/* ════ COMMENTS TAB ════ */}
        {activeTab === 'comments' && (
          <>
            {(comments ?? []).length === 0 ? (
              <View style={{ alignItems: 'center', paddingTop: 48, gap: 10 }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: theme.primary[50], alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="chatbubbles-outline" size={30} color={theme.primary[300]} />
                </View>
                <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.text }}>No comments yet</Text>
                <Text style={{ fontSize: 13, color: theme.colors.textMuted, textAlign: 'center' }}>Be the first to add a note or reply.</Text>
              </View>
            ) : null}

            {(comments ?? []).map((c: TicketComment) => (
              <View key={c.id} style={{
                backgroundColor: c.is_internal ? theme.primary[50] : theme.colors.surface,
                borderRadius: 14,
                padding: 14,
                borderLeftWidth: 3,
                borderLeftColor: c.is_internal ? theme.primary[400] : theme.colors.border,
                borderWidth: 1,
                borderColor: c.is_internal ? theme.primary[100] : theme.colors.border,
              }}>
                {/* Author row */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <View style={{
                    width: 30, height: 30, borderRadius: 15,
                    backgroundColor: c.is_internal ? theme.primary[600] : theme.colors.border,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: c.is_internal ? '#fff' : theme.colors.textMuted }}>
                      {(c.author_name ?? '?')[0]?.toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.text }}>{c.author_name}</Text>
                    <Text style={{ fontSize: 11, color: theme.colors.textMuted }}>{formatDistanceToNowStrict(new Date(c.created_at), { addSuffix: true })}</Text>
                  </View>
                  {c.is_internal && (
                    <View style={{ backgroundColor: theme.primary[600], paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 }}>
                      <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 0.5 }}>INTERNAL</Text>
                    </View>
                  )}
                </View>
                {/* Body */}
                <Text style={{ fontSize: 14, color: theme.colors.textSecondary, lineHeight: 22 }}>{c.body}</Text>
              </View>
            ))}

            {/* ── Composer ── */}
            {canEdit && (
              <View style={{
                backgroundColor: theme.colors.surface,
                borderRadius: 14,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: isInternal ? theme.primary[200] : theme.colors.border,
              }}>
                {isInternal && (
                  <View style={{ backgroundColor: theme.primary[50], paddingHorizontal: 14, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="eye-off-outline" size={13} color={theme.primary[700]} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: theme.primary[700] }}>Internal note — not visible to customer</Text>
                  </View>
                )}
                <TextInput
                  value={commentText}
                  onChangeText={setCommentText}
                  placeholder={isInternal ? 'Add an internal note…' : 'Write a reply…'}
                  placeholderTextColor={theme.colors.textMuted}
                  multiline
                  textAlignVertical="top"
                  style={{ fontSize: 14, color: theme.colors.text, minHeight: 80, lineHeight: 21, padding: 14, paddingTop: 12 }}
                />
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.colors.border, gap: 4 }}>
                  {/* Internal toggle — staff only; viewers don't have internal notes */}
                  {isStaff && (
                    <TouchableOpacity
                      onPress={() => setIsInternal(!isInternal)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: isInternal ? theme.primary[100] : 'transparent' }}
                    >
                      <Ionicons name={isInternal ? 'eye-off' : 'eye-outline'} size={16} color={isInternal ? theme.primary[600] : theme.colors.textMuted} />
                      <Text style={{ fontSize: 12, fontWeight: '600', color: isInternal ? theme.primary[600] : theme.colors.textMuted }}>Internal</Text>
                    </TouchableOpacity>
                  )}
                  <View style={{ flex: 1 }} />
                  {/* Image attach */}
                  <TouchableOpacity onPress={handlePickCommentImage} disabled={addAttachmentMutation.isPending} style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="image-outline" size={20} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                  {/* Doc attach */}
                  <TouchableOpacity onPress={handlePickCommentDoc} disabled={addAttachmentMutation.isPending} style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="attach-outline" size={20} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                  {/* Send button */}
                  <TouchableOpacity
                    disabled={!commentText.trim() || addCommentMutation.isPending}
                    onPress={() => addCommentMutation.mutate(
                      { body: commentText.trim(), is_internal: isInternal },
                      {
                        onSuccess: () => { setCommentText(''); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) },
                        onError: () => Alert.alert('Error', 'Failed to post comment.'),
                      }
                    )}
                    style={{
                      width: 36, height: 36, borderRadius: 10,
                      backgroundColor: commentText.trim() ? theme.primary[600] : theme.colors.border,
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {addCommentMutation.isPending
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Ionicons name="send" size={16} color="#fff" />
                    }
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
        )}

        {/* ════ PRODUCTS TAB ════ */}
        {activeTab === 'products' && (
          <>
            {canEdit && (
              <TouchableOpacity onPress={() => setShowAddProduct(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderStyle: 'dashed' }}>
                <Ionicons name="add-circle-outline" size={18} color={theme.primary[600]} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: theme.primary[600] }}>Add Product / Service</Text>
              </TouchableOpacity>
            )}

            {productsLoading ? (
              <ActivityIndicator color={theme.primary[500]} style={{ marginTop: 40 }} />
            ) : (products ?? []).length === 0 ? (
              <View style={{ alignItems: 'center', paddingTop: 40, gap: 8 }}>
                <Ionicons name="cube-outline" size={40} color={theme.colors.textMuted} />
                <Text style={{ fontSize: 14, color: theme.colors.textMuted }}>No products or services on this ticket</Text>
              </View>
            ) : (
              <>
                {(products ?? []).map((p: TicketProduct) => (
                  <View key={p.id} style={{ backgroundColor: theme.colors.surface, borderRadius: 12, padding: 14 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: theme.colors.text, flex: 1, marginRight: 8 }}>{p.product_name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: theme.primary[600] }}>Rs {parseFloat(p.line_total).toLocaleString()}</Text>
                        {canEdit && (
                          <TouchableOpacity onPress={() => handleDeleteProduct(p.id)} disabled={deleteProductMutation.isPending}>
                            <Ionicons name="trash-outline" size={16} color="#dc2626" />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 16 }}>
                      <View><Text style={{ fontSize: 11, color: theme.colors.textMuted, marginBottom: 2 }}>QTY</Text><Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.text }}>{p.quantity}</Text></View>
                      <View><Text style={{ fontSize: 11, color: theme.colors.textMuted, marginBottom: 2 }}>UNIT PRICE</Text><Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.text }}>Rs {parseFloat(p.unit_price).toLocaleString()}</Text></View>
                      {parseFloat(p.discount) > 0 ? <View><Text style={{ fontSize: 11, color: theme.colors.textMuted, marginBottom: 2 }}>DISCOUNT</Text><Text style={{ fontSize: 13, fontWeight: '600', color: '#16a34a' }}>-{parseFloat(p.discount)}%</Text></View> : null}
                    </View>
                    {p.serial_number_display ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <Ionicons name="shield-checkmark-outline" size={11} color="#16a34a" />
                        <Text style={{ fontSize: 11, color: '#16a34a', fontWeight: '600' }}>S/N: {p.serial_number_display}</Text>
                      </View>
                    ) : null}
                  </View>
                ))}
                <View style={{ backgroundColor: theme.primary[50], borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.primary[100] }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: theme.primary[800] }}>Total</Text>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: theme.primary[700] }}>Rs {(products ?? []).reduce((sum, p) => sum + parseFloat(p.line_total), 0).toLocaleString()}</Text>
                  </View>
                </View>
              </>
            )}
          </>
        )}

        {/* ════ ATTACHMENTS TAB ════ */}
        {activeTab === 'attachments' && (
          <>
            {canEdit && (
              <TouchableOpacity onPress={handleAttachmentUpload} disabled={addAttachmentMutation.isPending} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 13, borderRadius: 12, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.primary[200], borderStyle: 'dashed' }}>
                {addAttachmentMutation.isPending
                  ? <ActivityIndicator size="small" color={theme.primary[600]} />
                  : <Ionicons name="cloud-upload-outline" size={18} color={theme.primary[600]} />}
                <Text style={{ fontSize: 13, fontWeight: '700', color: theme.primary[600] }}>Upload File or Photo</Text>
              </TouchableOpacity>
            )}

            {attachmentsLoading ? (
              <ActivityIndicator color={theme.primary[500]} style={{ marginTop: 40 }} />
            ) : (() => {
              const ticketAttachments = (attachments ?? []).filter((a: TicketAttachment) => a.comment === null)
              const imageAttachments = ticketAttachments.filter((a: TicketAttachment) => isImageFile(a.file_name))
              const docAttachments = ticketAttachments.filter((a: TicketAttachment) => !isImageFile(a.file_name))
              const imgSize = (Dimensions.get('window').width - 32 - 16 - 8) / 2

              if (ticketAttachments.length === 0) {
                return (
                  <View style={{ alignItems: 'center', paddingTop: 48, gap: 10 }}>
                    <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: theme.primary[50], alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="folder-open-outline" size={30} color={theme.primary[300]} />
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.text }}>No attachments yet</Text>
                    <Text style={{ fontSize: 13, color: theme.colors.textMuted }}>Upload files, photos, or documents.</Text>
                  </View>
                )
              }

              return (
                <>
                  {/* ── Image grid ── */}
                  {imageAttachments.length > 0 && (
                    <>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: theme.colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>Images</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {imageAttachments.map((a: TicketAttachment) => (
                          <TouchableOpacity
                            key={a.id}
                            onPress={() => Linking.openURL(a.url).catch(() => null)}
                            activeOpacity={0.85}
                            style={{ width: imgSize, borderRadius: 12, overflow: 'hidden', backgroundColor: theme.colors.border }}
                          >
                            <Image source={{ uri: a.url }} style={{ width: imgSize, height: imgSize }} resizeMode="cover" />
                            <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.45)', padding: 6 }}>
                              <Text style={{ fontSize: 10, color: '#fff', fontWeight: '600' }} numberOfLines={1}>{a.file_name}</Text>
                            </View>
                            {canEdit && (
                              <TouchableOpacity
                                onPress={() => handleDeleteAttachment(a.id)}
                                style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(220,38,38,0.85)', alignItems: 'center', justifyContent: 'center' }}
                              >
                                <Ionicons name="trash-outline" size={13} color="#fff" />
                              </TouchableOpacity>
                            )}
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}

                  {/* ── Document list ── */}
                  {docAttachments.length > 0 && (
                    <>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: theme.colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4, marginTop: imageAttachments.length > 0 ? 4 : 0 }}>Documents</Text>
                      <View style={{ backgroundColor: theme.colors.surface, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border }}>
                        {docAttachments.map((a: TicketAttachment, di: number) => {
                          const ext = (a.file_name.split('.').pop() ?? 'file').toUpperCase()
                          const extColor = ext === 'PDF' ? '#dc2626' : ext === 'XLSX' || ext === 'XLS' ? '#16a34a' : ext === 'DOCX' || ext === 'DOC' ? '#2563eb' : '#6366f1'
                          return (
                            <View key={a.id}>
                              {di > 0 && <View style={{ height: 1, backgroundColor: theme.colors.border, marginLeft: 52 }} />}
                              <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 }}>
                                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: extColor + '18', alignItems: 'center', justifyContent: 'center' }}>
                                  <Text style={{ fontSize: 9, fontWeight: '800', color: extColor }}>{ext.slice(0, 4)}</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.text }} numberOfLines={1}>{a.file_name}</Text>
                                  <Text style={{ fontSize: 11, color: theme.colors.textMuted }}>{a.uploaded_by_name} · {formatDistanceToNowStrict(new Date(a.created_at), { addSuffix: true })}</Text>
                                </View>
                                <View style={{ flexDirection: 'row', gap: 4 }}>
                                  <TouchableOpacity onPress={() => Linking.openURL(a.url).catch(() => Alert.alert('Error', 'Cannot open file.'))} style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: theme.primary[50], alignItems: 'center', justifyContent: 'center' }}>
                                    <Ionicons name="open-outline" size={16} color={theme.primary[600]} />
                                  </TouchableOpacity>
                                  {canEdit && (
                                    <TouchableOpacity onPress={() => handleDeleteAttachment(a.id)} style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center' }}>
                                      <Ionicons name="trash-outline" size={16} color="#dc2626" />
                                    </TouchableOpacity>
                                  )}
                                </View>
                              </View>
                            </View>
                          )
                        })}
                      </View>
                    </>
                  )}
                </>
              )
            })()}
          </>
        )}

        {/* ════ TIMELINE TAB ════ */}
        {activeTab === 'timeline' && (
          <>
            {(timeline ?? []).length === 0 ? (
              <View style={{ alignItems: 'center', paddingTop: 48, gap: 10 }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: theme.primary[50], alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="time-outline" size={30} color={theme.primary[300]} />
                </View>
                <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.text }}>No events yet</Text>
                <Text style={{ fontSize: 13, color: theme.colors.textMuted }}>Activity will appear here as the ticket progresses.</Text>
              </View>
            ) : null}

            {(timeline ?? []).map((event: Record<string, unknown>, idx: number) => {
              const eventType = String(event.event_type ?? '')
              const dotColor = eventType.includes('close') ? '#7c3aed'
                : eventType.includes('resolv') ? '#16a34a'
                : eventType.includes('assign') ? '#0369a1'
                : eventType.includes('transfer') ? '#d97706'
                : eventType.includes('cancel') ? '#dc2626'
                : eventType.includes('comment') ? '#6366f1'
                : theme.primary[500]
              const dotBg = eventType.includes('close') ? '#ede9fe'
                : eventType.includes('resolv') ? '#dcfce7'
                : eventType.includes('assign') ? '#e0f2fe'
                : eventType.includes('transfer') ? '#fef3c7'
                : eventType.includes('cancel') ? '#fee2e2'
                : eventType.includes('comment') ? '#eef2ff'
                : theme.primary[50]
              const actorInitial = (String(event.actor_name ?? '?')[0] ?? '?').toUpperCase()
              return (
                <View key={String(event.id ?? idx)} style={{ flexDirection: 'row', gap: 12 }}>
                  {/* Spine + avatar */}
                  <View style={{ alignItems: 'center', width: 34 }}>
                    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: dotBg, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: dotColor + '60' }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: dotColor }}>{actorInitial}</Text>
                    </View>
                    {idx < (timeline?.length ?? 0) - 1 && (
                      <View style={{ width: 2, flex: 1, backgroundColor: theme.colors.border, marginTop: 4, minHeight: 20 }} />
                    )}
                  </View>
                  {/* Event content */}
                  <View style={{ flex: 1, paddingBottom: 18, paddingTop: 7 }}>
                    <Text style={{ fontSize: 13, color: theme.colors.text, lineHeight: 20, fontWeight: '500', marginBottom: 4 }}>{String(event.description ?? '')}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: dotColor }}>{String(event.actor_name ?? '')}</Text>
                      <Text style={{ fontSize: 11, color: theme.colors.textMuted }}>·</Text>
                      <Text style={{ fontSize: 11, color: theme.colors.textMuted }}>{formatDistanceToNowStrict(new Date(String(event.created_at)), { addSuffix: true })}</Text>
                    </View>
                  </View>
                </View>
              )
            })}
          </>
        )}
      </ScrollView>

      {/* ── Sticky Quick-Action Bar ── */}
      {isTicketActive && canEdit && (
        <View style={{
          flexDirection: 'row',
          gap: 8,
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: insets.bottom + 10,
          backgroundColor: theme.colors.surface,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
          elevation: 6,
        }}>
          {/* Assign — manager+ only */}
          {isManager && (
            <TouchableOpacity
              onPress={() => setShowAssign(true)}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 11,
                borderRadius: 12,
                backgroundColor: theme.primary[50],
                borderWidth: 1,
                borderColor: theme.primary[200],
              }}
            >
              <Ionicons name="person-add-outline" size={15} color={theme.primary[700]} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: theme.primary[700] }}>Assign</Text>
            </TouchableOpacity>
          )}

          {/* Transfer — manager+ only */}
          {isManager && (
            <TouchableOpacity
              onPress={() => setShowTransfer(true)}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 11,
                borderRadius: 12,
                backgroundColor: '#eff6ff',
                borderWidth: 1,
                borderColor: '#bfdbfe',
              }}
            >
              <Ionicons name="swap-horizontal-outline" size={15} color="#1d4ed8" />
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#1d4ed8' }}>Transfer</Text>
            </TouchableOpacity>
          )}

          {/* Next status or Close CTA */}
          {nextStatuses.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                // If resolved → show Close modal for resolution notes
                if (ticket.status === 'resolved') { setShowClose(true); return }
                if (nextStatuses.length === 1) {
                  handleStatusChange(nextStatuses[0])
                } else {
                  Alert.alert(
                    'Update Status',
                    'Choose next status',
                    [
                      ...nextStatuses.map((s) => ({
                        text: STATUS_LABELS[s] ?? s,
                        onPress: () => handleStatusChange(s),
                      })),
                      { text: 'Cancel', style: 'cancel' as const },
                    ],
                  )
                }
              }}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 11,
                borderRadius: 12,
                backgroundColor: ticket.status === 'resolved' ? '#fee2e2' : theme.primary[600],
                borderWidth: 0,
              }}
            >
              <Ionicons
                name={ticket.status === 'resolved' ? 'lock-closed-outline' : 'arrow-forward-outline'}
                size={15}
                color={ticket.status === 'resolved' ? '#dc2626' : '#fff'}
              />
              <Text style={{
                fontSize: 13, fontWeight: '700',
                color: ticket.status === 'resolved' ? '#dc2626' : '#fff',
              }}>
                {ticket.status === 'resolved' ? 'Close' : STATUS_LABELS[nextStatuses[0]] ?? 'Update'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Modals ── */}
      <AssignModal ticketId={ticketId} visible={showAssign} onClose={() => setShowAssign(false)} />
      <TransferModal ticketId={ticketId} visible={showTransfer} onClose={() => setShowTransfer(false)} />
      <CloseModal ticketId={ticketId} visible={showClose} onClose={() => setShowClose(false)} />
      <AddProductModal ticketId={ticketId} visible={showAddProduct} onClose={() => setShowAddProduct(false)} />
      <AddVehicleModal ticketId={ticketId} currentVehicleIds={ticket.vehicles ?? []} visible={showAddVehicle} onClose={() => setShowAddVehicle(false)} />
    </View>
  )
}
