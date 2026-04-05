import { describe, it, expect } from 'vitest'
import { resolveReportRowDrill } from './drillResolver'

describe('resolveReportRowDrill', () => {
  const dateFrom = '2026-04-01'
  const dateTo = '2026-04-30'

  it('maps invoice-age row to invoice node', () => {
    const seed = resolveReportRowDrill({
      reportKey: 'invoice-age',
      row: { invoice_id: 101, invoice_number: 'INV-101' },
      dateFrom,
      dateTo,
    })
    expect(seed).toEqual({
      nodeType: 'invoice',
      nodeId: 101,
      nodeLabel: 'INV-101',
      dateFrom,
      dateTo,
    })
  })

  it('maps bill-age row to bill node', () => {
    const seed = resolveReportRowDrill({
      reportKey: 'bill-age',
      row: { bill_id: 77, bill_number: 'BILL-077' },
      dateFrom,
      dateTo,
    })
    expect(seed?.nodeType).toBe('bill')
    expect(seed?.nodeId).toBe(77)
    expect(seed?.nodeLabel).toBe('BILL-077')
  })

  it('maps customer summary row to customer node', () => {
    const seed = resolveReportRowDrill({
      reportKey: 'customer-receivable-summary',
      row: { customer_id: 12, customer_name: 'Acme Co' },
      dateFrom,
      dateTo,
    })
    expect(seed?.nodeType).toBe('customer')
    expect(seed?.nodeId).toBe(12)
    expect(seed?.nodeLabel).toBe('Acme Co')
  })

  it('maps supplier summary row to supplier node', () => {
    const seed = resolveReportRowDrill({
      reportKey: 'purchase-by-supplier',
      row: { supplier_id: 33, supplier_name: 'Widget Supply' },
      dateFrom,
      dateTo,
    })
    expect(seed?.nodeType).toBe('supplier')
    expect(seed?.nodeId).toBe(33)
    expect(seed?.nodeLabel).toBe('Widget Supply')
  })

  it('maps gl-master row to account node', () => {
    const seed = resolveReportRowDrill({
      reportKey: 'gl-master',
      row: { account_id: 5, code: '1200', name: 'Accounts Receivable' },
      dateFrom,
      dateTo,
    })
    expect(seed).toEqual({
      nodeType: 'account',
      nodeId: 5,
      nodeLabel: '1200 — Accounts Receivable',
      dateFrom,
      dateTo,
    })
  })

  it('maps cash-book row with supported source type/id', () => {
    const seed = resolveReportRowDrill({
      reportKey: 'cash-book',
      row: {
        reference_type: 'payment',
        reference_id: 44,
        voucher_number: 'PAY-00044',
      },
      dateFrom,
      dateTo,
    })
    expect(seed?.nodeType).toBe('payment')
    expect(seed?.nodeId).toBe(44)
    expect(seed?.nodeLabel).toBe('PAY-00044')
  })

  it('returns null when row has no stable id mapping', () => {
    const seed = resolveReportRowDrill({
      reportKey: 'sales-by-item',
      row: { description: 'Router', total_amount: '5000.00' },
      dateFrom,
      dateTo,
    })
    expect(seed).toBeNull()
  })

  it('returns null for unsupported cash-book reference type', () => {
    const seed = resolveReportRowDrill({
      reportKey: 'cash-book',
      row: { reference_type: 'manual', reference_id: 10 },
      dateFrom,
      dateTo,
    })
    expect(seed).toBeNull()
  })
})
