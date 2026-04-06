import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import apiClient from '../../../api/client'
import { ACCOUNTING } from '../../../api/endpoints'
import toast from 'react-hot-toast'
import NepaliDatePicker from '../../../components/NepaliDatePicker'
import { useTenantStore } from '../../../store/tenantStore'
import { useAuthStore } from '../../../store/authStore'
import { formatBsDate, formatNpr, downloadCsv, csvFromRows, openPrintWindow } from '../utils'
import type { DayBookRangeReport } from '../types/accounting'
import { Loader2, CalendarDays, Search, FileSpreadsheet, Download, Printer, ChevronsDownUp, ChevronsUpDown, ChevronDown } from 'lucide-react'

const fmt = formatBsDate
const npr = formatNpr

export default function DayBookPage() {
  const today = new Date().toISOString().slice(0, 10)
  const tenantName = useTenantStore(s => s.tenantName)
  const tenantLogo = useTenantStore(s => s.logo)
  const currentUser = useAuthStore(s => s.user)
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo, setDateTo] = useState(today)
  const [entrySearch, setEntrySearch] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [expandedEntry, setExpandedEntry] = useState<Set<string>>(new Set())

  const { data: dayBook, isLoading, isFetching } = useQuery<DayBookRangeReport>({
    queryKey: ['day-book', dateFrom, dateTo],
    queryFn: () => apiClient.get(`${ACCOUNTING.REPORT_DAY_BOOK}?date_from=${dateFrom}&date_to=${dateTo}`).then(r => r.data?.data ?? r.data),
    enabled: submitted,
  })

  const filteredDays = useMemo(() => {
    const days = dayBook?.days ?? []
    const q = entrySearch.trim().toLowerCase()
    return days
      .map(day => {
        const entries = (day.entries ?? []).filter(entry => {
          if (!q) return true
          return (
            String(entry.entry_number ?? '').toLowerCase().includes(q)
            || String(entry.description ?? '').toLowerCase().includes(q)
            || String(entry.reference_type ?? '').toLowerCase().includes(q)
            || (entry.lines ?? []).some(line =>
              String(line.account_code ?? '').toLowerCase().includes(q)
              || String(line.account_name ?? '').toLowerCase().includes(q)
              || String(line.description ?? '').toLowerCase().includes(q),
            )
          )
        })
        const totalDebit = entries.reduce((sum, e) => sum + Number(e.total_debit || 0), 0)
        const totalCredit = entries.reduce((sum, e) => sum + Number(e.total_credit || 0), 0)
        return {
          ...day,
          entries,
          total_debit: String(totalDebit),
          total_credit: String(totalCredit),
          entry_count: entries.length,
        }
      })
      .filter(day => day.entries.length > 0 || !q)
  }, [dayBook, entrySearch])

  const flattenedEntries = useMemo(
    () => filteredDays.flatMap(day => (day.entries ?? []).map(entry => ({
      day,
      entry,
      key: `${day.date}::${entry.entry_number}`,
    }))),
    [filteredDays],
  )

  const filteredEntryCount = flattenedEntries.length

  const exportCsv = useCallback(() => {
    if (!dayBook) return
    const rows: Array<Array<string | number | boolean | null | undefined>> = [
      ['Date', 'Entry Number', 'Reference Type', 'Entry Description', 'Account Code', 'Account Name', 'Line Description', 'Debit', 'Credit'],
    ]
    ;(filteredDays ?? []).forEach(day => {
      (day.entries ?? []).forEach(entry => {
        (entry.lines ?? []).forEach(line => {
          rows.push([
            day.date,
            entry.entry_number,
            entry.reference_type || '',
            entry.description || '',
            line.account_code || '',
            line.account_name || '',
            line.description || '',
            line.debit || '0',
            line.credit || '0',
          ])
        })
      })
    })
    const csv = csvFromRows(rows)
    downloadCsv(`day_book_${dayBook.date_from}_to_${dayBook.date_to}.csv`, csv)
  }, [dayBook, filteredDays])

  const openPrintableReport = useCallback((mode: 'print' | 'pdf') => {
    if (!dayBook) return

    const esc = (v: string) => v
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')

    const companyDisplay = esc(tenantName || 'Company')
    const preparedBy = esc(currentUser?.full_name || currentUser?.email || currentUser?.username || 'System User')
    const now = new Date()
    const preparedAt = now.toLocaleString('en-GB', {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })

    const logoHtml = tenantLogo
      ? `<img src="${esc(tenantLogo)}" alt="${companyDisplay} logo" style="height:40px;max-width:180px;object-fit:contain;display:block;margin-bottom:4px;" />`
      : ''

    const html = `<!doctype html><html><head><meta charset="utf-8" /><title>Day Book ${dayBook.date_from} to ${dayBook.date_to}</title><style>
      body{font-family:Arial,sans-serif;padding:16px;color:#111827;font-size:12px}
      .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #d1d5db;padding-bottom:10px;margin-bottom:10px}
      .title{font-size:16px;font-weight:700;margin:0 0 3px}
      .meta{font-size:11px;color:#4b5563;line-height:1.5}
      .period{border:1px solid #e5e7eb;background:#f9fafb;padding:6px 10px;border-radius:3px;margin-bottom:10px;font-size:11px;color:#374151}
      table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:10px}
      th,td{border:1px solid #e5e7eb;padding:5px 6px;vertical-align:top}
      th{background:#f3f4f6;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.4px;color:#4b5563}
      .right{text-align:right}
      .day{margin-top:12px;font-weight:700;color:#374151}
      .sign{display:flex;gap:12px;margin-top:14px}
      .sign-box{flex:1;border:1px solid #e5e7eb;border-radius:3px;padding:8px 10px}
      .sign-title{font-size:10px;text-transform:uppercase;letter-spacing:0.6px;color:#6b7280;font-weight:700;margin-bottom:16px}
      .sign-line{border-top:1px solid #9ca3af;padding-top:4px;display:flex;justify-content:space-between;color:#4b5563;font-size:10px}
      @media print { body{padding:8px} }
    </style></head><body>
      <div class="top">
        <div>
          ${logoHtml}
          <div class="title">${companyDisplay}</div>
          <div class="meta">Day Book Statement</div>
        </div>
        <div class="meta" style="text-align:right;">Entries: ${filteredEntryCount}<br/>Generated: ${esc(preparedAt)}</div>
      </div>
      <div class="period"><strong>Time Period:</strong> ${esc(dayBook.date_from)} to ${esc(dayBook.date_to)}</div>
      ${(filteredDays ?? []).map(day => `
        <div class="day">Date: ${esc(day.date)}</div>
        <table>
          <thead><tr><th>Entry</th><th>Description</th><th>Account</th><th>Line Description</th><th class="right">Debit</th><th class="right">Credit</th></tr></thead>
          <tbody>
            ${(day.entries ?? []).flatMap(entry =>
              (entry.lines ?? []).map(line => `
                <tr>
                  <td>${esc(entry.entry_number)}</td>
                  <td>${esc(entry.description || '-')}</td>
                  <td>${esc(`${line.account_code} ${line.account_name}`.trim())}</td>
                  <td>${esc(line.description || '-')}</td>
                  <td class="right">${Number(line.debit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td class="right">${Number(line.credit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              `),
            ).join('')}
          </tbody>
        </table>
      `).join('')}
      <div class="sign">
        <div class="sign-box">
          <div class="sign-title">Prepared By</div>
          <div class="sign-line"><span>${preparedBy}</span><span>${esc(preparedAt)}</span></div>
        </div>
        <div class="sign-box">
          <div class="sign-title">Approved By</div>
          <div class="sign-line"><span>Name: ____________________</span><span>Date: ____________________</span></div>
        </div>
      </div>
    </body></html>`

    if (mode === 'pdf') {
      toast('In the print dialog, choose Save as PDF')
    }

    if (!openPrintWindow(`Day Book ${dayBook.date_from} to ${dayBook.date_to}`, html)) {
      toast.error('Unable to open print preview')
    }
  }, [dayBook, filteredDays, filteredEntryCount, tenantLogo, tenantName, currentUser])

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
            <NepaliDatePicker value={dateFrom} onChange={v => { setDateFrom(v); setSubmitted(false) }} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
            <NepaliDatePicker value={dateTo} onChange={v => { setDateTo(v); setSubmitted(false) }} />
          </div>
          <button onClick={() => setSubmitted(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
            {(isLoading || isFetching) ? <Loader2 size={14} className="animate-spin" /> : <CalendarDays size={14} />}
            Load Day Book
          </button>
          <div className="relative min-w-[260px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input data-lpignore="true"
              value={entrySearch}
              onChange={e => setEntrySearch(e.target.value)}
              placeholder="Search entry #, description, account..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          {dayBook && !isLoading && filteredEntryCount > 0 && (
            expandedEntry.size === filteredEntryCount && filteredEntryCount > 0
              ? <button onClick={() => setExpandedEntry(new Set())}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <ChevronsDownUp size={14} /> Collapse All
                </button>
              : <button onClick={() => setExpandedEntry(new Set(flattenedEntries.map(e => e.key)))}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <ChevronsUpDown size={14} /> Expand All
                </button>
          )}
          {dayBook && !isLoading && (
            <>
              <button onClick={exportCsv}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                <FileSpreadsheet size={14} /> CSV
              </button>
              <button onClick={() => openPrintableReport('pdf')}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                <Download size={14} /> PDF
              </button>
              <button onClick={() => openPrintableReport('print')}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                <Printer size={14} /> Print
              </button>
            </>
          )}
        </div>
      </div>

      {submitted && (isLoading || isFetching) && <div className="flex justify-center py-10"><Loader2 size={28} className="animate-spin text-indigo-400" /></div>}

      {dayBook && !isLoading && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <p className="text-xs text-gray-500 font-medium">Period</p>
              <p className="text-sm font-bold text-gray-800 mt-0.5">{fmt(dayBook.date_from)} to {fmt(dayBook.date_to)}</p>
            </div>
            <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-4">
              <p className="text-xs text-emerald-700 font-medium">Total Debit</p>
              <p className="text-base font-bold text-emerald-800 mt-0.5">{npr(dayBook.total_debit)}</p>
            </div>
            <div className="bg-red-50 rounded-xl border border-red-100 p-4">
              <p className="text-xs text-red-700 font-medium">Total Credit</p>
              <p className="text-base font-bold text-red-800 mt-0.5">{npr(dayBook.total_credit)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <p className="text-xs text-gray-500 font-medium">Entries</p>
              <p className="text-base font-bold text-gray-800 mt-0.5">{filteredEntryCount}</p>
            </div>
          </div>

          {filteredEntryCount === 0 ? (
            <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
              <CalendarDays size={36} className="mx-auto text-gray-300 mb-3" />
              <p className="text-sm text-gray-500 font-medium">{(dayBook.entry_count ?? 0) === 0 ? `No journal entries from ${fmt(dayBook.date_from)} to ${fmt(dayBook.date_to)}` : 'No journal entries match your search'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredDays.map(day => (
                <div key={day.date} className="space-y-2">
                  <div className="px-1 pt-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">{fmt(day.date)}</div>
                  {(day.entries ?? []).map(entry => {
                    const entryKey = `${day.date}::${entry.entry_number}`
                    return (
                      <div key={entryKey} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <button className="w-full px-5 py-4 text-left flex items-center gap-4 hover:bg-gray-50 transition-colors"
                          onClick={() => setExpandedEntry(s => { const n = new Set(s); n.has(entryKey) ? n.delete(entryKey) : n.add(entryKey); return n })}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs text-gray-500">{entry.entry_number}</span>
                              {entry.reference_type && (
                                <span className="bg-indigo-50 text-indigo-600 text-[11px] px-1.5 py-0.5 rounded font-medium">{entry.reference_type}</span>
                              )}
                              <span className="text-sm font-medium text-gray-800 truncate">{entry.description || 'No description'}</span>
                            </div>
                          </div>
                          <div className="shrink-0 text-right hidden sm:block">
                            <span className="text-xs text-gray-500">Dr: </span>
                            <span className="text-xs font-semibold text-emerald-700">{npr(entry.total_debit)}</span>
                            <span className="text-xs text-gray-400 mx-1">·</span>
                            <span className="text-xs text-gray-500">Cr: </span>
                            <span className="text-xs font-semibold text-red-600">{npr(entry.total_credit)}</span>
                          </div>
                          <ChevronDown size={15} className={`shrink-0 text-gray-400 transition-transform ${expandedEntry.has(entryKey) ? '' : '-rotate-90'}`} />
                        </button>
                        {expandedEntry.has(entryKey) && (
                          <div className="border-t border-gray-100">
                            <table className="w-full text-xs">
                              <thead className="bg-gray-50">
                                <tr>
                                  {['Account', 'Description', 'Debit', 'Credit'].map(h => (
                                    <th key={h} className="px-4 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                {entry.lines.map((l, i) => (
                                  <tr key={i} className="hover:bg-gray-50">
                                    <td className="px-4 py-2 font-mono">{l.account_code} <span className="text-gray-500 font-sans">{l.account_name}</span></td>
                                    <td className="px-4 py-2 text-gray-500">{l.description || '—'}</td>
                                    <td className="px-4 py-2 text-emerald-700 font-medium text-right">{Number(l.debit) > 0 ? npr(l.debit) : '—'}</td>
                                    <td className="px-4 py-2 text-red-600 font-medium text-right">{Number(l.credit) > 0 ? npr(l.credit) : '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
''