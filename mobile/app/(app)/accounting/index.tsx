import React, { useState, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  RefreshControl, ScrollView, Alert, FlatList,
  Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/theme/ThemeContext'
import { DrawerToggle } from '@/components/ui/AppDrawer'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { RoleGuard } from '@/guards/RoleGuard'
import { ModuleGuard, ModuleLockedScreen } from '@/guards/ModuleGuard'
import { useCoinList, useApproveCoin, useRejectCoin, useAwardCoins, usePayslipList, useInvoiceList, type CoinTransaction, type Payslip, type Invoice } from '@/features/accounting/useAccounting'
import { useStaffPicker } from '@/features/staff/useStaff'

type Tab = 'coins' | 'payslips' | 'invoices'

// ── Award Coins Modal ─────────────────────────────────────────────────────

function AwardCoinsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [staffSearch, setStaffSearch] = useState('')
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null)
  const [selectedStaffName, setSelectedStaffName] = useState('')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')

  const { data: staffList } = useStaffPicker(staffSearch)
  const mutation = useAwardCoins()

  function handleClose() {
    setStaffSearch(''); setSelectedStaffId(null); setSelectedStaffName('')
    setAmount(''); setReason('')
    onClose()
  }

  function handleAward() {
    if (!selectedStaffId) { Alert.alert('Validation', 'Select a staff member'); return }
    const amt = parseInt(amount, 10)
    if (!amt || amt < 1) { Alert.alert('Validation', 'Enter a valid coin amount'); return }
    mutation.mutate(
      { staff: selectedStaffId, amount: amt, reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          Alert.alert('Success', `${amt} coins awarded to ${selectedStaffName}.`)
          handleClose()
        },
        onError: (e: any) => Alert.alert('Error', e?.response?.data?.message ?? 'Could not award coins'),
      },
    )
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
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
            <Text style={{ fontSize: 17, fontWeight: '800', color: theme.colors.text }}>Award Coins 🪙</Text>
            <Text style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 2 }}>Manually award coins to a staff member</Text>
          </View>
          <TouchableOpacity onPress={handleClose}>
            <Ionicons name="close" size={22} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
          {/* Selected staff chip */}
          {selectedStaffId ? (
            <TouchableOpacity
              onPress={() => { setSelectedStaffId(null); setSelectedStaffName('') }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                backgroundColor: theme.primary[50], borderRadius: 12, padding: 12,
                borderWidth: 1.5, borderColor: theme.primary[300],
              }}
            >
              <View style={{
                width: 36, height: 36, borderRadius: 18,
                backgroundColor: theme.primary[100], alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: theme.primary[700] }}>
                  {selectedStaffName[0]?.toUpperCase()}
                </Text>
              </View>
              <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: theme.primary[800] }}>{selectedStaffName}</Text>
              <Ionicons name="close-circle" size={18} color={theme.primary[400]} />
            </TouchableOpacity>
          ) : (
            <View>
              <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Staff Member *</Text>
              <Input
                value={staffSearch}
                onChangeText={setStaffSearch}
                placeholder="Search staff name…"
              />
              {(staffList ?? []).slice(0, 8).map((s) => (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => { setSelectedStaffId(s.id); setSelectedStaffName(s.full_name); setStaffSearch('') }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    paddingHorizontal: 14, paddingVertical: 11,
                    backgroundColor: theme.colors.surface,
                    borderRadius: 10, marginTop: 4,
                    borderWidth: 1, borderColor: theme.colors.border,
                  }}
                >
                  <View style={{
                    width: 32, height: 32, borderRadius: 16,
                    backgroundColor: `${theme.primary[500]}18`,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: theme.primary[600] }}>
                      {(s.full_name ?? '?')[0]?.toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.text }}>{s.full_name}</Text>
                    {s.department_name && (
                      <Text style={{ fontSize: 11, color: theme.colors.textMuted }}>{s.department_name}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Amount */}
          <Input
            label="Coin Amount *"
            value={amount}
            onChangeText={(v) => setAmount(v.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            placeholder="e.g. 10"
          />

          {/* Reason */}
          <View>
            <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Reason (optional)</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Why are these coins being awarded?"
              placeholderTextColor={theme.colors.textMuted}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              style={{
                backgroundColor: theme.colors.surface, borderRadius: 12,
                borderWidth: 1, borderColor: theme.colors.border,
                padding: 12, fontSize: 14, color: theme.colors.text, minHeight: 80,
              }}
            />
          </View>

          <Button
            label={`Award ${amount || '0'} Coins`}
            onPress={handleAward}
            loading={mutation.isPending}
            disabled={!selectedStaffId || !amount}
            fullWidth
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ── Coins Tab ──────────────────────────────────────────────────────────────

function CoinsTab() {
  const theme = useTheme()
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected'>('pending')

  const { data: coins, isLoading, refetch, isRefetching } = useCoinList(statusFilter)

  const approveMutation = useApproveCoin()
  const rejectMutation = useRejectCoin()
  const [showAward, setShowAward] = useState(false)

  function confirmApprove(coin: CoinTransaction) {
    Alert.alert('Approve Coins', `Approve ${coin.amount} coins for ${coin.staff_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: () => approveMutation.mutate(coin.id) },
    ])
  }

  function confirmReject(coin: CoinTransaction) {
    Alert.alert('Reject Coins', `Reject ${coin.amount} coins for ${coin.staff_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: () => rejectMutation.mutate({ coinId: coin.id }) },
    ])
  }

  const FILTERS: { label: string; value: typeof statusFilter }[] = [
    { label: 'Pending', value: 'pending' },
    { label: 'Approved', value: 'approved' },
    { label: 'Rejected', value: 'rejected' },
  ]

  const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
    pending: { bg: '#fef3c7', text: '#92400e' },
    approved: { bg: '#d1fae5', text: '#065f46' },
    rejected: { bg: '#fee2e2', text: '#991b1b' },
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Filter pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 16, paddingVertical: 10, maxHeight: 50 }} contentContainerStyle={{ gap: 8, flexDirection: 'row', alignItems: 'center' }}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.value}
            onPress={() => setStatusFilter(f.value)}
            style={{
              paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
              backgroundColor: statusFilter === f.value ? theme.primary[600] : theme.colors.background,
              borderWidth: 1,
              borderColor: statusFilter === f.value ? theme.primary[600] : theme.colors.border,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: statusFilter === f.value ? '#fff' : theme.colors.textMuted }}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.primary[500]} />
        </View>
      ) : (
        <FlatList
          data={coins ?? []}
          keyExtractor={(c) => String(c.id)}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.primary[500]} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 10 }}
          renderItem={({ item: coin }) => {
            const sc = STATUS_COLOR[coin.status] ?? STATUS_COLOR.pending
            const isBusy = approveMutation.isPending || rejectMutation.isPending
            return (
              <View style={{
                backgroundColor: theme.colors.surface,
                borderRadius: 14,
                padding: 14,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.06,
                shadowRadius: 4,
                elevation: 2,
              }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: theme.colors.text }}>{coin.staff_name}</Text>
                    {coin.ticket_number && (
                      <Text style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 2 }}>Ticket: {coin.ticket_number}</Text>
                    )}
                    <Text style={{ fontSize: 11, color: theme.colors.textMuted }}>{new Date(coin.created_at).toLocaleDateString()}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={{ fontSize: 22, fontWeight: '800', color: theme.primary[600] }}>🪙 {coin.amount}</Text>
                    <View style={{ backgroundColor: sc.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: sc.text, textTransform: 'uppercase' }}>{coin.status}</Text>
                    </View>
                  </View>
                </View>

                {coin.reason && (
                  <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginBottom: 10 }}>{coin.reason}</Text>
                )}

                {coin.status === 'pending' && (
                  <RoleGuard permission="accounting.manage">
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Button
                        label="Approve"
                        variant="primary"
                        size="sm"
                        loading={isBusy}
                        onPress={() => confirmApprove(coin)}
                        style={{ flex: 1 }}
                      />
                      <Button
                        label="Reject"
                        variant="destructive"
                        size="sm"
                        loading={isBusy}
                        onPress={() => confirmReject(coin)}
                        style={{ flex: 1 }}
                      />
                    </View>
                  </RoleGuard>
                )}
              </View>
            )
          }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Text style={{ fontSize: 36, marginBottom: 12 }}>🪙</Text>
              <Text style={{ fontSize: 15, color: theme.colors.textMuted }}>
                {statusFilter === 'pending' ? 'No pending coin approvals' : `No ${statusFilter} coins`}
              </Text>
            </View>
          }
        />
      )}

      <RoleGuard permission="accounting.manage">
        <TouchableOpacity
          onPress={() => setShowAward(true)}
          style={{
            position: 'absolute', bottom: 28, right: 20,
            width: 52, height: 52, borderRadius: 26,
            backgroundColor: theme.primary[600],
            alignItems: 'center', justifyContent: 'center',
            shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
          }}
        >
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      </RoleGuard>

      <AwardCoinsModal visible={showAward} onClose={() => setShowAward(false)} />
    </View>
  )
}

// ── Payslips Tab ───────────────────────────────────────────────────────────

function PayslipsTab() {
  const theme = useTheme()

  const { data: payslips, isLoading, refetch, isRefetching } = usePayslipList()

  const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
    draft: { bg: '#f3f4f6', text: '#374151' },
    finalized: { bg: '#dbeafe', text: '#1e40af' },
    paid: { bg: '#d1fae5', text: '#065f46' },
  }

  if (isLoading) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color={theme.primary[500]} />
    </View>
  )

  return (
    <FlatList
      data={payslips ?? []}
      keyExtractor={(p) => String(p.id)}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.primary[500]} />}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 32, gap: 10 }}
      renderItem={({ item: ps }) => {
        const sc = STATUS_COLOR[ps.status] ?? STATUS_COLOR.draft
        return (
          <View style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 14,
            padding: 14,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.06,
            shadowRadius: 4,
            elevation: 2,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <View>
                <Text style={{ fontSize: 14, fontWeight: '700', color: theme.colors.text }}>{ps.staff_name}</Text>
                <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>{ps.period_label}</Text>
              </View>
              <View style={{ backgroundColor: sc.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, alignSelf: 'flex-start' }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: sc.text, textTransform: 'uppercase' }}>{ps.status}</Text>
              </View>
            </View>
            <View style={{ backgroundColor: theme.colors.background, borderRadius: 10, padding: 12, gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>Base Salary</Text>
                <Text style={{ fontSize: 12, color: theme.colors.text, fontWeight: '600' }}>Rs. {ps.base_salary}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>Coin Bonus</Text>
                <Text style={{ fontSize: 12, color: '#10b981', fontWeight: '600' }}>+ Rs. {ps.coin_bonus}</Text>
              </View>
              <View style={{ height: 1, backgroundColor: theme.colors.border }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.text }}>Total</Text>
                <Text style={{ fontSize: 13, fontWeight: '800', color: theme.primary[700] }}>Rs. {ps.total}</Text>
              </View>
            </View>
          </View>
        )
      }}
      ListEmptyComponent={
        <View style={{ alignItems: 'center', paddingTop: 60 }}>
          <Text style={{ fontSize: 36, marginBottom: 12 }}>📄</Text>
          <Text style={{ fontSize: 15, color: theme.colors.textMuted }}>No payslips yet</Text>
        </View>
      }
    />
  )
}

// ── Invoices Tab ───────────────────────────────────────────────────────────

function InvoicesTab() {
  const theme = useTheme()

  const { data: invoices, isLoading, refetch, isRefetching } = useInvoiceList()

  const INV_STATUS_COLOR: Record<string, { bg: string; text: string }> = {
    draft: { bg: '#f3f4f6', text: '#6b7280' },
    sent: { bg: '#dbeafe', text: '#1e40af' },
    paid: { bg: '#d1fae5', text: '#065f46' },
    overdue: { bg: '#fee2e2', text: '#991b1b' },
    cancelled: { bg: '#f3f4f6', text: '#6b7280' },
  }

  if (isLoading) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color={theme.primary[500]} />
    </View>
  )

  return (
    <FlatList
      data={invoices ?? []}
      keyExtractor={(inv) => String(inv.id)}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.primary[500]} />}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 32, gap: 10 }}
      renderItem={({ item: inv }) => {
        const sc = INV_STATUS_COLOR[inv.status] ?? INV_STATUS_COLOR.draft
        const hasDue = parseFloat(inv.amount_due) > 0
        return (
          <View style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 14,
            padding: 14,
            borderLeftWidth: 3,
            borderLeftColor: hasDue && inv.status !== 'cancelled' ? theme.colors.error : theme.colors.border,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.06,
            shadowRadius: 4,
            elevation: 2,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 11, color: theme.colors.textMuted, fontWeight: '600' }}>{inv.invoice_number}</Text>
              <Text style={{ fontSize: 11, color: theme.colors.textMuted }}>{new Date(inv.created_at).toLocaleDateString()}</Text>
            </View>
            <Text style={{ fontSize: 14, fontWeight: '700', color: theme.colors.text, marginBottom: 6 }} numberOfLines={1}>
              {inv.customer_name}
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ backgroundColor: sc.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: sc.text, textTransform: 'uppercase' }}>{inv.status}</Text>
                </View>
                {inv.finance_status && inv.finance_status !== 'pending' && (
                  <View style={{ backgroundColor: '#ede9fe', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#6d28d9', textTransform: 'uppercase' }}>{inv.finance_status}</Text>
                  </View>
                )}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: theme.colors.text }}>Rs. {inv.total}</Text>
                {hasDue && (
                  <Text style={{ fontSize: 11, color: theme.colors.error, fontWeight: '600' }}>Due: Rs. {inv.amount_due}</Text>
                )}
              </View>
            </View>
          </View>
        )
      }}
      ListEmptyComponent={
        <View style={{ alignItems: 'center', paddingTop: 60 }}>
          <Text style={{ fontSize: 36, marginBottom: 12 }}>🧾</Text>
          <Text style={{ fontSize: 15, color: theme.colors.textMuted }}>No invoices yet</Text>
        </View>
      }
    />
  )
}

// ── Main Screen ────────────────────────────────────────────────────────────

export default function AccountingScreen() {
  const theme = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [activeTab, setActiveTab] = useState<Tab>('coins')

  const TABS: { key: Tab; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
    { key: 'coins', label: 'Coins', icon: 'wallet-outline' },
    { key: 'payslips', label: 'Payslips', icon: 'document-text-outline' },
    { key: 'invoices', label: 'Invoices', icon: 'receipt-outline' },
  ]

  return (
    <ModuleGuard module="accounting" fallback={<ModuleLockedScreen module="Accounting" />}>
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + 14,
        paddingHorizontal: 16,
        paddingBottom: 0,
        backgroundColor: theme.primary[600],
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <DrawerToggle />
          <Text style={{ flex: 1, fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: -0.3 }}>
            Accounting
          </Text>
        </View>

        {/* Tab bar inside header for contrast */}
        <View style={{ flexDirection: 'row' }}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={{
                flex: 1,
                paddingVertical: 12,
                alignItems: 'center',
                borderBottomWidth: 3,
                borderBottomColor: activeTab === tab.key ? '#fff' : 'transparent',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <Ionicons name={tab.icon} size={16} color={activeTab === tab.key ? '#fff' : 'rgba(255,255,255,0.6)'} />
              <Text style={{
                fontSize: 13,
                fontWeight: '700',
                color: activeTab === tab.key ? '#fff' : 'rgba(255,255,255,0.6)',
              }}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {activeTab === 'coins' && <CoinsTab />}
      {activeTab === 'payslips' && <PayslipsTab />}
      {activeTab === 'invoices' && <InvoicesTab />}
    </View>
    </ModuleGuard>
  )
}
