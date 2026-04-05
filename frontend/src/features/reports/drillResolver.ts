export type DrillNodeType =
  | 'account'
  | 'journal_entry'
  | 'invoice'
  | 'bill'
  | 'payment'
  | 'credit_note'
  | 'debit_note'
  | 'customer'
  | 'supplier'

export interface DrillSeed {
  nodeType: DrillNodeType
  nodeId: number
  nodeLabel: string
  dateFrom?: string
  dateTo?: string
}

interface ResolveArgs {
  reportKey: string
  row: Record<string, unknown>
  dateFrom?: string
  dateTo?: string
}

function toPositiveInt(v: unknown): number {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : 0
}

function asNodeType(v: unknown): DrillNodeType | null {
  const s = String(v || '') as DrillNodeType
  return [
    'account',
    'journal_entry',
    'invoice',
    'bill',
    'payment',
    'credit_note',
    'debit_note',
    'customer',
    'supplier',
  ].includes(s) ? s : null
}

export function resolveReportRowDrill({ reportKey, row, dateFrom, dateTo }: ResolveArgs): DrillSeed | null {
  if (reportKey === 'invoice-age' || reportKey === 'sales-master') {
    const invoiceId = toPositiveInt(row.invoice_id)
    if (!invoiceId) return null
    return {
      nodeType: 'invoice',
      nodeId: invoiceId,
      nodeLabel: String(row.invoice_number ?? `Invoice #${invoiceId}`),
      dateFrom,
      dateTo,
    }
  }

  if (reportKey === 'bill-age' || reportKey === 'purchase-master') {
    const billId = toPositiveInt(row.bill_id)
    if (!billId) return null
    return {
      nodeType: 'bill',
      nodeId: billId,
      nodeLabel: String(row.bill_number ?? `Bill #${billId}`),
      dateFrom,
      dateTo,
    }
  }

  if (reportKey === 'customer-receivable-summary' || reportKey === 'sales-by-customer') {
    const customerId = toPositiveInt(row.customer_id)
    if (!customerId) return null
    return {
      nodeType: 'customer',
      nodeId: customerId,
      nodeLabel: String(row.customer_name ?? `Customer #${customerId}`),
      dateFrom,
      dateTo,
    }
  }

  if (reportKey === 'supplier-payable-summary' || reportKey === 'purchase-by-supplier') {
    const supplierId = toPositiveInt(row.supplier_id)
    if (!supplierId) return null
    return {
      nodeType: 'supplier',
      nodeId: supplierId,
      nodeLabel: String(row.supplier_name ?? `Supplier #${supplierId}`),
      dateFrom,
      dateTo,
    }
  }

  if (reportKey === 'gl-master') {
    const accountId = toPositiveInt(row.account_id)
    if (!accountId) return null
    return {
      nodeType: 'account',
      nodeId: accountId,
      nodeLabel: `${String(row.code ?? '')} — ${String(row.name ?? `Account #${accountId}`)}`,
      dateFrom,
      dateTo,
    }
  }

  if (reportKey === 'cash-book') {
    const nodeType = asNodeType(row.reference_type)
    const nodeId = toPositiveInt(row.reference_id)
    if (!nodeType || !nodeId) return null
    return {
      nodeType,
      nodeId,
      nodeLabel: String(row.voucher_number ?? row.entry_number ?? `${nodeType} #${nodeId}`),
      dateFrom,
      dateTo,
    }
  }

  return null
}
