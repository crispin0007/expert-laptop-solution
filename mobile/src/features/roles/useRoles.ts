/**
 * Roles service hooks.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { ROLES } from '@/api/endpoints'
import { QK } from '@/constants/queryKeys'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Role {
  id: number
  name: string
  description: string | null
  is_system: boolean
  member_count: number
}

export interface RolePermissions {
  [key: string]: boolean
}

// ── List ──────────────────────────────────────────────────────────────────────

export function useRoleList() {
  return useQuery<Role[]>({
    queryKey: QK.roles,
    queryFn: () =>
      apiClient.get(ROLES.LIST).then((r) => r.data.results ?? r.data.data ?? r.data),
    staleTime: 5 * 60_000,
  })
}

// ── Detail ────────────────────────────────────────────────────────────────────

export function useRole(id: number) {
  return useQuery<Role & { permissions: RolePermissions }>({
    queryKey: ['roles', id],
    queryFn: () => apiClient.get(ROLES.DETAIL(id)).then((r) => r.data.data ?? r.data),
    enabled: id > 0,
  })
}

// ── Permission map (all available permissions) ────────────────────────────────

export function usePermissionMap() {
  return useQuery<Record<string, { label: string; group: string }>>({
    queryKey: ['roles', 'permission-map'],
    queryFn: () => apiClient.get(ROLES.PERMISSIONS).then((r) => r.data.data ?? r.data),
    staleTime: 10 * 60_000,
  })
}

// ── Create ────────────────────────────────────────────────────────────────────

export function useCreateRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { name: string; description?: string; permissions: RolePermissions }) =>
      apiClient.post(ROLES.CREATE, payload).then((r) => r.data.data ?? r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.roles })
    },
  })
}

// ── Update ────────────────────────────────────────────────────────────────────

export function useUpdateRole(roleId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiClient.patch(ROLES.UPDATE(roleId), payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.roles })
      qc.invalidateQueries({ queryKey: ['roles', roleId] })
    },
  })
}

// ── Delete ────────────────────────────────────────────────────────────────────

export function useDeleteRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (roleId: number) => apiClient.delete(ROLES.DELETE(roleId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.roles })
    },
  })
}
