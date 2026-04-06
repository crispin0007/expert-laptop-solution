import type { ApiPage } from '../types/accounting'
import { adStringToBsDisplay } from '../../../utils/nepaliDate'

export const STATUS_COLORS: Record<string, string> = {
  draft:    'bg-gray-100 text-gray-600',
  issued:   'bg-blue-100 text-blue-700',
  approved: 'bg-indigo-100 text-indigo-700',
  paid:     'bg-green-100 text-green-700',
  void:     'bg-red-100 text-red-500',
  pending:  'bg-yellow-100 text-yellow-700',
  rejected: 'bg-red-100 text-red-600',
  posted:   'bg-green-100 text-green-700',
  applied:  'bg-purple-100 text-purple-700',
  incoming: 'bg-green-100 text-green-700',
  outgoing: 'bg-orange-100 text-orange-700',
}

export const PURPOSE_BADGE: Record<string, string> = {
  revenue:      'bg-green-100 text-green-700',
  cogs:         'bg-orange-100 text-orange-700',
  payslip:      'bg-blue-100 text-blue-700',
  vat:          'bg-purple-100 text-purple-700',
  tds:          'bg-violet-100 text-violet-700',
  payment:      'bg-sky-100 text-sky-700',
  reversal:     'bg-red-100 text-red-700',
  recurring:    'bg-gray-100 text-gray-600',
  depreciation: 'bg-amber-100 text-amber-700',
  fx_gain_loss: 'bg-cyan-100 text-cyan-700',
  adjustment:   'bg-gray-100 text-gray-600',
}

export const QUO_STATUS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600', sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-emerald-100 text-emerald-700', declined: 'bg-red-100 text-red-600',
  expired: 'bg-yellow-100 text-yellow-700',
}

export const PO_STATUS: Record<string, string> = {
  draft:    'bg-gray-100 text-gray-600',
  sent:     'bg-blue-100 text-blue-700',
  partial:  'bg-yellow-100 text-yellow-700',
  received: 'bg-emerald-100 text-emerald-700',
  cancelled:'bg-red-100 text-red-500',
}

export const DN_STATUS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600', issued: 'bg-blue-100 text-blue-700',
  applied: 'bg-emerald-100 text-emerald-700', void: 'bg-red-100 text-red-500',
}

export const FREQ_LABELS: Record<string, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' }

export const EXPENSE_STATUS_COLORS: Record<string, string> = {
  draft:    'bg-gray-100 text-gray-600',
  approved: 'bg-blue-100 text-blue-700',
  posted:   'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
}

export const CHEQUE_STATUS_COLORS: Record<string, string> = {
  issued:    'bg-amber-100 text-amber-700',
  presented: 'bg-blue-100 text-blue-700',
  cleared:   'bg-green-100 text-green-700',
  bounced:   'bg-red-100 text-red-700',
}

export function formatNpr(value: string | number) {
  return `NPR ${Number(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function formatBsDate(d: string | null) {
  if (!d) return '—'
  const bs = adStringToBsDisplay(d)
  return bs?.bs ?? '—'
}

export function buildAccountingUrl(
  tab: string,
  extra?: Record<string, string | number | null | undefined>,
) {
  const path = tab ? `/accounting/${tab}` : '/accounting'
  const params = new URLSearchParams()

  if (extra) {
    Object.entries(extra).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        params.set(key, String(value))
      }
    })
  }

  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

export function addFyParam(url: string, fyYear: number | null): string {
  if (!fyYear) return url
  return url.includes('?') ? `${url}&fiscal_year=${fyYear}` : `${url}?fiscal_year=${fyYear}`
}

export function resolveLedgerSourceRoute(referenceType?: string, referenceId?: number | null) {
  if (!referenceType || !referenceId) return null
  if (referenceType === 'invoice') return { tab: 'invoices', key: 'focus_invoice_id', id: referenceId }
  if (referenceType === 'bill') return { tab: 'bills', key: 'focus_bill_id', id: referenceId }
  if (referenceType === 'payment') return { tab: 'payments', key: 'focus_payment_id', id: referenceId }
  if (referenceType === 'credit_note') return { tab: 'credit-notes', key: 'focus_credit_note_id', id: referenceId }
  if (referenceType === 'debit_note') return { tab: 'debit-notes', key: 'focus_debit_note_id', id: referenceId }
  return null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toPage<T = any>(raw: any): ApiPage<T> {
  if (Array.isArray(raw)) return { results: raw as T[], count: raw.length }
  if (Array.isArray(raw?.data)) return { results: raw.data as T[], count: raw.data.length }
  return { results: raw?.results ?? [], count: raw?.count ?? 0 }
}

export function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

export function csvFromRows(rows: Array<Array<string | number | boolean | null | undefined>>): string {
  return rows.map(row => row.map(escapeCsvCell).join(',')).join('\n')
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function openPrintWindow(title: string, bodyHtml: string, extraHead = '', delay = 400): boolean {
  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) return false

  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>${extraHead}</head><body>${bodyHtml}</body></html>`)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), delay)
  return true
}
