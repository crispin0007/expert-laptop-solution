/**
 * Departments service hooks — all data fetching & mutations for the departments module.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { DEPARTMENTS } from '@/api/endpoints'
import { QK } from '@/constants/queryKeys'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Department {
  id: number
  name: string
  description: string | null
  staff_count: number
  head_name: string | null
}

// ── List ──────────────────────────────────────────────────────────────────────

export function useDepartmentList() {
  return useQuery<Department[]>({
    queryKey: QK.departments,
    queryFn: () =>
      apiClient.get(DEPARTMENTS.LIST).then((r) => r.data.results ?? r.data.data ?? r.data),
    staleTime: 2 * 60_000,
  })
}

// ── Create ────────────────────────────────────────────────────────────────────

export function useCreateDepartment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { name: string; description?: string | null }) =>
      apiClient.post(DEPARTMENTS.CREATE, payload).then((r) => r.data.data ?? r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.departments })
    },
  })
}

// ── Update ────────────────────────────────────────────────────────────────────

export function useUpdateDepartment(deptId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { name?: string; description?: string | null }) =>
      apiClient.patch(DEPARTMENTS.UPDATE(deptId), payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.departments })
    },
  })
}

// ── Delete ────────────────────────────────────────────────────────────────────

export function useDeleteDepartment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (deptId: number) => apiClient.delete(DEPARTMENTS.DELETE(deptId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.departments })
    },
  })
}
