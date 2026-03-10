/**
 * Customers service hooks — all data fetching & mutations for the customers module.
 */
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { CUSTOMERS } from '@/api/endpoints'
import { QK } from '@/constants/queryKeys'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Customer {
  id: number
  customer_number: string
  name: string
  type: 'individual' | 'organization'
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  district: string | null
  is_active: boolean
  open_tickets_count?: number
  notes: string | null
  created_at: string
}

export interface Contact {
  id: number
  name: string
  email: string | null
  phone: string | null
  designation: string | null
  is_primary: boolean
}

export interface PaginatedResponse<T> {
  results: T[]
  next: string | null
  previous: string | null
}

function extractCursor(nextUrl: string | null): string | undefined {
  if (!nextUrl) return undefined
  try { return new URL(nextUrl).searchParams.get('cursor') ?? undefined } catch { return undefined }
}

// ── List ──────────────────────────────────────────────────────────────────────

export interface CustomerFilters {
  search?: string
}

export function useCustomerList(filters: CustomerFilters = {}) {
  return useInfiniteQuery<PaginatedResponse<Customer>>({
    queryKey: QK.customers(filters),
    queryFn: ({ pageParam }) =>
      apiClient
        .get(CUSTOMERS.LIST, { params: { ...filters, cursor: pageParam } })
        .then((r) => r.data.data ?? r.data),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => extractCursor(lastPage?.next),
    staleTime: 60_000,
  })
}

// ── Detail ────────────────────────────────────────────────────────────────────

export function useCustomer(id: number | string) {
  const customerId = Number(id)
  return useQuery<Customer>({
    queryKey: QK.customer(customerId),
    queryFn: () =>
      apiClient.get(CUSTOMERS.DETAIL(customerId)).then((r) => r.data.data ?? r.data),
    enabled: !isNaN(customerId) && customerId > 0,
    staleTime: 60_000,
  })
}

// ── Create / Update ───────────────────────────────────────────────────────────

export function useCreateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiClient.post(CUSTOMERS.CREATE, payload).then((r) => r.data.data ?? r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}

export function useUpdateCustomer(customerId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiClient.patch(CUSTOMERS.DETAIL(customerId), payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.customer(customerId) })
      qc.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}

// ── Contacts ──────────────────────────────────────────────────────────────────

export function useCustomerContacts(customerId: number) {
  return useQuery<Contact[]>({
    queryKey: ['customers', customerId, 'contacts'],
    queryFn: () =>
      apiClient.get(CUSTOMERS.CONTACTS(customerId)).then((r) => r.data.results ?? r.data.data ?? r.data),
    enabled: customerId > 0,
  })
}

export function useCreateContact(customerId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiClient.post(CUSTOMERS.CONTACTS(customerId), payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers', customerId, 'contacts'] })
    },
  })
}

// ── Picker (flat list for select/autocomplete UI) ──────────────────────────

export function useCustomerPicker(search?: string) {
  return useQuery<Customer[]>({
    queryKey: ['customers', 'picker', search],
    queryFn: () =>
      apiClient
        .get(CUSTOMERS.LIST, { params: { search, page_size: 30 } })
        .then((r) => r.data.results ?? r.data.data?.results ?? r.data.data ?? r.data),
    staleTime: 60_000,
  })
}
