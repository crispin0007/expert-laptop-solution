/**
 * mobile/src/features/inventory/useInventory.ts
 * React Query hooks for the Inventory module — mobile-optimised read view.
 *
 * Mobile scope: Browse products, check stock levels, view low-stock alerts,
 * see recent stock movements. Write operations (purchase orders, adjustments,
 * supplier management) remain in the web dashboard.
 */
import { useQuery } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { INVENTORY_FULL } from '@/api/endpoints'
import { QK } from '@/constants/queryKeys'

// ── Types (minimal — mirrors backend inventory serializers) ───────────────────

export interface ProductSummary {
  id: number
  name: string
  sku: string
  category_name: string | null
  unit_name: string | null
  cost_price: string
  selling_price: string
  is_active: boolean
  is_published: boolean
  stock_quantity: number
  low_stock_threshold: number
  has_warranty: boolean
  warranty_months: number | null
  warranty_description: string | null
}

export interface StockLevel {
  id: number
  product_id: number
  product_name: string
  product_sku: string
  quantity: number
  last_updated: string
}

export interface StockMovement {
  id: number
  product_name: string
  product_sku: string
  movement_type: 'in' | 'out' | 'return' | 'adjustment' | 'transfer'
  quantity: number
  reference: string | null
  notes: string | null
  created_at: string
  created_by_name: string | null
}

export interface SerialNumber {
  id: number
  product: number
  product_name: string
  product_sku: string
  serial_number: string
  status: 'available' | 'used' | 'damaged' | 'returned'
  warranty_expires: string | null
  used_at: string | null
  notes: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const unwrap = <T>(r: { data: { data: T; results?: never } | { results: T; data?: never } | T }): T => {
  const d = r.data as Record<string, unknown>
  if (d && 'data' in d && d.data !== undefined) return d.data as T
  return r.data as T
}

const toArray = <T>(d: { results?: T[] } | T[]): T[] =>
  Array.isArray(d) ? d : (d as { results?: T[] }).results ?? []

// ── Products ──────────────────────────────────────────────────────────────────

export function useProductList(params?: { search?: string; category?: number; is_active?: boolean; page_size?: number }) {
  return useQuery<ProductSummary[]>({
    queryKey: QK.products(params),
    queryFn: () =>
      apiClient
        .get(INVENTORY_FULL.PRODUCTS, { params: { page_size: 50, ...params } })
        .then((r) => toArray<ProductSummary>(unwrap(r))),
    staleTime: 60_000,
  })
}

export function useProduct(id: number) {
  return useQuery<ProductSummary>({
    queryKey: QK.product(id),
    queryFn: () => apiClient.get(INVENTORY_FULL.PRODUCT_DETAIL(id)).then(unwrap<ProductSummary>),
    enabled: id > 0,
    staleTime: 30_000,
  })
}

// ── Low Stock ─────────────────────────────────────────────────────────────────

export function useLowStockProducts() {
  return useQuery<ProductSummary[]>({
    queryKey: ['products', 'low-stock'],
    queryFn: () =>
      apiClient
        .get(INVENTORY_FULL.LOW_STOCK)
        .then((r) => toArray<ProductSummary>(unwrap(r))),
    staleTime: 2 * 60_000,
  })
}

// ── Stock Movements ───────────────────────────────────────────────────────────

export function useStockMovements(params?: { product?: number; movement_type?: string; page_size?: number }) {
  return useQuery<StockMovement[]>({
    queryKey: ['stock-movements', params],
    queryFn: () =>
      apiClient
        .get(INVENTORY_FULL.MOVEMENTS, { params: { page_size: 30, ordering: '-created_at', ...params } })
        .then((r) => toArray<StockMovement>(unwrap(r))),
    staleTime: 30_000,
  })
}

export function useSerialNumbers(params?: { product?: number; status?: string; page_size?: number }) {
  return useQuery<SerialNumber[]>({
    queryKey: ['serial-numbers', params],
    queryFn: () =>
      apiClient
        .get(INVENTORY_FULL.SERIAL_NUMBERS, { params: { page_size: 100, ...params } })
        .then((r) => toArray<SerialNumber>(unwrap(r))),
    staleTime: 30_000,
  })
}
