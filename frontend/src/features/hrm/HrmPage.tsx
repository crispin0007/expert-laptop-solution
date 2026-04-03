/**
 * HrmPage — HR Management shell.
 *
 * Tab routing uses the `?tab=` query param so that tabs are directly linkable.
 * Default tab: "directory" (Staff Directory).
 * All users with can_view_hrm see both tabs (staff see limited data within each).
 */
import { useSearchParams } from 'react-router-dom'
import { Users, CalendarDays } from 'lucide-react'
import StaffDirectory from './tabs/StaffDirectory'
import LeaveTab from './tabs/LeaveTab'

type TabKey = 'directory' | 'leaves'

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'directory', label: 'Staff Directory', icon: <Users size={15} /> },
  { key: 'leaves',    label: 'Leaves',           icon: <CalendarDays size={15} /> },
]

export default function HrmPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = (searchParams.get('tab') as TabKey) ?? 'directory'

  function setTab(key: TabKey) {
    setSearchParams({ tab: key }, { replace: true })
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">HR Management</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage staff and leave requests</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 mb-6">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
              tab === t.key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'directory' && <StaffDirectory />}
      {tab === 'leaves' && <LeaveTab />}
    </div>
  )
}
