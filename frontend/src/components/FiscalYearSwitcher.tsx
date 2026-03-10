import { useRef, useState, useEffect } from 'react'
import { CalendarDays, ChevronDown } from 'lucide-react'
import { useFyStore } from '../store/fyStore'
import { currentFiscalYear, fiscalYearDateRange, fiscalYearOf } from '../utils/nepaliDate'

export default function FiscalYearSwitcher() {
  const { fyYear, setFyYear } = useFyStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Build 3 most recent fiscal years
  const fy = currentFiscalYear()
  const { startAd } = fiscalYearDateRange(fy)
  const lastFy = fiscalYearOf(new Date(startAd.getTime() - 86_400_000))
  const { startAd: lastStart } = fiscalYearDateRange(lastFy)
  const prevFy = fiscalYearOf(new Date(lastStart.getTime() - 86_400_000))

  const options = [
    { year: fy.bsYear,     label: fy.label     },
    { year: lastFy.bsYear, label: lastFy.label  },
    { year: prevFy.bsYear, label: prevFy.label  },
  ]

  const currentLabel = fyYear === null
    ? 'All Time'
    : (options.find(o => o.year === fyYear)?.label ?? `FY ${fyYear}/${fyYear + 1}`)

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
          fyYear !== null
            ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:text-gray-800'
        }`}
        title="Switch fiscal year filter"
      >
        <CalendarDays size={13} />
        <span className="hidden sm:inline">FY </span>
        {currentLabel}
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-44 bg-white border border-gray-100 rounded-xl shadow-xl z-50 py-1.5 overflow-hidden">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-3 pt-1 pb-2">
            Nepal Fiscal Year
          </p>

          {/* All Time */}
          <button
            onClick={() => { setFyYear(null); setOpen(false) }}
            className={`w-full text-left px-3 py-2 text-sm font-medium transition-colors ${
              fyYear === null
                ? 'bg-gray-100 text-gray-800'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            All Time
          </button>

          <div className="border-t border-gray-100 my-1" />

          {options.map(({ year, label }) => (
            <button
              key={year}
              onClick={() => { setFyYear(year); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-sm font-medium flex items-center justify-between transition-colors ${
                fyYear === year
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span>{label}</span>
              {fyYear === year && (
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
