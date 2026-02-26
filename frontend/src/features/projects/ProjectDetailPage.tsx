import { useState, useEffect, useRef, useCallback, useDeferredValue } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  ArrowLeft, CheckCircle2, Circle, Plus, Trash2, Loader2, LayoutGrid,
  Package, User, Calendar, Flag, X, Paperclip, Download, FileText, Users,
  List, Clock, AlertTriangle, Edit3,
  Phone, BarChart2, Timer, GripVertical, TrendingUp,
  ShoppingCart, CheckCheck, XCircle, ChevronDown, ChevronUp,
} from 'lucide-react'
import apiClient from '../../api/client'
import { PROJECTS, STAFF, INVENTORY } from '../../api/endpoints'
import { useAuthStore, isManager } from '../../store/authStore'
import Modal from '../../components/Modal'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Project {
  id: number
  project_number: string
  name: string
  description: string
  status: string
  budget?: string | null
  customer: number | null
  customer_name: string
  manager: number | null
  manager_name: string
  team_members: number[]
  team_member_names: string[]
  contact_phone: string
  start_date: string | null
  end_date: string | null
  tasks_count: number
  done_tasks_count: number
}

interface Task {
  id: number
  title: string
  description: string
  status: string
  priority: string
  assigned_to: number | null
  assigned_to_name: string
  due_date: string | null
  estimated_hours: string | null
  actual_hours: string | null
  milestone: number | null
  completed_at: string | null
}

interface Milestone {
  id: number
  name: string
  due_date: string | null
  is_completed: boolean
}

interface ProjectProduct {
  id: number
  product: number
  product_name: string
  quantity_planned: number
  note: string
}

interface Product {
  id: number
  name: string
  sku: string
  unit_price: string
  is_service: boolean
}

interface StaffMember {
  id: number
  full_name: string
  email: string
}

interface ProductRequest {
  id: number
  product: number
  product_name: string
  product_sku: string
  quantity: number
  note: string
  status: 'pending' | 'approved' | 'rejected'
  requested_by: number | null
  requested_by_name: string | null
  reviewed_by_name: string | null
  reviewed_at: string | null
  rejection_reason: string
  created_at: string
}

interface ProjectAttachment {
  id: number
  file_name: string
  file_size: number
  url: string
  uploaded_by_name: string
  created_at: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const KANBAN_COLS = [
  { key: 'todo',        label: 'To Do',       color: 'border-gray-300',   bg: 'bg-gray-50',    dot: 'bg-gray-400'   },
  { key: 'in_progress', label: 'In Progress',  color: 'border-blue-300',   bg: 'bg-blue-50',    dot: 'bg-blue-500'   },
  { key: 'done',        label: 'Done',         color: 'border-emerald-300',bg: 'bg-emerald-50', dot: 'bg-emerald-500'},
]

const PRIORITY_CFG: Record<string, { label: string; cls: string; dot: string }> = {
  low:    { label: 'Low',    cls: 'bg-gray-100 text-gray-500',   dot: 'bg-gray-400'   },
  medium: { label: 'Medium', cls: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-400' },
  high:   { label: 'High',   cls: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  urgent: { label: 'Urgent', cls: 'bg-red-100 text-red-700',     dot: 'bg-red-500'    },
}

const PROJECT_STATUS_OPTIONS = ['planning', 'active', 'on_hold', 'completed', 'cancelled']
const PROJECT_STATUS_COLORS: Record<string, string> = {
  planning:  'bg-gray-100 text-gray-600',
  active:    'bg-emerald-100 text-emerald-700',
  on_hold:   'bg-yellow-100 text-yellow-700',
  completed: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-600',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isOverdue(task: Task) {
  if (!task.due_date || task.status === 'done') return false
  return new Date(task.due_date) < new Date(new Date().toDateString())
}

function initials(name: string) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

function fmtHours(h: string | null | undefined) {
  if (!h) return null
  const n = parseFloat(h)
  if (isNaN(n)) return null
  return n === 1 ? '1h' : `${n}h`
}

const AVATAR_COLORS = [
  'bg-indigo-500','bg-purple-500','bg-pink-500','bg-rose-500',
  'bg-orange-500','bg-amber-500','bg-teal-500','bg-cyan-500',
]
function avatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h += name.charCodeAt(i)
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PriorityDot({ priority }: { priority: string }) {
  const cfg = PRIORITY_CFG[priority] ?? PRIORITY_CFG.medium
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${cfg.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

function Avatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'xs' }) {
  const dim = size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-5 h-5 text-[9px]'
  return (
    <span className={`${dim} ${avatarColor(name)} rounded-full inline-flex items-center justify-center text-white font-bold shrink-0`}>
      {initials(name)}
    </span>
  )
}

// ── Task Card (Kanban) ────────────────────────────────────────────────────────

interface TaskCardProps {
  task: Task
  onDragStart: (e: React.DragEvent, taskId: number) => void
  onClick: (task: Task) => void
  onDelete?: () => void
  canManage: boolean
}

function TaskCard({ task, onDragStart, onClick, onDelete, canManage }: TaskCardProps) {
  const overdue = isOverdue(task)
  const estH = fmtHours(task.estimated_hours)
  const actH = fmtHours(task.actual_hours)

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, task.id)}
      onClick={() => onClick(task)}
      className={`
        bg-white rounded-xl border shadow-sm p-3 cursor-pointer group
        hover:shadow-md hover:border-indigo-200 transition-all duration-150 active:opacity-70
        ${overdue ? 'border-red-200' : 'border-gray-100'}
      `}
    >
      {/* Top row: priority + drag handle */}
      <div className="flex items-center justify-between mb-2">
        <PriorityDot priority={task.priority} />
        <GripVertical size={13} className="text-gray-300 group-hover:text-gray-400 cursor-grab" />
      </div>

      {/* Title */}
      <p className={`text-sm font-medium leading-snug mb-2 ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
        {task.title}
      </p>

      {/* Description snippet */}
      {task.description && (
        <p className="text-xs text-gray-400 mb-2 line-clamp-2 leading-relaxed">{task.description}</p>
      )}

      {/* Bottom row: assignee + due + hours */}
      <div className="flex items-center justify-between gap-2 mt-1">
        <div className="flex items-center gap-1.5">
          {task.assigned_to_name && (
            <Avatar name={task.assigned_to_name} size="xs" />
          )}
          {task.due_date && (
            <span className={`flex items-center gap-0.5 text-[10px] font-medium ${overdue ? 'text-red-500' : 'text-gray-400'}`}>
              {overdue && <AlertTriangle size={9} />}
              <Calendar size={9} />
              {task.due_date}
            </span>
          )}
        </div>
        {(estH || actH) && (
          <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
            <Clock size={9} />
            {actH ? `${actH}/${estH ?? '?'}` : estH}
          </span>
        )}
      </div>

      {/* Delete (manager only, hover) */}
      {canManage && onDelete && (
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition"
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  )
}

// ── Task Detail / Edit Modal ──────────────────────────────────────────────────

interface TaskDetailModalProps {
  task: Task
  staffList: StaffMember[]
  milestones: Milestone[]
  projectId: number
  canManage: boolean
  onClose: () => void
  onSaved: () => void
}

function TaskDetailModal({ task, staffList, milestones, projectId, canManage, onClose, onSaved }: TaskDetailModalProps) {
  const [form, setForm] = useState({
    title: task.title,
    description: task.description ?? '',
    priority: task.priority,
    status: task.status,
    assigned_to: task.assigned_to ? String(task.assigned_to) : '',
    due_date: task.due_date ?? '',
    estimated_hours: task.estimated_hours ?? '',
    actual_hours: task.actual_hours ?? '',
    milestone: task.milestone ? String(task.milestone) : '',
  })

  const updateMutation = useMutation({
    mutationFn: () => apiClient.patch(PROJECTS.TASK_DETAIL(projectId, task.id), {
      ...form,
      assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
      due_date: form.due_date || null,
      estimated_hours: form.estimated_hours || null,
      actual_hours: form.actual_hours || null,
      milestone: form.milestone ? Number(form.milestone) : null,
    }),
    onSuccess: () => { toast.success('Task updated'); onSaved(); onClose() },
    onError: () => toast.error('Failed to update task'),
  })

  const f = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [key]: e.target.value }))

  return (
    <Modal open title={task.title} onClose={onClose} width="max-w-lg">
      <div className="space-y-4 p-1">
        {/* Title */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
          <input
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={form.title}
            onChange={f('title')}
            disabled={!canManage}
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
          <textarea
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            placeholder="Add details, instructions or context…"
            value={form.description}
            onChange={f('description')}
            disabled={!canManage}
          />
        </div>

        {/* Status + Priority */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={form.status}
              onChange={f('status')}
              disabled={!canManage}
            >
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Done</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={form.priority}
              onChange={f('priority')}
              disabled={!canManage}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>

        {/* Assignee + Milestone */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Assignee</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={form.assigned_to}
              onChange={f('assigned_to')}
              disabled={!canManage}
            >
              <option value="">Unassigned</option>
              {staffList.map(s => (
                <option key={s.id} value={s.id}>{s.full_name || s.email}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Milestone</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={form.milestone}
              onChange={f('milestone')}
              disabled={!canManage}
            >
              <option value="">None</option>
              {milestones.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Due date */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Due Date</label>
          <input
            type="date"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={form.due_date}
            onChange={f('due_date')}
            disabled={!canManage}
          />
        </div>

        {/* Hours */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
              <Timer size={11} /> Estimated Hours
            </label>
            <input
              type="number"
              min="0"
              step="0.5"
              placeholder="e.g. 4"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={form.estimated_hours}
              onChange={f('estimated_hours')}
              disabled={!canManage}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
              <Clock size={11} /> Actual Hours
            </label>
            <input
              type="number"
              min="0"
              step="0.5"
              placeholder="e.g. 3.5"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={form.actual_hours}
              onChange={f('actual_hours')}
            />
          </div>
        </div>

        {/* Actions */}
        {canManage && (
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <button
              onClick={() => updateMutation.mutate()}
              disabled={!form.title || updateMutation.isPending}
              className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50 transition font-medium"
            >
              {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
            </button>
            <button
              onClick={onClose}
              className="px-4 border border-gray-300 rounded-lg text-gray-500 hover:bg-gray-50 text-sm"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ── Product Search Input ──────────────────────────────────────────────────────

function ProductSearchInput({ onSelect }: { onSelect: (p: Product) => void }) {
  const [search, setSearch] = useState('')
  const deferred = useDeferredValue(search)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const { data: results = [], isFetching } = useQuery<Product[]>({
    queryKey: ['product-search-proj', deferred],
    queryFn: () =>
      apiClient.get(INVENTORY.PRODUCTS, { params: { search: deferred, page_size: 20 } })
        .then(r => Array.isArray(r.data) ? r.data : (r.data.results ?? [])),
    enabled: deferred.length > 0,
    staleTime: 10_000,
  })

  return (
    <div className="relative" ref={ref}>
      <input
        type="text"
        placeholder="Search products…"
        value={search}
        onChange={e => { setSearch(e.target.value); setOpen(true) }}
        onFocus={() => search && setOpen(true)}
        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      {open && deferred.length > 0 && (
        <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 overflow-auto">
          {isFetching ? (
            <div className="px-3 py-2 text-xs text-gray-400 flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin" /> Searching…
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">No products found</div>
          ) : results.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => { onSelect(p); setSearch(''); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 flex justify-between"
            >
              <span className="font-medium text-gray-800">{p.name}</span>
              <span className="text-xs text-gray-400">
                {p.is_service ? 'Service' : `Rs. ${parseFloat(p.unit_price).toFixed(2)}`}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const projectId = Number(id)
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const canManage = isManager(user)

  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [newTask, setNewTask] = useState({
    title: '', priority: 'medium', assigned_to: '', due_date: '',
    description: '', estimated_hours: '',
  })
  const [showMilestoneForm, setShowMilestoneForm] = useState(false)
  const [newMilestone, setNewMilestone] = useState({ name: '', due_date: '' })
  const [editingTeam, setEditingTeam] = useState(false)
  const [selectedTeam, setSelectedTeam] = useState<number[]>([])
  const [editingPhone, setEditingPhone] = useState(false)
  const [phoneValue, setPhoneValue] = useState('')
  const [editingStatus, setEditingStatus] = useState(false)
  const [ppQty, setPpQty] = useState(1)
  const attachFileRef = useRef<HTMLInputElement>(null)
  const [uploadingAttach, setUploadingAttach] = useState(false)

  // Product request state
  const [showPRForm, setShowPRForm] = useState(false)
  const [prProduct, setPrProduct] = useState<Product | null>(null)
  const [prQty, setPrQty] = useState(1)
  const [prNote, setPrNote] = useState('')
  const [prRejectId, setPrRejectId] = useState<number | null>(null)
  const [prRejectReason, setPrRejectReason] = useState('')
  const [showPRSection, setShowPRSection] = useState(true)

  // Drag state
  const [dragTaskId, setDragTaskId] = useState<number | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)

  // ── Queries ─────────────────────────────────────────────────────────────────

  const { data: project, isLoading } = useQuery<Project>({
    queryKey: ['project', id],
    queryFn: () => apiClient.get(PROJECTS.DETAIL(projectId)).then(r => r.data),
    enabled: !!id,
  })

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ['project-tasks', id],
    queryFn: () => apiClient.get(PROJECTS.TASKS(projectId)).then(r =>
      Array.isArray(r.data) ? r.data : r.data.results ?? []
    ),
    enabled: !!id,
  })

  const { data: milestones = [] } = useQuery<Milestone[]>({
    queryKey: ['project-milestones', id],
    queryFn: () => apiClient.get(PROJECTS.MILESTONES(projectId)).then(r =>
      Array.isArray(r.data) ? r.data : r.data.results ?? []
    ),
    enabled: !!id,
  })

  const { data: projectProducts = [] } = useQuery<ProjectProduct[]>({
    queryKey: ['project-products', id],
    queryFn: () => apiClient.get(PROJECTS.PROJECT_PRODUCTS(projectId)).then(r =>
      Array.isArray(r.data) ? r.data : r.data.results ?? []
    ),
    enabled: !!id,
  })

  const { data: staffList = [] } = useQuery<StaffMember[]>({
    queryKey: ['staff-list'],
    queryFn: () => apiClient.get(STAFF.LIST).then(r =>
      Array.isArray(r.data) ? r.data : r.data.results ?? []
    ),
  })

  const { data: attachments = [] } = useQuery<ProjectAttachment[]>({
    queryKey: ['project-attachments', id],
    queryFn: () => apiClient.get(PROJECTS.ATTACHMENTS(projectId)).then(r =>
      Array.isArray(r.data) ? r.data : r.data.results ?? []
    ),
    enabled: !!id,
  })

  const { data: productRequests = [] } = useQuery<ProductRequest[]>({
    queryKey: ['project-product-requests', id],
    queryFn: () => apiClient.get(PROJECTS.PRODUCT_REQUESTS(projectId)).then(r =>
      Array.isArray(r.data) ? r.data : r.data.results ?? []
    ),
    enabled: !!id,
  })

  // ── Computed stats ───────────────────────────────────────────────────────────

  const todoTasks = tasks.filter(t => t.status === 'todo')
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress')
  const doneTasks = tasks.filter(t => t.status === 'done')
  const overdueTasks = tasks.filter(isOverdue)
  const progress = tasks.length > 0 ? Math.round((doneTasks.length / tasks.length) * 100) : 0

  const totalEst = tasks.reduce((s, t) => s + (parseFloat(t.estimated_hours ?? '0') || 0), 0)
  const totalAct = tasks.reduce((s, t) => s + (parseFloat(t.actual_hours ?? '0') || 0), 0)

  // ── Mutations ────────────────────────────────────────────────────────────────

  const changeProjectStatusMutation = useMutation({
    mutationFn: (status: string) => apiClient.patch(PROJECTS.DETAIL(projectId), { status }),
    onSuccess: () => { toast.success('Status updated'); setEditingStatus(false); qc.invalidateQueries({ queryKey: ['project', id] }) },
    onError: () => toast.error('Failed to update status'),
  })

  const createPRMutation = useMutation({
    mutationFn: () => apiClient.post(PROJECTS.PRODUCT_REQUESTS(projectId), {
      product: prProduct!.id,
      quantity: prQty,
      note: prNote,
    }),
    onSuccess: () => {
      toast.success('Product request submitted')
      setPrProduct(null); setPrQty(1); setPrNote(''); setShowPRForm(false)
      qc.invalidateQueries({ queryKey: ['project-product-requests', id] })
    },
    onError: () => toast.error('Failed to submit request'),
  })

  const approvePRMutation = useMutation({
    mutationFn: (reqId: number) => apiClient.post(PROJECTS.PRODUCT_REQUEST_APPROVE(projectId, reqId)),
    onSuccess: () => {
      toast.success('Request approved — added to materials')
      qc.invalidateQueries({ queryKey: ['project-product-requests', id] })
      qc.invalidateQueries({ queryKey: ['project-products', id] })
    },
    onError: () => toast.error('Failed to approve'),
  })

  const rejectPRMutation = useMutation({
    mutationFn: ({ reqId, reason }: { reqId: number; reason: string }) =>
      apiClient.post(PROJECTS.PRODUCT_REQUEST_REJECT(projectId, reqId), { reason }),
    onSuccess: () => {
      toast.success('Request rejected')
      setPrRejectId(null); setPrRejectReason('')
      qc.invalidateQueries({ queryKey: ['project-product-requests', id] })
    },
    onError: () => toast.error('Failed to reject'),
  })

  const changeTaskStatusMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: number; status: string }) =>
      apiClient.patch(PROJECTS.TASK_DETAIL(projectId, taskId), { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-tasks', id] })
      qc.invalidateQueries({ queryKey: ['project', id] })
    },
    onError: () => toast.error('Failed to update task'),
  })

  const createTaskMutation = useMutation({
    mutationFn: () => apiClient.post(PROJECTS.TASKS(projectId), {
      title: newTask.title,
      description: newTask.description || '',
      priority: newTask.priority,
      assigned_to: newTask.assigned_to ? Number(newTask.assigned_to) : null,
      due_date: newTask.due_date || null,
      estimated_hours: newTask.estimated_hours || null,
    }),
    onSuccess: () => {
      toast.success('Task created')
      setNewTask({ title: '', priority: 'medium', assigned_to: '', due_date: '', description: '', estimated_hours: '' })
      setShowTaskForm(false)
      qc.invalidateQueries({ queryKey: ['project-tasks', id] })
      qc.invalidateQueries({ queryKey: ['project', id] })
    },
    onError: () => toast.error('Failed to create task'),
  })

  const deleteTaskMutation = useMutation({
    mutationFn: (taskId: number) => apiClient.delete(PROJECTS.TASK_DETAIL(projectId, taskId)),
    onSuccess: () => {
      toast.success('Task deleted')
      qc.invalidateQueries({ queryKey: ['project-tasks', id] })
      qc.invalidateQueries({ queryKey: ['project', id] })
    },
    onError: () => toast.error('Failed to delete task'),
  })

  const createMilestoneMutation = useMutation({
    mutationFn: () => apiClient.post(PROJECTS.MILESTONES(projectId), {
      name: newMilestone.name, due_date: newMilestone.due_date || null,
    }),
    onSuccess: () => {
      toast.success('Milestone created')
      setNewMilestone({ name: '', due_date: '' })
      setShowMilestoneForm(false)
      qc.invalidateQueries({ queryKey: ['project-milestones', id] })
    },
    onError: () => toast.error('Failed to create milestone'),
  })

  const toggleMilestoneMutation = useMutation({
    mutationFn: (milestoneId: number) => apiClient.post(PROJECTS.MILESTONE_TOGGLE(projectId, milestoneId)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-milestones', id] }),
    onError: () => toast.error('Failed to toggle milestone'),
  })

  const deleteMilestoneMutation = useMutation({
    mutationFn: (milestoneId: number) => apiClient.delete(PROJECTS.MILESTONE_DETAIL(projectId, milestoneId)),
    onSuccess: () => { toast.success('Milestone deleted'); qc.invalidateQueries({ queryKey: ['project-milestones', id] }) },
    onError: () => toast.error('Failed to delete milestone'),
  })

  const updateTeamMutation = useMutation({
    mutationFn: (teamIds: number[]) => apiClient.patch(PROJECTS.DETAIL(projectId), { team_members: teamIds }),
    onSuccess: () => { toast.success('Team updated'); setEditingTeam(false); qc.invalidateQueries({ queryKey: ['project', id] }) },
    onError: () => toast.error('Failed to update team'),
  })

  const savePhoneMutation = useMutation({
    mutationFn: (phone: string) => apiClient.patch(PROJECTS.DETAIL(projectId), { contact_phone: phone }),
    onSuccess: () => { toast.success('Phone saved'); setEditingPhone(false); qc.invalidateQueries({ queryKey: ['project', id] }) },
    onError: () => toast.error('Failed to save phone'),
  })

  const addProductMutation = useMutation({
    mutationFn: (product: Product) => apiClient.post(PROJECTS.PROJECT_PRODUCTS(projectId), {
      product: product.id, quantity_planned: ppQty,
    }),
    onSuccess: () => { toast.success('Product added'); setPpQty(1); qc.invalidateQueries({ queryKey: ['project-products', id] }) },
    onError: (err: any) => toast.error(err?.response?.data?.non_field_errors?.[0] ?? 'Failed to add product'),
  })

  const removeProductMutation = useMutation({
    mutationFn: (ppId: number) => apiClient.delete(PROJECTS.PROJECT_PRODUCT_DETAIL(projectId, ppId)),
    onSuccess: () => { toast.success('Product removed'); qc.invalidateQueries({ queryKey: ['project-products', id] }) },
    onError: () => toast.error('Failed to remove product'),
  })

  // ── Attachment handlers ──────────────────────────────────────────────────────

  async function handleAttachmentUpload(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploadingAttach(true)
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.append('file', file)
        await apiClient.post(PROJECTS.ATTACHMENTS(projectId), fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }
      toast.success('File(s) uploaded')
      qc.invalidateQueries({ queryKey: ['project-attachments', id] })
    } catch {
      toast.error('Upload failed')
    } finally {
      setUploadingAttach(false)
      if (attachFileRef.current) attachFileRef.current.value = ''
    }
  }

  async function deleteAttachment(attachId: number) {
    await apiClient.delete(PROJECTS.ATTACHMENT_DETAIL(projectId, attachId))
    qc.invalidateQueries({ queryKey: ['project-attachments', id] })
    toast.success('Removed')
  }

  // ── Drag handlers ────────────────────────────────────────────────────────────

  const handleDragStart = useCallback((e: React.DragEvent, taskId: number) => {
    e.dataTransfer.setData('taskId', String(taskId))
    setDragTaskId(taskId)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, colKey: string) => {
    e.preventDefault()
    setDragOverCol(colKey)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, colKey: string) => {
    e.preventDefault()
    const taskId = Number(e.dataTransfer.getData('taskId'))
    if (taskId) {
      const task = tasks.find(t => t.id === taskId)
      if (task && task.status !== colKey) {
        changeTaskStatusMutation.mutate({ taskId, status: colKey })
      }
    }
    setDragTaskId(null)
    setDragOverCol(null)
  }, [tasks, changeTaskStatusMutation])

  const handleDragEnd = useCallback(() => {
    setDragTaskId(null)
    setDragOverCol(null)
  }, [])

  // ── Render guards ────────────────────────────────────────────────────────────

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-indigo-400" size={28} />
    </div>
  )
  if (!project) return <div className="text-red-500 text-sm p-8">Project not found</div>

  const milestonesDone = milestones.filter(m => m.is_completed).length
  const milestoneProgress = milestones.length > 0 ? Math.round((milestonesDone / milestones.length) * 100) : 0

  // ── Main render ──────────────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl space-y-5">
      {/* Back link */}
      <Link to="/projects" className="flex items-center gap-1 text-sm text-indigo-500 hover:text-indigo-700 font-medium">
        <ArrowLeft size={15} /> Back to Projects
      </Link>

      {/* ── Project Header ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-xs font-mono font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                {project.project_number}
              </span>
              {/* Inline status selector for managers */}
              {canManage && editingStatus ? (
                <div className="flex items-center gap-1">
                  <select
                    autoFocus
                    value={project.status}
                    onChange={e => changeProjectStatusMutation.mutate(e.target.value)}
                    onBlur={() => setEditingStatus(false)}
                    className="border border-gray-300 rounded-lg px-2 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {PROJECT_STATUS_OPTIONS.map(s => (
                      <option key={s} value={s}>{s.replace('_', ' ')}</option>
                    ))}
                  </select>
                  {changeProjectStatusMutation.isPending && <Loader2 size={12} className="animate-spin text-indigo-400" />}
                </div>
              ) : (
                <button
                  onClick={() => canManage && setEditingStatus(true)}
                  className={`px-2 py-0.5 text-xs font-medium rounded-full capitalize ${PROJECT_STATUS_COLORS[project.status] ?? 'bg-gray-100 text-gray-600'} ${canManage ? 'cursor-pointer hover:opacity-80 transition' : ''}`}
                  title={canManage ? 'Click to change status' : undefined}
                >
                  {project.status.replace('_', ' ')}
                </button>
              )}
            </div>

            <h1 className="text-xl font-bold text-gray-900 mb-1 truncate">{project.name}</h1>
            {project.description && (
              <p className="text-sm text-gray-500 mb-3 leading-relaxed">{project.description}</p>
            )}

            {/* Meta row */}
            <div className="flex flex-wrap gap-4 text-xs text-gray-500">
              {project.customer_name && (
                <span className="flex items-center gap-1.5">
                  <User size={12} className="text-gray-400" /> {project.customer_name}
                </span>
              )}
              {project.manager_name && (
                <span className="flex items-center gap-1.5">
                  <Flag size={12} className="text-gray-400" /> {project.manager_name}
                </span>
              )}
              {project.start_date && (
                <span className="flex items-center gap-1.5">
                  <Calendar size={12} className="text-gray-400" />
                  {project.start_date}{project.end_date ? ` → ${project.end_date}` : ''}
                </span>
              )}
              {(project.contact_phone) && (
                <a href={`tel:${project.contact_phone}`} className="flex items-center gap-1.5 text-indigo-600 hover:underline">
                  <Phone size={12} /> {project.contact_phone}
                </a>
              )}
              {project.budget && (
                <span className="flex items-center gap-1.5">
                  <TrendingUp size={12} className="text-gray-400" />
                  Budget: Rs. {parseFloat(project.budget).toLocaleString()}
                </span>
              )}
            </div>
          </div>

          {/* Team avatars */}
          <div className="flex -space-x-2 shrink-0">
            {(project.team_member_names ?? []).slice(0, 5).map((name, i) => (
              <Avatar key={i} name={name} size="sm" />
            ))}
            {(project.team_member_names?.length ?? 0) > 5 && (
              <span className="w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-[10px] font-bold inline-flex items-center justify-center border-2 border-white">
                +{(project.team_member_names?.length ?? 0) - 5}
              </span>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-5">
          <div className="flex justify-between text-xs text-gray-500 mb-1.5">
            <span className="font-medium">{doneTasks.length}/{tasks.length} tasks complete</span>
            <span className="font-semibold text-indigo-600">{progress}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2.5">
            <div
              className="bg-gradient-to-r from-indigo-500 to-indigo-400 h-2.5 rounded-full transition-all duration-700"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Stats strip */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-gray-50">
          <div className="text-center">
            <div className="text-lg font-bold text-gray-700">{todoTasks.length}</div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">To Do</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-blue-600">{inProgressTasks.length}</div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">In Progress</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-emerald-600">{doneTasks.length}</div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Done</div>
          </div>
          <div className="text-center">
            <div className={`text-lg font-bold ${overdueTasks.length > 0 ? 'text-red-500' : 'text-gray-400'}`}>
              {overdueTasks.length}
            </div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Overdue</div>
          </div>
        </div>

        {/* Hours strip */}
        {totalEst > 0 && (
          <div className="mt-3 flex items-center gap-6 text-xs text-gray-500 pt-3 border-t border-gray-50">
            <span className="flex items-center gap-1"><Timer size={11} /> Est: <strong className="text-gray-700">{totalEst}h</strong></span>
            <span className="flex items-center gap-1"><Clock size={11} /> Logged: <strong className={totalAct > totalEst ? 'text-red-500' : 'text-gray-700'}>{totalAct}h</strong></span>
            {totalEst > 0 && (
              <div className="flex-1 max-w-32">
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${totalAct > totalEst ? 'bg-red-400' : 'bg-emerald-400'}`}
                    style={{ width: `${Math.min(100, (totalAct / totalEst) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Main content split ─────────────────────────────────────────────── */}
      <div className="flex gap-6 items-start">

        {/* ── Left: Tasks board ─────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* Tasks header + view toggle + add */}
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-800 text-base flex items-center gap-2">
              <BarChart2 size={16} className="text-indigo-400" /> Tasks
            </h2>
            <div className="flex items-center gap-2">
              {/* View toggle */}
              <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode('kanban')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition ${viewMode === 'kanban' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <LayoutGrid size={12} /> Kanban
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition ${viewMode === 'list' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <List size={12} /> List
                </button>
              </div>
              {canManage && (
                <button
                  onClick={() => setShowTaskForm(v => !v)}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium"
                >
                  <Plus size={12} /> Add Task
                </button>
              )}
            </div>
          </div>

          {/* New task form */}
          {showTaskForm && (
            <div className="bg-indigo-50 rounded-xl p-4 space-y-3 border border-indigo-100">
              <input
                autoFocus
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Task title"
                value={newTask.title}
                onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))}
              />
              <textarea
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                placeholder="Description (optional)"
                value={newTask.description}
                onChange={e => setNewTask(p => ({ ...p, description: e.target.value }))}
              />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <select
                  value={newTask.priority}
                  onChange={e => setNewTask(p => ({ ...p, priority: e.target.value }))}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
                <select
                  value={newTask.assigned_to}
                  onChange={e => setNewTask(p => ({ ...p, assigned_to: e.target.value }))}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Unassigned</option>
                  {staffList.map(s => (
                    <option key={s.id} value={s.id}>{s.full_name || s.email}</option>
                  ))}
                </select>
                <input
                  type="date"
                  value={newTask.due_date}
                  onChange={e => setNewTask(p => ({ ...p, due_date: e.target.value }))}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="Est. hours"
                  value={newTask.estimated_hours}
                  onChange={e => setNewTask(p => ({ ...p, estimated_hours: e.target.value }))}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => createTaskMutation.mutate()}
                  disabled={!newTask.title || createTaskMutation.isPending}
                  className="flex-1 bg-indigo-600 text-white py-1.5 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50 transition font-medium"
                >
                  {createTaskMutation.isPending ? 'Creating…' : 'Create Task'}
                </button>
                <button onClick={() => setShowTaskForm(false)} className="px-3 border border-gray-300 rounded-lg text-gray-500 hover:bg-gray-50">
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          {/* ── Kanban Board ─────────────────────────────────────────────────── */}
          {viewMode === 'kanban' && (
            <div className="grid grid-cols-3 gap-4">
              {KANBAN_COLS.map(col => {
                const colTasks = tasks.filter(t => t.status === col.key)
                const isDragTarget = dragOverCol === col.key
                return (
                  <div
                    key={col.key}
                    onDragOver={e => handleDragOver(e, col.key)}
                    onDrop={e => handleDrop(e, col.key)}
                    onDragLeave={() => setDragOverCol(null)}
                    className={`
                      rounded-xl border-2 transition-all duration-150 min-h-64
                      ${isDragTarget ? `${col.color} ${col.bg} scale-[1.01] shadow-md` : 'border-transparent bg-gray-50'}
                    `}
                  >
                    {/* Column header */}
                    <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
                        <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">{col.label}</span>
                      </div>
                      <span className="text-xs font-semibold text-gray-400 bg-white px-1.5 py-0.5 rounded-md shadow-sm">
                        {colTasks.length}
                      </span>
                    </div>

                    {/* Cards */}
                    <div className="p-2 space-y-2">
                      {colTasks.length === 0 && (
                        <div className={`rounded-lg border-2 border-dashed ${isDragTarget ? col.color : 'border-gray-200'} p-4 text-center`}>
                          <p className="text-xs text-gray-400">
                            {isDragTarget ? 'Drop here' : 'No tasks'}
                          </p>
                        </div>
                      )}
                      {colTasks.map(task => (
                        <div
                          key={task.id}
                          className={`relative ${dragTaskId === task.id ? 'opacity-40' : ''}`}
                          onDragEnd={handleDragEnd}
                        >
                          <TaskCard
                            task={task}
                            onDragStart={handleDragStart}
                            onClick={setSelectedTask}
                            onDelete={canManage ? () => { if (confirm('Delete this task?')) deleteTaskMutation.mutate(task.id) } : undefined}
                            canManage={canManage}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── List View ────────────────────────────────────────────────────── */}
          {viewMode === 'list' && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {tasks.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-400">No tasks yet — add one above</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-semibold uppercase tracking-wide">Task</th>
                      <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-semibold uppercase tracking-wide">Priority</th>
                      <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-semibold uppercase tracking-wide">Assignee</th>
                      <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-semibold uppercase tracking-wide">Due</th>
                      <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-semibold uppercase tracking-wide">Hours</th>
                      <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-semibold uppercase tracking-wide">Status</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map(task => {
                      const overdue = isOverdue(task)
                      return (
                        <tr
                          key={task.id}
                          onClick={() => setSelectedTask(task)}
                          className="border-b border-gray-50 hover:bg-indigo-50/40 cursor-pointer transition group"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={e => {
                                  e.stopPropagation()
                                  const next = task.status === 'done' ? 'todo' : task.status === 'todo' ? 'in_progress' : 'done'
                                  changeTaskStatusMutation.mutate({ taskId: task.id, status: next })
                                }}
                              >
                                {task.status === 'done'
                                  ? <CheckCircle2 size={15} className="text-emerald-500" />
                                  : task.status === 'in_progress'
                                    ? <Circle size={15} className="text-blue-400 fill-blue-100" />
                                    : <Circle size={15} className="text-gray-300" />}
                              </button>
                              <span className={`font-medium ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                                {task.title}
                              </span>
                              {overdue && <AlertTriangle size={12} className="text-red-400" />}
                            </div>
                          </td>
                          <td className="px-4 py-3"><PriorityDot priority={task.priority} /></td>
                          <td className="px-4 py-3">
                            {task.assigned_to_name ? (
                              <div className="flex items-center gap-1.5">
                                <Avatar name={task.assigned_to_name} size="xs" />
                                <span className="text-xs text-gray-600 truncate max-w-24">{task.assigned_to_name}</span>
                              </div>
                            ) : <span className="text-xs text-gray-400">—</span>}
                          </td>
                          <td className={`px-4 py-3 text-xs ${overdue ? 'text-red-500 font-medium' : 'text-gray-500'}`}>
                            {task.due_date ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {task.estimated_hours ? `${fmtHours(task.estimated_hours)} est` : '—'}
                            {task.actual_hours ? ` / ${fmtHours(task.actual_hours)} logged` : ''}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${
                              task.status === 'done' ? 'bg-emerald-100 text-emerald-700' :
                              task.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {task.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {canManage && (
                              <button
                                onClick={e => { e.stopPropagation(); if (confirm('Delete task?')) deleteTaskMutation.mutate(task.id) }}
                                className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition p-1"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* ── Right Sidebar ──────────────────────────────────────────────────── */}
        <div className="w-72 shrink-0 space-y-4">

          {/* Team */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-1.5">
                <Users size={13} className="text-indigo-400" /> Team
              </h3>
              {canManage && !editingTeam && (
                <button onClick={() => { setSelectedTeam(project.team_members ?? []); setEditingTeam(true) }}
                  className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
                  <Edit3 size={10} /> Edit
                </button>
              )}
            </div>
            {!editingTeam ? (
              <div className="space-y-1.5">
                {(project.team_member_names ?? []).length === 0 ? (
                  <p className="text-xs text-gray-400 italic">No members assigned</p>
                ) : (
                  (project.team_member_names ?? []).map((name, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Avatar name={name} size="sm" />
                      <span className="text-xs text-gray-700 font-medium truncate">{name}</span>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {staffList.map(s => (
                    <label key={s.id} className="flex items-center gap-2 text-xs p-1.5 rounded hover:bg-indigo-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedTeam.includes(s.id)}
                        onChange={e => setSelectedTeam(prev =>
                          e.target.checked ? [...prev, s.id] : prev.filter(x => x !== s.id)
                        )}
                        className="rounded text-indigo-600"
                      />
                      <Avatar name={s.full_name || s.email} size="xs" />
                      <span className="text-gray-700 truncate">{s.full_name || s.email}</span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => updateTeamMutation.mutate(selectedTeam)}
                    disabled={updateTeamMutation.isPending}
                    className="flex-1 bg-indigo-600 text-white py-1.5 rounded-lg text-xs hover:bg-indigo-700 disabled:opacity-50 font-medium"
                  >
                    {updateTeamMutation.isPending ? 'Saving…' : 'Save Team'}
                  </button>
                  <button onClick={() => setEditingTeam(false)}
                    className="px-2 border border-gray-300 rounded-lg text-gray-500 hover:bg-gray-50">
                    <X size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Milestones */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-1.5">
                <Flag size={13} className="text-purple-400" /> Milestones
                {milestones.length > 0 && (
                  <span className="text-[10px] text-gray-400 font-normal">{milestonesDone}/{milestones.length}</span>
                )}
              </h3>
              {canManage && (
                <button onClick={() => setShowMilestoneForm(v => !v)} className="text-indigo-600 hover:text-indigo-800">
                  <Plus size={14} />
                </button>
              )}
            </div>

            {milestones.length > 0 && (
              <div className="mb-3">
                <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                  <span>{milestoneProgress}% complete</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div className="bg-purple-400 h-1.5 rounded-full transition-all" style={{ width: `${milestoneProgress}%` }} />
                </div>
              </div>
            )}

            {showMilestoneForm && (
              <div className="mb-3 space-y-2 p-3 bg-purple-50 rounded-xl border border-purple-100">
                <input
                  autoFocus
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400"
                  placeholder="Milestone name"
                  value={newMilestone.name}
                  onChange={e => setNewMilestone(p => ({ ...p, name: e.target.value }))}
                />
                <input
                  type="date"
                  value={newMilestone.due_date}
                  onChange={e => setNewMilestone(p => ({ ...p, due_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
                <div className="flex gap-1.5">
                  <button
                    onClick={() => createMilestoneMutation.mutate()}
                    disabled={!newMilestone.name || createMilestoneMutation.isPending}
                    className="flex-1 bg-purple-500 text-white py-1.5 rounded-lg text-xs hover:bg-purple-600 disabled:opacity-50 font-medium"
                  >
                    {createMilestoneMutation.isPending ? 'Saving…' : 'Add'}
                  </button>
                  <button onClick={() => setShowMilestoneForm(false)} className="px-2 border border-gray-300 rounded-lg text-gray-500 hover:bg-gray-50">
                    <X size={12} />
                  </button>
                </div>
              </div>
            )}

            {milestones.length === 0 && !showMilestoneForm ? (
              <p className="text-xs text-gray-400 italic">No milestones</p>
            ) : (
              <ul className="space-y-2">
                {milestones.map(m => {
                  const mOverdue = m.due_date && !m.is_completed && new Date(m.due_date) < new Date()
                  return (
                    <li key={m.id} className="flex items-start gap-2 group">
                      <button onClick={() => toggleMilestoneMutation.mutate(m.id)} className="shrink-0 mt-0.5">
                        {m.is_completed
                          ? <CheckCircle2 size={14} className="text-purple-500" />
                          : <Circle size={14} className="text-gray-300 hover:text-purple-400 transition" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <span className={`text-xs font-medium ${m.is_completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                          {m.name}
                        </span>
                        {m.due_date && (
                          <div className={`text-[10px] mt-0.5 flex items-center gap-0.5 ${mOverdue ? 'text-red-500' : 'text-gray-400'}`}>
                            {mOverdue && <AlertTriangle size={9} />}
                            <Calendar size={9} /> {m.due_date}
                          </div>
                        )}
                      </div>
                      {canManage && (
                        <button
                          onClick={() => { if (confirm('Delete milestone?')) deleteMilestoneMutation.mutate(m.id) }}
                          className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition shrink-0"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Contact phone */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-1.5">
                <Phone size={13} className="text-gray-400" /> Contact
              </h3>
              {canManage && !editingPhone && (
                <button onClick={() => { setPhoneValue(project.contact_phone || ''); setEditingPhone(true) }}
                  className="text-xs text-gray-400 hover:text-indigo-600">
                  <Edit3 size={11} />
                </button>
              )}
            </div>
            {editingPhone ? (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus type="tel"
                  value={phoneValue}
                  onChange={e => setPhoneValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') savePhoneMutation.mutate(phoneValue); if (e.key === 'Escape') setEditingPhone(false) }}
                  placeholder="+977-..."
                  className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button onClick={() => savePhoneMutation.mutate(phoneValue)} disabled={savePhoneMutation.isPending}
                  className="text-xs text-white bg-indigo-600 px-2 py-1 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                  {savePhoneMutation.isPending ? '…' : 'Save'}
                </button>
                <button onClick={() => setEditingPhone(false)}><X size={13} className="text-gray-400" /></button>
              </div>
            ) : (
              project.contact_phone
                ? <a href={`tel:${project.contact_phone}`} className="text-sm text-indigo-600 hover:underline font-medium">{project.contact_phone}</a>
                : <span className="text-xs text-gray-400 italic">No phone set</span>
            )}
          </div>

          {/* Materials */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-1.5 mb-3">
              <Package size={13} className="text-amber-500" /> Materials
            </h3>
            {projectProducts.length === 0 ? (
              <p className="text-xs text-gray-400 italic mb-3">None added</p>
            ) : (
              <ul className="space-y-1.5 mb-3">
                {projectProducts.map(pp => (
                  <li key={pp.id} className="flex items-center justify-between text-xs group">
                    <span className="font-medium text-gray-700 truncate">{pp.product_name}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-gray-400">×{pp.quantity_planned}</span>
                      {canManage && (
                        <button onClick={() => removeProductMutation.mutate(pp.id)}
                          className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition">
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {canManage ? (
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <ProductSearchInput onSelect={p => addProductMutation.mutate(p)} />
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500">Qty:</label>
                  <input
                    type="number" min={1} value={ppQty}
                    onChange={e => setPpQty(Math.max(1, Number(e.target.value)))}
                    className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-gray-400 italic pt-1 border-t border-gray-50">
                Use <span className="font-medium text-orange-500">Product Requests</span> below to request materials.
              </p>
            )}
          </div>

          {/* Product Requests — always visible to staff; visible to managers only when there are pending requests */}
          {(!canManage || productRequests.some(r => r.status === 'pending')) && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => setShowPRSection(v => !v)}
                className="font-semibold text-gray-800 text-sm flex items-center gap-1.5 hover:text-indigo-600 transition"
              >
                <ShoppingCart size={13} className="text-orange-400" />
                Product Requests
                {productRequests.filter(r => r.status === 'pending').length > 0 && (
                  <span className="bg-orange-100 text-orange-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {productRequests.filter(r => r.status === 'pending').length}
                  </span>
                )}
                {showPRSection ? <ChevronUp size={11} className="text-gray-400 ml-1" /> : <ChevronDown size={11} className="text-gray-400 ml-1" />}
              </button>
              {!canManage && (
                <button
                  onClick={() => setShowPRForm(v => !v)}
                  className="flex items-center gap-1 text-xs px-2 py-1 bg-orange-50 text-orange-600 rounded-lg hover:bg-orange-100 transition"
                  title="Request a product"
                >
                  <Plus size={9} /> Request
                </button>
              )}
            </div>

            {/* Request form — staff only */}
            {!canManage && showPRForm && (
              <div className="mb-3 p-3 bg-orange-50 rounded-xl border border-orange-100 space-y-2">
                <label className="block text-[11px] font-medium text-gray-500 mb-0.5">Product</label>
                <ProductSearchInput onSelect={p => setPrProduct(p)} />
                {prProduct && (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-orange-700 bg-orange-100 rounded-lg px-2 py-1">
                    <Package size={11} />
                    {prProduct.name}
                    <button onClick={() => setPrProduct(null)} className="ml-auto text-orange-400 hover:text-orange-600"><X size={11} /></button>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 shrink-0">Qty:</label>
                  <input
                    type="number" min={1} value={prQty}
                    onChange={e => setPrQty(Math.max(1, Number(e.target.value)))}
                    className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>
                <textarea
                  rows={2}
                  placeholder="Note / reason (optional)"
                  value={prNote}
                  onChange={e => setPrNote(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
                />
                <div className="flex gap-1.5">
                  <button
                    onClick={() => createPRMutation.mutate()}
                    disabled={!prProduct || createPRMutation.isPending}
                    className="flex-1 bg-orange-500 text-white py-1.5 rounded-lg text-xs hover:bg-orange-600 disabled:opacity-50 font-medium"
                  >
                    {createPRMutation.isPending ? 'Submitting…' : 'Submit Request'}
                  </button>
                  <button onClick={() => setShowPRForm(false)} className="px-2 border border-gray-300 rounded-lg text-gray-500 hover:bg-gray-50">
                    <X size={12} />
                  </button>
                </div>
              </div>
            )}

            {/* Request list */}
            {showPRSection && (
              <div className="space-y-2">
                {productRequests.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">No requests yet</p>
                ) : (
                  productRequests.map(req => (
                    <div
                      key={req.id}
                      className={`rounded-xl border p-3 text-xs space-y-1.5 ${
                        req.status === 'pending' ? 'border-orange-200 bg-orange-50' :
                        req.status === 'approved' ? 'border-emerald-200 bg-emerald-50' :
                        'border-red-200 bg-red-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-gray-800 truncate">{req.product_name}</span>
                        <span className={`shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                          req.status === 'pending' ? 'bg-orange-200 text-orange-700' :
                          req.status === 'approved' ? 'bg-emerald-200 text-emerald-700' :
                          'bg-red-200 text-red-600'
                        }`}>
                          {req.status}
                        </span>
                      </div>
                      <div className="text-gray-500 flex items-center gap-1.5 flex-wrap">
                        <span>×{req.quantity}</span>
                        {req.product_sku && <span className="text-gray-400 font-mono">{req.product_sku}</span>}
                        {req.requested_by_name && (
                          <span className="text-gray-400">by {req.requested_by_name}</span>
                        )}
                      </div>
                      {req.note && <p className="text-gray-500 italic">"{req.note}"</p>}
                      {req.rejection_reason && (
                        <p className="text-red-500 text-[10px] flex items-center gap-1">
                          <XCircle size={10} /> {req.rejection_reason}
                        </p>
                      )}

                      {/* Manager approve/reject buttons */}
                      {canManage && req.status === 'pending' && (
                        <div className="pt-1 space-y-1">
                          {prRejectId === req.id ? (
                            <div className="space-y-1">
                              <input
                                autoFocus
                                className="w-full border border-red-300 rounded px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-red-400"
                                placeholder="Reason (optional)"
                                value={prRejectReason}
                                onChange={e => setPrRejectReason(e.target.value)}
                              />
                              <div className="flex gap-1">
                                <button
                                  onClick={() => rejectPRMutation.mutate({ reqId: req.id, reason: prRejectReason })}
                                  disabled={rejectPRMutation.isPending}
                                  className="flex-1 text-[11px] bg-red-500 text-white rounded py-1 hover:bg-red-600 disabled:opacity-50 font-medium"
                                >
                                  {rejectPRMutation.isPending ? '…' : 'Confirm Reject'}
                                </button>
                                <button
                                  onClick={() => { setPrRejectId(null); setPrRejectReason('') }}
                                  className="px-2 border border-gray-300 rounded text-gray-500 text-[11px] hover:bg-gray-100"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-1">
                              <button
                                onClick={() => approvePRMutation.mutate(req.id)}
                                disabled={approvePRMutation.isPending}
                                className="flex-1 flex items-center justify-center gap-1 text-[11px] bg-emerald-500 text-white rounded-lg py-1 hover:bg-emerald-600 disabled:opacity-50 font-medium"
                              >
                                <CheckCheck size={11} /> Approve
                              </button>
                              <button
                                onClick={() => { setPrRejectId(req.id); setPrRejectReason('') }}
                                className="flex-1 flex items-center justify-center gap-1 text-[11px] bg-red-100 text-red-600 rounded-lg py-1 hover:bg-red-200 font-medium"
                              >
                                <XCircle size={11} /> Reject
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          )}

          {/* Attachments */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-1.5">
                <Paperclip size={13} className="text-gray-400" /> Files
                {attachments.length > 0 && <span className="text-xs text-gray-400 font-normal">({attachments.length})</span>}
              </h3>
              <button
                onClick={() => attachFileRef.current?.click()}
                disabled={uploadingAttach}
                className="flex items-center gap-1 text-xs px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 disabled:opacity-50"
              >
                {uploadingAttach ? <Loader2 size={9} className="animate-spin" /> : <Plus size={9} />}
                {uploadingAttach ? 'Uploading…' : 'Upload'}
              </button>
            </div>
            <input ref={attachFileRef} type="file" multiple className="hidden"
              onChange={e => handleAttachmentUpload(e.target.files)} />
            {attachments.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No files attached</p>
            ) : (
              <div className="space-y-1.5">
                {attachments.map(a => (
                  <div key={a.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg group hover:bg-indigo-50 transition">
                    <FileText size={12} className="text-gray-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-700 truncate">{a.file_name}</p>
                      {a.file_size > 0 && <p className="text-[10px] text-gray-400">{(a.file_size / 1024).toFixed(1)} KB</p>}
                    </div>
                    <a href={a.url} target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-700 p-0.5" title="Download">
                      <Download size={12} />
                    </a>
                    <button onClick={() => deleteAttachment(a.id)} className="text-red-400 hover:text-red-600 p-0.5">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Task Detail Modal ──────────────────────────────────────────────── */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          staffList={staffList}
          milestones={milestones}
          projectId={projectId}
          canManage={canManage}
          onClose={() => setSelectedTask(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['project-tasks', id] })
            qc.invalidateQueries({ queryKey: ['project', id] })
          }}
        />
      )}
    </div>
  )
}
