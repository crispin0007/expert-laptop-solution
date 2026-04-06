import { Loader2, AlertCircle, X } from 'lucide-react'
import { STATUS_COLORS } from '../utils'

export function Badge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

export function Spinner() {
  return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-indigo-500" size={28} /></div>
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <AlertCircle size={32} className="mb-2" />
      <p className="text-sm">{message}</p>
    </div>
  )
}

export function SectionCard({
  title,
  actions,
  children,
  className,
}: {
  title?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm ${className ?? ''}`}>
      {(title || actions) && (
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
          {title ? <h3 className="text-sm font-semibold text-gray-800">{title}</h3> : null}
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      )}
      {children}
    </div>
  )
}

export function StatsGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-3 gap-4">{children}</div>
}

export const tableClass = 'min-w-full text-sm divide-y divide-gray-100'
export const tableHeadClass = 'bg-gray-50 border-b border-gray-100'
export const tableHeaderCellClass = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500'
export const tableCellClass = 'px-4 py-3 text-sm text-gray-600'
export const tableNumericCellClass = 'px-4 py-3 text-sm text-gray-600 tabular-nums'

export function TableContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={`${tableClass} ${className ?? ''}`.trim()}>{children}</table>
    </div>
  )
}

export function DetailGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>
}

export function StatCard({
  label,
  value,
  icon: Icon,
  bg = 'bg-gray-50',
  color = 'text-gray-600',
}: {
  label: string
  value: string | number
  icon: React.ElementType
  bg?: string
  color?: string
}) {
  return (
    <div className={`${bg} rounded-xl p-4 flex items-center gap-3 border border-white`}>
      <Icon size={20} className={color} />
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className={`text-lg font-bold ${color}`}>{value}</p>
      </div>
    </div>
  )
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-[28px] shadow-2xl w-full max-w-3xl mx-auto max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  )
}

export const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
export const selectCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500'
