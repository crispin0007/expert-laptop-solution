import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Loader2 } from 'lucide-react'
import apiClient from '../../api/client'
import { TICKETS, CUSTOMERS, DEPARTMENTS, STAFF } from '../../api/endpoints'
import Modal from '../../components/Modal'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TicketType {
  id: number
  name: string
  default_sla_hours: number
  requires_product: boolean
}

interface Customer {
  id: number
  name: string
}

interface Department {
  id: number
  name: string
}

interface StaffUser {
  id: number
  full_name: string
  email: string
}

interface CreateTicketPayload {
  title: string
  description: string
  priority: string
  ticket_type: number | ''
  customer: number | ''
  department: number | ''
  assigned_to: number | ''
  sla_deadline: string
  scheduled_at: string
  contact_phone: string
}

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

const EMPTY: CreateTicketPayload = {
  title: '',
  description: '',
  priority: 'medium',
  ticket_type: '',
  customer: '',
  department: '',
  assigned_to: '',
  sla_deadline: '',
  scheduled_at: '',
  contact_phone: '',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CreateTicketModal({ open, onClose, onCreated }: Props) {
  const [form, setForm] = useState<CreateTicketPayload>(EMPTY)

  const set = (key: keyof CreateTicketPayload, value: string | number | '') =>
    setForm(prev => ({ ...prev, [key]: value }))

  // Data queries (only fetch when modal is open)
  const { data: types = [] } = useQuery<TicketType[]>({
    queryKey: ['ticket-types'],
    queryFn: () => apiClient.get(TICKETS.TYPES).then(r =>
      Array.isArray(r.data) ? r.data : (r.data.results ?? r.data.data ?? [])
    ),
    enabled: open,
  })

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['customers-minimal'],
    queryFn: () => apiClient.get(CUSTOMERS.LIST + '?minimal=true').then(r =>
      Array.isArray(r.data) ? r.data : (r.data.results ?? r.data.data ?? [])
    ),
    enabled: open,
  })

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: () => apiClient.get(DEPARTMENTS.LIST).then(r =>
      Array.isArray(r.data) ? r.data : (r.data.results ?? r.data.data ?? [])
    ),
    enabled: open,
  })

  const { data: staff = [] } = useQuery<StaffUser[]>({
    queryKey: ['staff-list'],
    queryFn: () => apiClient.get(STAFF.LIST).then(r =>
      Array.isArray(r.data) ? r.data : (r.data.results ?? r.data.data ?? [])
    ),
    enabled: open,
  })

  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiClient.post(TICKETS.LIST, payload),
    onSuccess: () => {
      toast.success('Ticket created')
      setForm(EMPTY)
      onCreated()
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.errors?.[0] ||
        err?.response?.data?.detail ||
        'Failed to create ticket'
      toast.error(msg)
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) {
      toast.error('Title is required')
      return
    }
    const payload: Record<string, unknown> = { ...form }
    ;(['ticket_type', 'customer', 'department', 'assigned_to'] as const).forEach(k => {
      if (payload[k] === '') delete payload[k]
    })
    if (!payload.contact_phone) delete payload.contact_phone
    if (payload.sla_deadline) {
      payload.sla_deadline = new Date(payload.sla_deadline as string).toISOString()
    } else {
      delete payload.sla_deadline
    }
    if (payload.scheduled_at) {
      payload.scheduled_at = new Date(payload.scheduled_at as string).toISOString()
    } else {
      delete payload.scheduled_at
    }
    mutation.mutate(payload)
  }

  function handleClose() {
    setForm(EMPTY)
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="New Ticket" width="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Title */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.title}
            onChange={e => set('title', e.target.value)}
            placeholder="Brief summary of the issue"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            required
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
          <textarea
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Detailed description of the issue…"
            rows={4}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>

        {/* Row: Type + Priority */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Ticket Type</label>
            <select
              value={form.ticket_type}
              onChange={e => set('ticket_type', e.target.value ? Number(e.target.value) : '')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— Select type —</option>
              {types.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
            <select
              value={form.priority}
              onChange={e => set('priority', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        </div>

        {/* Row: SLA + Schedule */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">SLA Deadline</label>
            <input
              type="datetime-local"
              value={form.sla_deadline}
              onChange={e => set('sla_deadline', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xs text-slate-400 mt-1">Optional. If omitted, the ticket type default SLA is used.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Schedule Start</label>
            <input
              type="datetime-local"
              value={form.scheduled_at}
              onChange={e => set('scheduled_at', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xs text-slate-400 mt-1">Optional. Notify the assignee when the ticket is due to start.</p>
          </div>
        </div>

        {/* Row: Customer + Department */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Customer</label>
            <select
              value={form.customer}
              onChange={e => set('customer', e.target.value ? Number(e.target.value) : '')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— Select customer —</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Department</label>
            <select
              value={form.department}
              onChange={e => set('department', e.target.value ? Number(e.target.value) : '')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— Select department —</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Assign To */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Assign To</label>
          <select
            value={form.assigned_to}
            onChange={e => set('assigned_to', e.target.value ? Number(e.target.value) : '')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">— Unassigned —</option>
            {staff.map(s => (
              <option key={s.id} value={s.id}>
                {s.full_name || s.email}
              </option>
            ))}
          </select>
        </div>

        {/* Contact Phone */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Contact Phone</label>
          <input
            type="tel"
            value={form.contact_phone}
            onChange={e => set('contact_phone', e.target.value)}
            placeholder="Phone number to reach for this ticket"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition"
          >
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            {mutation.isPending ? 'Creating…' : 'Create Ticket'}
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 border border-gray-300 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition"
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}
