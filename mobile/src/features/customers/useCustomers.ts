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
  /** Street / Tole / Landmark — backend field name is `street` */
  street: string | null
  district: string | null
  municipality: string | null
  ward_no: string | null
  province: string | null
  is_active: boolean
  open_tickets_count?: number
  notes: string | null
  created_at: string
  full_address?: string | null
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
  count?: number
}

function unwrapPage<T>(r: any): PaginatedResponse<T> {
  if (r.data?.meta?.pagination !== undefined) {
    const pag = r.data.meta.pagination
    const results: T[] = Array.isArray(r.data.data) ? r.data.data : []
    return { results, next: pag.next ?? null, previous: pag.previous ?? null, count: pag.total }
  }
  if (Array.isArray(r.data)) {
    return { results: r.data as T[], next: null, previous: null }
  }
  const d = r.data.data ?? r.data
  const results: T[] = Array.isArray(d) ? d : (d?.results ?? [])
  return { results, next: d?.next ?? null, previous: d?.previous ?? null }
}

// ── List ──────────────────────────────────────────────────────────────────────

export interface CustomerFilters {
  search?: string
}

export function useCustomerList(filters: CustomerFilters = {}) {
  return useInfiniteQuery<PaginatedResponse<Customer>>({
    queryKey: ['customers', 'pg', filters],
    queryFn: ({ pageParam }) =>
      apiClient
        .get(CUSTOMERS.LIST, { params: { ...filters, page: pageParam ?? 1 } })
        .then((r) => unwrapPage<Customer>(r)),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastParam) => {
      if (!lastPage?.next) return undefined
      return (typeof lastParam === 'number' ? lastParam : 1) + 1
    },
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
