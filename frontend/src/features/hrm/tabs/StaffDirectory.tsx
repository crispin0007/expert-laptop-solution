/**
 * StaffDirectory — card grid of all staff members (managers) or own profile (staff).
 *
 * Manager+  → fetches STAFF.LIST (full list with availability)
 * Staff     → fetches HRM.PROFILES (own only) and shows a personal profile card
 *
 * Clicking a card opens a right-side drawer with:
 *   - designation, join date, staff number (HRM profile)
 *   - leave balances for the current BS year
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Building2, X, Search,
  ChevronRight, Loader2, AlertCircle,
} from 'lucide-react'
import apiClient from '../../../api/client'
import { STAFF, HRM } from '../../../api/endpoints'
import { usePermissions } from '../../../hooks/usePermissions'

// ── Types ─────────────────────────────────────────────────────────────────────

interface StaffMember {
  id: number
  full_name: string
  email: string
  role: string
  role_display: string
  department_name: string | null
  is_available: boolean
  open_tickets: number
  active_tasks: number
}

interface HrmProfile {
  id: number
  staff_name: string
  staff_email: string
  role: string
  staff_number: string | null
  designation: string
  department_name: string | null
  gender: string
}

interface LeaveBalance {
  id: number
  leave_type_name: string
  leave_type_code: string
  year: number
  allocated: string
  used: string
  available: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  owner:   'bg-purple-100 text-purple-700',
  admin:   'bg-indigo-100 text-indigo-700',
  manager: 'bg-blue-100 text-blue-700',
  staff:   'bg-gray-100 text-gray-600',
  viewer:  'bg-green-100 text-green-700',
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0].toUpperCase())
    .join('')
}

function currentBsYear(): number {
  // Approximate current BS year (AD year + 56 or 57 depending on month)
  const now = new Date()
  return now.getFullYear() + (now.getMonth() < 3 ? 56 : 57)
}

// ── Staff card ────────────────────────────────────────────────────────────────

function StaffCard({
  staff,
  onClick,
}: {
  staff: StaffMember
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="group w-full text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-indigo-300 hover:shadow-md transition-all duration-150"
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-bold shrink-0">
          {initials(staff.full_name || staff.email)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate leading-tight">
            {staff.full_name || staff.email}
          </p>
          <p className="text-xs text-gray-500 truncate mt-0.5">{staff.email}</p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${ROLE_COLORS[staff.role] ?? 'bg-gray-100 text-gray-600'}`}>
              {staff.role_display || staff.role}
            </span>
            {staff.department_name && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-gray-100 text-gray-500">
                <Building2 size={9} />
                {staff.department_name}
              </span>
            )}
          </div>
        </div>

        {/* Availability dot + chevron */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span
            className={`w-2.5 h-2.5 rounded-full mt-1 ${staff.is_available ? 'bg-green-400' : 'bg-gray-300'}`}
            title={staff.is_available ? 'Available' : 'Unavailable'}
          />
          <ChevronRight size={14} className="text-gray-300 group-hover:text-indigo-400 transition" />
        </div>
      </div>
    </button>
  )
}

// ── Profile drawer ────────────────────────────────────────────────────────────

function ProfileDrawer({
  staffId,
  staffName,
  email,
  onClose,
}: {
  staffId: number
  staffName: string
  email: string
  onClose: () => void
}) {
  const bsYear = currentBsYear()

  const { data: balances, isLoading: loadingBal } = useQuery({
    queryKey: ['hrm-balances', staffId, bsYear],
    queryFn: () =>
      apiClient.get(HRM.LEAVE_BALANCES, {
        params: { staff_id: staffId, year: bsYear },
      }).then(r => r.data.data ?? r.data.results ?? r.data ?? []),
    staleTime: 30_000,
  })

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-sm bg-white h-full shadow-2xl overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-bold">
              {initials(staffName || email)}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{staffName || email}</p>
              <p className="text-xs text-gray-500">{email}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Leave balances */}
        <div className="flex-1 px-5 py-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Leave Balances — BS {bsYear}
          </p>

          {loadingBal ? (
            <div className="flex items-center gap-2 text-xs text-gray-400 py-4">
              <Loader2 size={14} className="animate-spin" />
              Loading…
            </div>
          ) : !balances?.length ? (
            <p className="text-xs text-gray-400 py-4">No leave balances found for BS {bsYear}.</p>
          ) : (
            <div className="space-y-2">
              {(balances as LeaveBalance[]).map(b => {
                const pct = parseFloat(b.allocated) > 0
                  ? Math.min(100, (parseFloat(b.used) / parseFloat(b.allocated)) * 100)
                  : 0
                return (
                  <div key={b.id} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-700">{b.leave_type_name}</span>
                      <span className="text-xs text-gray-500">
                        <span className="font-semibold text-indigo-600">{b.available}</span>/{b.allocated} days left
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${pct >= 90 ? 'bg-red-400' : pct >= 60 ? 'bg-yellow-400' : 'bg-green-400'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                      <span>Used: {b.used}</span>
                      <span>Allocated: {b.allocated}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function StaffDirectory() {
  const perms = usePermissions()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<StaffMember | null>(null)

  // Managers fetch the full staff list; others just get own profile via HRM
  const { data: staffList, isLoading, isError } = useQuery({
    queryKey: ['staff-list-hrm', search],
    queryFn: () =>
      apiClient.get(STAFF.LIST, {
        params: search ? { search, page_size: 100 } : { page_size: 100 },
      }).then(r => {
        const raw = r.data.data ?? r.data.results ?? r.data
        return Array.isArray(raw) ? raw : raw?.results ?? []
      }),
    staleTime: 30_000,
    enabled: perms.isManager,
  })

  // For non-managers, only show own profile from HRM
  const { data: ownProfiles } = useQuery({
    queryKey: ['hrm-own-profile'],
    queryFn: () =>
      apiClient.get(HRM.PROFILES).then(r => r.data.data ?? r.data.results ?? r.data ?? []),
    staleTime: 30_000,
    enabled: !perms.isManager,
  })

  const displayList: StaffMember[] = perms.isManager
    ? (staffList ?? [])
    : (ownProfiles ?? []).map((p: HrmProfile) => ({
        id: p.id,
        full_name: p.staff_name,
        email: p.staff_email,
        role: p.role,
        role_display: p.role,
        department_name: p.department_name,
        is_available: true,
        open_tickets: 0,
        active_tasks: 0,
      }))

  const filtered = search
    ? displayList.filter(s =>
        s.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        s.email?.toLowerCase().includes(search.toLowerCase()) ||
        s.department_name?.toLowerCase().includes(search.toLowerCase()),
      )
    : displayList

  return (
    <div>
      {/* Search */}
      {perms.isManager && (
        <div className="relative mb-5 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, email, department…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-8">
          <Loader2 size={16} className="animate-spin" />
          Loading staff directory…
        </div>
      ) : isError ? (
        <div className="flex items-center gap-2 text-sm text-red-500 py-8">
          <AlertCircle size={16} />
          Failed to load staff list.
        </div>
      ) : !filtered.length ? (
        <div className="py-8 text-sm text-gray-400">
          {search ? 'No staff match your search.' : 'No staff members found.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map(s => (
            <StaffCard key={s.id} staff={s} onClick={() => setSelected(s)} />
          ))}
        </div>
      )}

      {/* Profile drawer */}
      {selected && (
        <ProfileDrawer
          staffId={selected.id}
          staffName={selected.full_name}
          email={selected.email}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Count */}
      {filtered.length > 0 && (
        <p className="mt-4 text-xs text-gray-400">{filtered.length} staff member{filtered.length !== 1 ? 's' : ''}</p>
      )}
    </div>
  )
}
