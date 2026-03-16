import React, { useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/theme/ThemeContext'
import { DrawerToggle } from '@/components/ui/AppDrawer'
import { ModuleGuard, ModuleLockedScreen } from '@/guards/ModuleGuard'
import {
  useProductList,
  useLowStockProducts,
  useStockMovements,
  useSerialNumbers,
  type ProductSummary,
  type StockMovement,
  type SerialNumber,
} from '@/features/inventory/useInventory'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPrice(price: string | number): string {
  const n = typeof price === 'string' ? parseFloat(price) : price
  if (isNaN(n)) return '—'
  return `Rs ${n.toLocaleString('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function movementTypeColor(type: StockMovement['movement_type']): string {
  switch (type) {
    case 'in':         return '#16a34a'
    case 'out':        return '#dc2626'
    case 'return':     return '#d97706'
    case 'adjustment': return '#7c3aed'
    case 'transfer':   return '#0284c7'
    default:           return '#6b7280'
  }
}

function movementLabel(type: StockMovement['movement_type']): string {
  switch (type) {
    case 'in':         return 'Stock In'
    case 'out':        return 'Stock Out'
    case 'return':     return 'Return'
    case 'adjustment': return 'Adjustment'
    case 'transfer':   return 'Transfer'
    default:           return type
  }
}

// ── Stock badge ───────────────────────────────────────────────────────────────

function StockBadge({ quantity, threshold }: { quantity: number; threshold: number }) {
  const isLow = quantity <= threshold && quantity > 0
  const isOut  = quantity <= 0

  const bg    = isOut ? '#fee2e2' : isLow ? '#fef9c3' : '#f0fdf4'
  const color = isOut ? '#dc2626'  : isLow ? '#713f12'  : '#166534'
  const label = isOut ? 'Out'      : isLow ? 'Low'       : `${quantity}`

  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, backgroundColor: bg, alignSelf: 'flex-start' }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color }}>{label}</Text>
    </View>
  )
}

// ── Product Card ──────────────────────────────────────────────────────────────

function ProductCard({ product }: { product: ProductSummary }) {
  const theme = useTheme()
  return (
    <View style={{
      backgroundColor: theme.colors.surface,
      borderRadius: 14,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 3,
      elevation: 1,
    }}>
      <View style={{
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: theme.primary[50],
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Ionicons name="cube-outline" size={20} color={theme.primary[600]} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: theme.colors.text, flex: 1 }} numberOfLines={1}>
            {product.name}
          </Text>
          {product.has_warranty && (
            <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: '#f0fdf4' }}>
              <Ionicons name="shield-checkmark-outline" size={12} color="#16a34a" />
            </View>
          )}
        </View>
        <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>
          {product.sku}{product.category_name ? ` · ${product.category_name}` : ''}
        </Text>
        <Text style={{ fontSize: 12, color: theme.primary[600], fontWeight: '600' }}>
          {formatPrice(product.selling_price)}
        </Text>
      </View>
      <StockBadge quantity={product.stock_quantity} threshold={product.low_stock_threshold} />
    </View>
  )
}

// ── Movement Row ──────────────────────────────────────────────────────────────

function MovementRow({ movement }: { movement: StockMovement }) {
  const theme = useTheme()
  const color = movementTypeColor(movement.movement_type)
  const sign  = movement.movement_type === 'out' ? '−' : '+'
  return (
    <View style={{
      backgroundColor: theme.colors.surface,
      borderRadius: 14,
      padding: 14,
      gap: 6,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 3,
      elevation: 1,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{
            width: 28, height: 28, borderRadius: 8,
            backgroundColor: color + '1a',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons
              name={movement.movement_type === 'out' ? 'arrow-up' : 'arrow-down'}
              size={14}
              color={color}
            />
          </View>
          <View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.text }} numberOfLines={1}>
              {movement.product_name}
            </Text>
            <Text style={{ fontSize: 11, color: theme.colors.textMuted }}>{movement.product_sku}</Text>
          </View>
        </View>
        <Text style={{ fontSize: 16, fontWeight: '800', color }}>
          {sign}{movement.quantity}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{
          paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20,
          backgroundColor: color + '1a',
        }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color }}>{movementLabel(movement.movement_type)}</Text>
        </View>
        {movement.reference ? (
          <Text style={{ fontSize: 11, color: theme.colors.textMuted }}>#{movement.reference}</Text>
        ) : null}
        <Text style={{ fontSize: 11, color: theme.colors.textMuted, marginLeft: 'auto' }}>
          {new Date(movement.created_at).toLocaleDateString()}
        </Text>
      </View>
      {movement.notes ? (
        <Text style={{ fontSize: 12, color: theme.colors.textMuted, lineHeight: 17 }} numberOfLines={2}>
          {movement.notes}
        </Text>
      ) : null}
    </View>
  )
}

// ── Low Stock Tab ─────────────────────────────────────────────────────────────

function LowStockTab() {
  const theme = useTheme()
  const { data: lowStock = [], isLoading, refetch, isRefetching } = useLowStockProducts()

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.primary[500]} />}
    >
      {isLoading ? (
        <View style={{ alignItems: 'center', paddingTop: 60 }}>
          <ActivityIndicator size="large" color={theme.primary[500]} />
        </View>
      ) : lowStock.length === 0 ? (
        <View style={{ alignItems: 'center', paddingTop: 80, gap: 12 }}>
          <Ionicons name="checkmark-circle-outline" size={48} color="#16a34a" />
          <Text style={{ fontSize: 16, fontWeight: '700', color: theme.colors.text }}>All stock healthy</Text>
          <Text style={{ fontSize: 14, color: theme.colors.textMuted, textAlign: 'center' }}>
            No products are low or out of stock.
          </Text>
        </View>
      ) : (
        <>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: '#fef9c3', borderRadius: 12, padding: 12, marginBottom: 4,
          }}>
            <Ionicons name="warning-outline" size={16} color="#713f12" />
            <Text style={{ fontSize: 13, color: '#713f12', fontWeight: '600' }}>
              {lowStock.length} product{lowStock.length !== 1 ? 's' : ''} need restocking
            </Text>
          </View>
          {lowStock.map((p) => <ProductCard key={p.id} product={p} />)}
        </>
      )}
    </ScrollView>
  )
}

// ── Movements Tab ─────────────────────────────────────────────────────────────

function MovementsTab() {
  const theme = useTheme()
  const { data: movements = [], isLoading, refetch, isRefetching } = useStockMovements({ page_size: 40 })

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.primary[500]} />}
    >
      {isLoading ? (
        <View style={{ alignItems: 'center', paddingTop: 60 }}>
          <ActivityIndicator size="large" color={theme.primary[500]} />
        </View>
      ) : movements.length === 0 ? (
        <View style={{ alignItems: 'center', paddingTop: 80, gap: 12 }}>
          <Ionicons name="swap-vertical-outline" size={48} color={theme.colors.textMuted} />
          <Text style={{ fontSize: 16, fontWeight: '700', color: theme.colors.text }}>No movements yet</Text>
          <Text style={{ fontSize: 14, color: theme.colors.textMuted, textAlign: 'center' }}>
            Stock movements will appear here as products are used.
          </Text>
        </View>
      ) : (
        movements.map((m) => <MovementRow key={m.id} movement={m} />)
      )}
    </ScrollView>
  )
}

// ── Warranty Tab ─────────────────────────────────────────────────────────────

type SerialStatusFilter = 'all' | 'available' | 'used' | 'damaged' | 'returned'

function serialStatusColor(status: SerialNumber['status']): string {
  switch (status) {
    case 'available': return '#16a34a'
    case 'used':      return '#7c3aed'
    case 'damaged':   return '#dc2626'
    case 'returned':  return '#d97706'
    default:          return '#6b7280'
  }
}

function SerialCard({ item }: { item: SerialNumber }) {
  const theme = useTheme()
  const color = serialStatusColor(item.status)
  const isExpired = item.warranty_expires != null && new Date(item.warranty_expires) < new Date()
  return (
    <View style={{
      backgroundColor: theme.colors.surface,
      borderRadius: 14, padding: 14, gap: 6,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 13, fontWeight: '800', color: theme.colors.text, fontVariant: ['tabular-nums'] }}>
          {item.serial_number}
        </Text>
        <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, backgroundColor: color + '1a' }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color }}>{item.status.charAt(0).toUpperCase() + item.status.slice(1)}</Text>
        </View>
      </View>
      <Text style={{ fontSize: 12, color: theme.colors.textMuted }} numberOfLines={1}>
        {item.product_name}{item.product_sku ? ` · ${item.product_sku}` : ''}
      </Text>
      {item.warranty_expires != null && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name={isExpired ? 'shield-outline' : 'shield-checkmark-outline'} size={12} color={isExpired ? '#dc2626' : '#16a34a'} />
          <Text style={{ fontSize: 11, color: isExpired ? '#dc2626' : '#16a34a' }}>
            {isExpired ? 'Expired ' : 'Expires '}
            {new Date(item.warranty_expires).toLocaleDateString()}
          </Text>
        </View>
      )}
    </View>
  )
}

function WarrantyTab() {
  const theme = useTheme()
  const [filter, setFilter] = useState<SerialStatusFilter>('all')
  const { data: serials = [], isLoading, refetch, isRefetching } = useSerialNumbers(
    filter === 'all' ? { page_size: 100 } : { status: filter, page_size: 100 },
  )

  const STATUS_FILTERS: Array<{ key: SerialStatusFilter; label: string }> = [
    { key: 'all',       label: 'All' },
    { key: 'available', label: 'Available' },
    { key: 'used',      label: 'Used' },
    { key: 'damaged',   label: 'Damaged' },
    { key: 'returned',  label: 'Returned' },
  ]

  return (
    <View style={{ flex: 1 }}>
      {/* Filter row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 8 }}>
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={{
              paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
              backgroundColor: filter === f.key ? theme.primary[600] : theme.colors.surface,
              borderWidth: 1, borderColor: filter === f.key ? theme.primary[600] : theme.colors.border,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: filter === f.key ? '#fff' : theme.colors.text }}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 10 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.primary[500]} />}
      >
        {isLoading ? (
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <ActivityIndicator size="large" color={theme.primary[500]} />
          </View>
        ) : serials.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 80, gap: 12 }}>
            <Ionicons name="shield-outline" size={48} color={theme.colors.textMuted} />
            <Text style={{ fontSize: 16, fontWeight: '700', color: theme.colors.text }}>No serial numbers</Text>
            <Text style={{ fontSize: 14, color: theme.colors.textMuted, textAlign: 'center' }}>
              {filter === 'all' ? 'Add serial numbers from the web dashboard.' : `No ${filter} serial numbers.`}
            </Text>
          </View>
        ) : (
          serials.map((s) => <SerialCard key={s.id} item={s} />)
        )}
      </ScrollView>
    </View>
  )
}

// ── Products Tab ──────────────────────────────────────────────────────────────

function ProductsTab() {
  const theme = useTheme()
  const [search, setSearch] = useState('')

  const { data: products = [], isLoading, refetch, isRefetching } = useProductList(
    search.trim() ? { search: search.trim(), page_size: 50 } : { page_size: 50 },
  )

  return (
    <View style={{ flex: 1 }}>
      {/* Search bar */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: theme.colors.surface,
          borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
          borderWidth: 1, borderColor: theme.colors.border,
        }}>
          <Ionicons name="search-outline" size={16} color={theme.colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search products, SKU…"
            placeholderTextColor={theme.colors.textMuted}
            style={{ flex: 1, fontSize: 14, color: theme.colors.text }}
            returnKeyType="search"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 10 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.primary[500]} />}
      >
        {isLoading ? (
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <ActivityIndicator size="large" color={theme.primary[500]} />
          </View>
        ) : products.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 80, gap: 12 }}>
            <Ionicons name="cube-outline" size={48} color={theme.colors.textMuted} />
            <Text style={{ fontSize: 16, fontWeight: '700', color: theme.colors.text }}>
              {search ? 'No matches' : 'No products yet'}
            </Text>
            <Text style={{ fontSize: 14, color: theme.colors.textMuted, textAlign: 'center' }}>
              {search ? 'Try a different search term.' : 'Add products from the web dashboard.'}
            </Text>
          </View>
        ) : (
          products.map((p) => <ProductCard key={p.id} product={p} />)
        )}
      </ScrollView>
    </View>
  )
}

// ── Main Screen ───────────────────────────────────────────────────────────────

function InventoryScreenContent() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  const { data: lowStock = [] } = useLowStockProducts()
  const lowCount = lowStock.length

  const [activeTab, setActiveTab] = useState<'products' | 'low-stock' | 'movements' | 'warranty'>('products')

  const TABS = [
    { key: 'products'   as const, label: 'Products',   icon: 'cube-outline'           as const },
    { key: 'low-stock'  as const, label: 'Low Stock',  icon: 'warning-outline'        as const, badge: lowCount },
    { key: 'movements'  as const, label: 'Movements',  icon: 'swap-vertical-outline'  as const },
    { key: 'warranty'   as const, label: 'Warranty',   icon: 'shield-checkmark-outline' as const },
  ]

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>

      {/* ── Header ── */}
      <View style={{
        paddingTop: insets.top + 14,
        paddingHorizontal: 16,
        paddingBottom: 0,
        backgroundColor: theme.primary[600],
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <DrawerToggle />
          <Ionicons name="cube-outline" size={20} color="rgba(255,255,255,0.85)" />
          <Text style={{ flex: 1, fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: -0.3 }}>
            Inventory
          </Text>
          {lowCount > 0 && (
            <View style={{
              backgroundColor: '#fbbf24', paddingHorizontal: 8, paddingVertical: 3,
              borderRadius: 99, flexDirection: 'row', alignItems: 'center', gap: 4,
            }}>
              <Ionicons name="warning" size={11} color="#78350f" />
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#78350f' }}>{lowCount}</Text>
            </View>
          )}
        </View>

        {/* Tab bar */}
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
                gap: 5,
              }}
            >
              <Ionicons
                name={tab.icon}
                size={14}
                color={activeTab === tab.key ? '#fff' : 'rgba(255,255,255,0.55)'}
              />
              <Text style={{
                fontSize: 13,
                fontWeight: '700',
                color: activeTab === tab.key ? '#fff' : 'rgba(255,255,255,0.55)',
                letterSpacing: 0.2,
              }}>
                {tab.label}
              </Text>
              {tab.badge != null && tab.badge > 0 && tab.key !== activeTab && (
                <View style={{
                  backgroundColor: '#fbbf24', width: 16, height: 16, borderRadius: 8,
                  alignItems: 'center', justifyContent: 'center', marginLeft: 2,
                }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: '#78350f' }}>{tab.badge > 99 ? '99+' : tab.badge}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Tab Content ── */}
      {activeTab === 'products'  && <ProductsTab />}
      {activeTab === 'low-stock' && <LowStockTab />}
      {activeTab === 'movements' && <MovementsTab />}
      {activeTab === 'warranty'  && <WarrantyTab />}
    </View>
  )
}

export default function InventoryScreen() {
  return (
    <ModuleGuard module="inventory" fallback={<ModuleLockedScreen module="Inventory" />}>
      <InventoryScreenContent />
    </ModuleGuard>
  )
}
