/**
 * Staff service hooks — all data fetching & mutations for the staff module.
 */
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { STAFF, DEPARTMENTS } from '@/api/endpoints'
import { QK } from '@/constants/queryKeys'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StaffMember {
  id: number
  full_name: string
  email: string
  phone: string | null
  role: string
  custom_role_name: string | null
  department_id: number | null
  department_name: string | null
  employee_id: string | null
  staff_number: string | null
  is_active: boolean
  is_available: boolean
  open_tickets_count: number
}

export interface Department {
  id: number
  name: string
}

export interface StaffFilters {
  search?: string
  department?: number
  role?: string
  is_active?: boolean
}

function extractCursor(nextUrl: string | null): string | undefined {
  if (!nextUrl) return undefined
  try { return new URL(nextUrl).searchParams.get('cursor') ?? undefined } catch { return undefined }
}

// ── List ──────────────────────────────────────────────────────────────────────

export function useStaffList(filters: StaffFilters = {}) {
  return useInfiniteQuery<{ results: StaffMember[]; next: string | null }>({
    queryKey: QK.staff(filters),
    queryFn: ({ pageParam }) =>
      apiClient
        .get(STAFF.LIST, { params: { ...filters, cursor: pageParam } })
        .then((r) => r.data.data ?? r.data),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => extractCursor(lastPage?.next),
    staleTime: 60_000,
  })
}

// ── Detail ────────────────────────────────────────────────────────────────────

export function useStaffMember(id: number | string) {
  const staffId = Number(id)
  return useQuery<StaffMember>({
    queryKey: ['staff', staffId],
    queryFn: () => apiClient.get(STAFF.DETAIL(staffId)).then((r) => r.data.data ?? r.data),
    enabled: !isNaN(staffId) && staffId > 0,
  })
}

// ── Invite ────────────────────────────────────────────────────────────────────

export function useInviteStaff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiClient.post(STAFF.INVITE, payload).then((r) => r.data.data ?? r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff'] })
    },
  })
}

// ── Update ────────────────────────────────────────────────────────────────────

export function useUpdateStaff(staffId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiClient.patch(STAFF.DETAIL(staffId), payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff', staffId] })
      qc.invalidateQueries({ queryKey: ['staff'] })
    },
  })
}

// ── Deactivate / Reactivate ───────────────────────────────────────────────────

export function useDeactivateStaff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (staffId: number) => apiClient.post(STAFF.DEACTIVATE(staffId), {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff'] }) },
  })
}

export function useReactivateStaff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (staffId: number) => apiClient.post(STAFF.REACTIVATE(staffId), {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff'] }) },
  })
}

// ── Reset password ────────────────────────────────────────────────────────────

export function useResetStaffPassword() {
  return useMutation({
    mutationFn: ({ staffId, newPassword }: { staffId: number; newPassword: string }) =>
      apiClient.post(STAFF.RESET_PASSWORD(staffId), { new_password: newPassword }),
  })
}

// ── Departments (needed by invite form) ───────────────────────────────────────

export function useDepartmentOptions() {
  return useQuery<Department[]>({
    queryKey: QK.departments,
    queryFn: () =>
      apiClient.get(DEPARTMENTS.LIST).then((r) => r.data.results ?? r.data.data ?? r.data),
    staleTime: 5 * 60_000,
  })
}

// ── Availability ──────────────────────────────────────────────────────────────

export function useStaffAvailability() {
  return useQuery<StaffMember[]>({
    queryKey: ['staff', 'availability'],
    queryFn: () =>
      apiClient.get(STAFF.AVAILABILITY).then((r) => r.data.results ?? r.data.data ?? r.data),
    staleTime: 2 * 60_000,
    refetchInterval: 5 * 60_000,
  })
}

// ── Picker (flat list for select/autocomplete UI) ──────────────────────────

export function useStaffPicker(search?: string) {
  return useQuery<StaffMember[]>({
    queryKey: ['staff', 'picker', search],
    queryFn: () =>
      apiClient
        .get(STAFF.LIST, { params: { search, page_size: 30 } })
        .then((r) => r.data.results ?? r.data.data?.results ?? r.data.data ?? r.data),
    staleTime: 60_000,
  })
}
