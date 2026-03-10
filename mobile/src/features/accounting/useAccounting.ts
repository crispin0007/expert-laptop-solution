/**
 * Accounting service hooks — coins, payslips, invoices.
 * Other accounting sub-modules (journals, bills, etc.) live in Phase 2 — stubs kept here.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { ACCOUNTING } from '@/api/endpoints'
import { QK } from '@/constants/queryKeys'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CoinTransaction {
  id: number
  staff_name: string
  amount: number
  status: 'pending' | 'approved' | 'rejected'
  reason: string
  created_at: string
  ticket_number: string | null
}

export interface Payslip {
  id: number
  staff_name: string
  period_label: string
  base_salary: string
  coin_bonus: string
  total: string
  status: string
  generated_at: string
}

export interface Invoice {
  id: number
  invoice_number: string
  customer_name: string
  status: string
  finance_status: string
  total: string
  amount_due: string
  created_at: string
}

// ── Coins ─────────────────────────────────────────────────────────────────────

export function useCoinList(status?: string) {
  const params = status ? { status } : {}
  return useQuery<CoinTransaction[]>({
    queryKey: QK.coins(params),
    queryFn: () =>
      apiClient.get(ACCOUNTING.COINS, { params }).then((r) => r.data.results ?? r.data.data ?? r.data),
    staleTime: 60_000,
  })
}

export function useApproveCoin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (coinId: number) => apiClient.post(ACCOUNTING.COIN_APPROVE(coinId), {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['coins'] })
      qc.invalidateQueries({ queryKey: QK.dashboardStats })
    },
  })
}

export function useRejectCoin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ coinId, reason }: { coinId: number; reason?: string }) =>
      apiClient.post(ACCOUNTING.COIN_REJECT(coinId), { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['coins'] })
    },
  })
}

export function useAwardCoins() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { staff: number; amount: number; reason?: string }) =>
      apiClient.post(ACCOUNTING.COINS_AWARD, payload).then((r) => r.data.data ?? r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['coins'] })
      qc.invalidateQueries({ queryKey: QK.dashboardStats })
    },
  })
}

// ── Payslips ──────────────────────────────────────────────────────────────────

export function usePayslipList(params?: object) {
  return useQuery<Payslip[]>({
    queryKey: QK.payslips(params),
    queryFn: () =>
      apiClient.get(ACCOUNTING.PAYSLIPS, { params }).then((r) => r.data.results ?? r.data.data ?? r.data),
    staleTime: 2 * 60_000,
  })
}

export function usePayslip(id: number) {
  return useQuery<Payslip>({
    queryKey: ['payslips', id],
    queryFn: () => apiClient.get(ACCOUNTING.PAYSLIP(id)).then((r) => r.data.data ?? r.data),
    enabled: id > 0,
  })
}

// ── Invoices ──────────────────────────────────────────────────────────────────

export function useInvoiceList(params?: object) {
  return useQuery<Invoice[]>({
    queryKey: QK.invoices(params),
    queryFn: () =>
      apiClient.get(ACCOUNTING.INVOICES, { params }).then((r) => r.data.results ?? r.data.data ?? r.data),
    staleTime: 60_000,
  })
}

export function useInvoice(id: number) {
  return useQuery<Invoice>({
    queryKey: ['invoices', id],
    queryFn: () => apiClient.get(ACCOUNTING.INVOICE(id)).then((r) => r.data.data ?? r.data),
    enabled: id > 0,
  })
}

export function useMarkInvoicePaid(invoiceId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.post(ACCOUNTING.INVOICE_MARK_PAID(invoiceId), {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices', invoiceId] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}
