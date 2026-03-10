/**
 * Auth service hooks — user profile + 2FA management.
 * Auth state (access/refresh tokens, user) lives in authStore.
 * These hooks handle server-side profile data and 2FA setup flows.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { AUTH } from '@/api/endpoints'
import { QK } from '@/constants/queryKeys'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: number
  email: string
  full_name: string
  phone: string | null
  role: string
  custom_role_name: string | null
  department: { id: number; name: string } | null
  staff_number: string | null
  employee_id: string | null
  is_2fa_enabled: boolean
  backup_codes_remaining: number
  date_joined: string
}

export interface TwoFAStatus {
  is_2fa_enabled: boolean
  backup_codes_remaining: number
}

export interface SetupInitResponse {
  qr_code_url?: string
  secret: string
  provisioning_uri: string
}

export interface BackupCodesResponse {
  backup_codes: string[]
}

// ── Profile ───────────────────────────────────────────────────────────────────

export function useProfile() {
  return useQuery<UserProfile>({
    queryKey: QK.me,
    queryFn: () => apiClient.get(AUTH.ME).then((r) => r.data.data ?? r.data),
    staleTime: 60_000,
  })
}

// ── 2FA ───────────────────────────────────────────────────────────────────────

/** Returns { is_2fa_enabled, backup_codes_remaining } mapped from /me. */
export function use2FAStatus() {
  return useQuery<TwoFAStatus>({
    queryKey: QK.me,
    queryFn: () =>
      apiClient.get(AUTH.ME).then((r) => ({
        is_2fa_enabled: r.data.data?.is_2fa_enabled ?? r.data.is_2fa_enabled ?? false,
        backup_codes_remaining: r.data.data?.backup_codes_remaining ?? r.data.backup_codes_remaining ?? 0,
      })),
    staleTime: 30_000,
  })
}

/** Initiate TOTP setup — returns QR URL + secret. */
export function useSetup2FA() {
  return useMutation<SetupInitResponse>({
    mutationFn: () => apiClient.get(AUTH.TOTP_SETUP_INIT).then((r) => r.data.data ?? r.data),
  })
}

/** Confirm TOTP setup with the 6-digit code — returns backup codes. */
export function useConfirm2FA() {
  const qc = useQueryClient()
  return useMutation<BackupCodesResponse, Error, string>({
    mutationFn: (code: string) =>
      apiClient.post(AUTH.TOTP_SETUP_CONFIRM, { code }).then((r) => r.data.data ?? r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.me })
    },
  })
}

/** Regenerate backup codes — returns new backup codes. */
export function useRegen2FABackup() {
  return useMutation<BackupCodesResponse>({
    mutationFn: () => apiClient.post(AUTH.TOTP_BACKUP_CODES).then((r) => r.data.data ?? r.data),
  })
}

/** Disable 2FA with verification code. */
export function useDisable2FA() {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: (code: string) =>
      apiClient.post(AUTH.TOTP_DISABLE, { code }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.me })
    },
  })
}
