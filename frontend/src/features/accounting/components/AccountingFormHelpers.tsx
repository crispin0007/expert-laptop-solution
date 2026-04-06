import type { ReactNode } from 'react'

export const accountingInputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
export const accountingSelectCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500'
export const accountingTextAreaCls = `${accountingInputCls} resize-none`

interface AccountingFieldProps {
  label: string
  children: ReactNode
  hint?: string
}

export function AccountingField({ label, children, hint }: AccountingFieldProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}
