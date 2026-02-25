import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import apiClient from '../../api/client'
import { PROJECTS, CUSTOMERS, STAFF } from '../../api/endpoints'
import toast from 'react-hot-toast'
import { Plus, X } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'

interface Project { id: number; project_number: string; name: string; status: string; manager?: number | null; customer: number | null; customer_name: string; start_date: string | null; end_date: string | null }
interface Customer { id: number; name: string }
interface StaffMember { id: number; full_name: string }

const STATUS_COLORS: Record<string, string> = {
  planning: 'bg-gray-100 text-gray-600',
  active: 'bg-emerald-100 text-emerald-700',
  on_hold: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-600',
}

const BLANK_FORM = {
  name: '',
  description: '',
  status: 'planning',
  customer: '',
  manager: '',
  start_date: '',
  end_date: '',
}

export default function ProjectListPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const currentUser = useAuthStore((s) => s.user)
  const [urlParams] = useSearchParams()
  const assignedToMe = urlParams.get('assigned') === 'me'
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(BLANK_FORM)

  const { data: rawProjects = [], isLoading } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => apiClient.get(PROJECTS.LIST).then(r =>
      Array.isArray(r.data) ? r.data : r.data.results ?? []
    ),
  })

  const projects = useMemo(() => {
    if (!assignedToMe || !currentUser) return rawProjects
    return rawProjects.filter(p => p.manager === currentUser.id)
  }, [rawProjects, assignedToMe, currentUser])

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['customers-simple'],
    queryFn: () => apiClient.get(CUSTOMERS.LIST).then(r =>
      Array.isArray(r.data) ? r.data : r.data.results ?? []
    ),
    enabled: showCreate,
  })

  const { data: staffList = [] } = useQuery<StaffMember[]>({
    queryKey: ['staff-list'],
    queryFn: () => apiClient.get(STAFF.LIST).then(r =>
      Array.isArray(r.data) ? r.data : r.data.results ?? []
    ),
    enabled: showCreate,
  })

  const createMutation = useMutation({
    mutationFn: () => apiClient.post(PROJECTS.LIST, {
      name: form.name,
      description: form.description || undefined,
      status: form.status,
      customer: form.customer ? Number(form.customer) : null,
      manager: form.manager ? Number(form.manager) : null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      setShowCreate(false)
      setForm(BLANK_FORM)
      toast.success('Project created')
    },
    onError: () => toast.error('Failed to create project'),
  })

  const field = (key: keyof typeof BLANK_FORM) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [key]: e.target.value })),
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            {assignedToMe ? 'My Projects' : 'Projects'}
          </h1>
          {assignedToMe && (
            <p className="text-xs text-gray-400 mt-0.5">Showing projects where you are the manager</p>
          )}
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
        >
          <Plus size={16} /> New Project
        </button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold">New Project</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              {/* Name */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Project name *</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. Website Redesign"
                  {...field('name')}
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Description</label>
                <textarea
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  placeholder="Brief description…"
                  {...field('description')}
                />
              </div>

              {/* Status + Customer */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Status</label>
                  <select
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    {...field('status')}
                  >
                    <option value="planning">Planning</option>
                    <option value="active">Active</option>
                    <option value="on_hold">On Hold</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Customer</label>
                  <select
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    {...field('customer')}
                  >
                    <option value="">— None —</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Manager */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Manager</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  {...field('manager')}
                >
                  <option value="">— Unassigned —</option>
                  {staffList.map(s => (
                    <option key={s.id} value={s.id}>{s.full_name}</option>
                  ))}
                </select>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Start date</label>
                  <input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" {...field('start_date')} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">End date</label>
                  <input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" {...field('end_date')} />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => createMutation.mutate()}
                disabled={!form.name || createMutation.isPending}
                className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition"
              >
                {createMutation.isPending ? 'Creating…' : 'Create Project'}
              </button>
              <button onClick={() => setShowCreate(false)} className="flex-1 border border-gray-300 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : projects.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No projects yet</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3 text-left whitespace-nowrap">ID</th>
                <th className="px-5 py-3 text-left whitespace-nowrap">Name</th>
                <th className="px-5 py-3 text-left whitespace-nowrap">Customer</th>
                <th className="px-5 py-3 text-left whitespace-nowrap">Status</th>
                <th className="px-5 py-3 text-left whitespace-nowrap">Start</th>
                <th className="px-5 py-3 text-left whitespace-nowrap">End</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {projects.map(p => (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/projects/${p.id}`)}
                  className="hover:bg-indigo-50 transition cursor-pointer"
                >
                  <td className="px-5 py-3.5">
                    <span className="text-xs font-mono font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                      {p.project_number || '—'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 font-medium text-gray-800 whitespace-nowrap">{p.name}</td>
                  <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">{(p as any).customer_name || '—'}</td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_COLORS[p.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {p.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">{p.start_date ?? '—'}</td>
                  <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">{p.end_date ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  )
}
