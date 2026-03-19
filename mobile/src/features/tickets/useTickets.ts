/**
 * Tickets service hooks — all data fetching & mutations for the tickets module.
 * Screens import from here; never call apiClient directly in UI files.
 */
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { TICKETS, INVENTORY } from '@/api/endpoints'
import { QK } from '@/constants/queryKeys'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Ticket {
  id: number
  ticket_number: string
  title: string
  description: string | null
  status: string
  priority: string
  ticket_type_name: string | null
  customer_name: string
  customer_phone: string
  customer_email: string
  contact_phone: string | null
  department_name: string | null
  assigned_to: number | null
  assigned_to_name: string | null
  created_by_name: string | null
  team_member_names: string[]
  category_name: string | null
  sla_deadline: string | null
  sla_breached: boolean
  resolved_at: string | null
  closed_at: string | null
  created_at: string
  vehicles: number[]
  vehicle_names: Array<{ id: number; name: string; plate_number: string }>
}

export interface Vehicle {
  id: number
  name: string
  plate_number: string
  model: string | null
  is_active: boolean
}

export interface InventoryProduct {
  id: number
  name: string
  sku: string | null
  unit_price: string
  has_warranty: boolean
}

export interface TicketAttachment {
  id: number
  file_name: string
  file_size: number
  url: string
  uploaded_by_name: string
  created_at: string
  comment: number | null
}

export interface TicketComment {
  id: number
  author_name: string
  body: string
  is_internal: boolean
  created_at: string
}

export interface TicketType {
  id: number
  name: string
  is_active: boolean
}

export interface TicketCategory {
  id: number
  name: string
  ticket_type: number
}

export interface TicketSubcategory {
  id: number
  name: string
  category: number
}

export interface TicketProduct {
  id: number
  product: number
  product_name: string
  quantity: number
  unit_price: string
  discount: string
  line_total: string
  serial_number: number | null
  serial_number_display: string | null
}

export interface PaginatedResponse<T> {
  results: T[]
  next: string | null
  previous: string | null
  count?: number
}

export const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  pending_customer: 'Pending',
  resolved: 'Resolved',
  closed: 'Closed',
  cancelled: 'Cancelled',
}

export const STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ['in_progress', 'cancelled'],
  in_progress: ['pending_customer', 'resolved', 'cancelled'],
  pending_customer: ['in_progress', 'resolved', 'cancelled'],
  resolved: ['closed', 'open'],
  closed: [],
  cancelled: [],
}

// ── List (infinite scroll — page-number pagination) ─────────────────────────

export interface TicketFilters {
  search?: string
  status?: string
  priority?: string
  assigned_to?: number | 'me'
}

/** Unwrap NexusPageNumberPagination envelope into a normalised page object. */
function unwrapPage<T>(r: any): PaginatedResponse<T> {
  // Envelope: { success, data: [...], meta: { pagination: { next, ... } } }
  if (r.data?.meta?.pagination !== undefined) {
    const pag = r.data.meta.pagination
    const results: T[] = Array.isArray(r.data.data) ? r.data.data : []
    return { results, next: pag.next ?? null, previous: pag.previous ?? null, count: pag.total }
  }
  // Plain array (staff / legacy)
  if (Array.isArray(r.data)) {
    return { results: r.data as T[], next: null, previous: null }
  }
  // Already shaped { results, next }
  const d = r.data.data ?? r.data
  const results: T[] = Array.isArray(d) ? d : (d?.results ?? [])
  return { results, next: d?.next ?? null, previous: d?.previous ?? null }
}

export function useTicketList(filters: TicketFilters = {}) {
  return useInfiniteQuery<PaginatedResponse<Ticket>>({
    queryKey: ['tickets', 'pg', filters],
    queryFn: ({ pageParam }) =>
      apiClient
        .get(TICKETS.LIST, { params: { ...filters, page: pageParam ?? 1 } })
        .then((r) => unwrapPage<Ticket>(r)),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastParam) => {
      if (!lastPage?.next) return undefined
      return (typeof lastParam === 'number' ? lastParam : 1) + 1
    },
    staleTime: 60_000,
  })
}

// ── Detail ────────────────────────────────────────────────────────────────────

export function useTicket(id: number | string) {
  const ticketId = Number(id)
  return useQuery<Ticket>({
    queryKey: QK.ticket(ticketId),
    queryFn: () => apiClient.get(TICKETS.DETAIL(ticketId)).then((r) => r.data.data ?? r.data),
    enabled: !isNaN(ticketId) && ticketId > 0,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

// ── Comments ──────────────────────────────────────────────────────────────────

export function useTicketComments(ticketId: number, enabled = true) {
  return useQuery<TicketComment[]>({
    queryKey: QK.ticketComments(ticketId),
    queryFn: () =>
      apiClient.get(TICKETS.COMMENTS(ticketId)).then((r) => r.data.results ?? r.data.data ?? r.data),
    enabled: enabled && ticketId > 0,
  })
}

export function useAddComment(ticketId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { body: string; is_internal: boolean }) =>
      apiClient.post(TICKETS.COMMENTS(ticketId), payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.ticketComments(ticketId) })
    },
  })
}

// ── Products (parts/services used on ticket) ──────────────────────────────────

export function useTicketProducts(ticketId: number, enabled = true) {
  return useQuery<TicketProduct[]>({
    queryKey: QK.ticketProducts(ticketId),
    queryFn: () =>
      apiClient
        .get(TICKETS.PRODUCTS(ticketId))
        .then((r) => r.data.results ?? r.data.data ?? r.data),
    enabled: enabled && ticketId > 0,
    placeholderData: [],
  })
}

// ── Timeline ──────────────────────────────────────────────────────────────────

export function useTicketTimeline(ticketId: number, enabled = true) {
  return useQuery<Record<string, unknown>[]>({
    queryKey: QK.ticketTimeline(ticketId),
    queryFn: () =>
      apiClient.get(TICKETS.TIMELINE(ticketId)).then((r) => {
        const d = r.data
        if (Array.isArray(d)) return d
        return d?.results ?? d?.data ?? []
      }),
    enabled: enabled && ticketId > 0,
    placeholderData: [],
  })
}

// ── Status update ─────────────────────────────────────────────────────────────

export function useUpdateTicketStatus(ticketId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ status, reason }: { status: string; reason?: string }) =>
      apiClient.post(TICKETS.STATUS(ticketId), { status, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.ticket(ticketId) })
      qc.invalidateQueries({ queryKey: QK.dashboardStats })
    },
  })
}

// ── Assign ────────────────────────────────────────────────────────────────────

export function useAssignTicket(ticketId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (staffId: number) =>
      apiClient.post(TICKETS.ASSIGN(ticketId), { assigned_to: staffId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.ticket(ticketId) })
      qc.invalidateQueries({ queryKey: QK.tickets() })
    },
  })
}

// ── Transfer ──────────────────────────────────────────────────────────────────

export function useTransferTicket(ticketId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { department: number; reason?: string }) =>
      apiClient.post(TICKETS.TRANSFER(ticketId), payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.ticket(ticketId) })
    },
  })
}

// ── Close ─────────────────────────────────────────────────────────────────────

export function useCloseTicket(ticketId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { resolution_notes?: string }) =>
      apiClient.post(TICKETS.CLOSE(ticketId), payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.ticket(ticketId) })
      qc.invalidateQueries({ queryKey: QK.tickets() })
      qc.invalidateQueries({ queryKey: QK.dashboardStats })
    },
  })
}

// ── Create ────────────────────────────────────────────────────────────────────

export function useCreateTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiClient.post(TICKETS.CREATE, payload).then((r) => r.data.data ?? r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
      qc.invalidateQueries({ queryKey: QK.dashboardStats })
    },
  })
}

// ── Types & Categories ────────────────────────────────────────────────────────

export function useTicketTypes() {
  return useQuery<TicketType[]>({
    queryKey: QK.ticketTypes,
    queryFn: () =>
      apiClient.get(TICKETS.TYPES).then((r) => r.data.results ?? r.data.data ?? r.data),
    staleTime: 5 * 60_000,
  })
}

export function useTicketSubcategories(categoryId?: number) {
  return useQuery<TicketSubcategory[]>({
    queryKey: ['ticket-subcategories', categoryId],
    queryFn: () =>
      apiClient
        .get(TICKETS.SUBCATEGORIES, { params: categoryId ? { category: categoryId } : {} })
        .then((r) => r.data.results ?? r.data.data ?? r.data),
    enabled: categoryId !== undefined && categoryId > 0,
    staleTime: 5 * 60_000,
  })
}

export function useTicketCategories(typeId?: number) {
  return useQuery<TicketCategory[]>({
    queryKey: QK.categories(typeId),
    queryFn: () =>
      apiClient
        .get(TICKETS.CATEGORIES, { params: typeId ? { ticket_type: typeId } : {} })
        .then((r) => r.data.results ?? r.data.data ?? r.data),
    enabled: typeId !== undefined,
    staleTime: 5 * 60_000,
  })
}

// ── Inventory product search ──────────────────────────────────────────────────

export function useInventoryProductSearch(search: string) {
  return useQuery<InventoryProduct[]>({
    queryKey: ['inventory-products', search],
    queryFn: () =>
      apiClient
        .get(INVENTORY.PRODUCTS, { params: search ? { search } : {} })
        .then((r) => r.data.results ?? r.data.data ?? r.data),
    staleTime: 2 * 60_000,
    placeholderData: [],
  })
}

// ── Available serial numbers for a product ───────────────────────────────────

export type SerialNumberItem = {
  id: number
  serial_number: string
  warranty_expires: string | null
}

export function useAvailableSerialNumbers(productId: number | null) {
  return useQuery<SerialNumberItem[]>({
    queryKey: ['serial-numbers-available', productId],
    queryFn: () =>
      apiClient
        .get(INVENTORY.SERIAL_NUMBERS, { params: { product: productId, status: 'available' } })
        .then((r) => r.data.results ?? r.data.data ?? r.data),
    enabled: productId != null,
    staleTime: 30_000,
  })
}

// ── Ticket products (add / delete) ────────────────────────────────────────────

export function useAddTicketProduct(ticketId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { product: number; quantity: number; unit_price?: string; serial_number?: number | null }) =>
      apiClient.post(TICKETS.PRODUCTS(ticketId), payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.ticket(ticketId) })
      qc.invalidateQueries({ queryKey: QK.ticketProducts(ticketId) })
    },
  })
}

export function useDeleteTicketProduct(ticketId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ticketProductId: number) =>
      apiClient.delete(TICKETS.PRODUCT_DETAIL(ticketId, ticketProductId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.ticket(ticketId) })
      qc.invalidateQueries({ queryKey: QK.ticketProducts(ticketId) })
    },
  })
}

// ── Ticket attachments ────────────────────────────────────────────────────────

export function useTicketAttachments(ticketId: number, enabled = true) {
  return useQuery<TicketAttachment[]>({
    queryKey: ['ticket-attachments', ticketId],
    queryFn: () =>
      apiClient
        .get(TICKETS.ATTACHMENTS(ticketId))
        .then((r) => r.data.results ?? r.data.data ?? r.data),
    enabled: enabled && ticketId > 0,
    placeholderData: [],
  })
}

export function useAddTicketAttachment(ticketId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (formData: FormData) =>
      apiClient.post(TICKETS.ATTACHMENTS(ticketId), formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket-attachments', ticketId] })
    },
  })
}

export function useDeleteTicketAttachment(ticketId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (attachmentId: number) =>
      apiClient.delete(TICKETS.ATTACHMENT_DETAIL(ticketId, attachmentId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket-attachments', ticketId] })
    },
  })
}

// ── Vehicles ──────────────────────────────────────────────────────────────────

export function useVehicleList() {
  return useQuery<Vehicle[]>({
    queryKey: ['vehicle-list'],
    queryFn: () =>
      apiClient
        .get(TICKETS.VEHICLES)
        .then((r) => r.data.results ?? r.data.data ?? r.data),
    staleTime: 5 * 60_000,
    placeholderData: [],
  })
}

export function useUpdateTicketVehicles(ticketId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vehicleIds: number[]) =>
      apiClient.patch(TICKETS.DETAIL(ticketId), { vehicles: vehicleIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.ticket(ticketId) })
    },
  })
}
