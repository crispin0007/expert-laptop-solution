import { useState, useEffect, useRef } from 'react'
import React from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Send, UserCheck, ArrowRightLeft, AlertCircle,
  Clock, CheckCircle2, CircleDot, Loader2, Lock, MessageSquare,
  Package, Plus, Trash2, FileText, Coins, Paperclip, Users, X, Download, Phone,
  Car, MapPin,
} from 'lucide-react'
import apiClient from '../../api/client'
import { TICKETS, ACCOUNTING, INVENTORY, DEPARTMENTS } from '../../api/endpoints'
import Modal from '../../components/Modal'
import { usePermissions } from '../../hooks/usePermissions'
import { useAuthStore } from '../../store/authStore'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TicketDetail {
  id: number
  ticket_number: string
  title: string
  description: string
  contact_phone?: string
  customer_phone: string
  customer_email: string
  status: string
  priority: string
  ticket_type_name: string
  customer_name: string
  department_name: string
  assigned_to: number | null
  assigned_to_name: string
  team_members: number[]
  team_member_names: string[]
  created_by_name: string
  sla_breached: boolean
  sla_breach_at: string | null
  sla_deadline: string | null
  resolved_at: string | null
  closed_at: string | null
  created_at: string
  vehicles: number[]
  vehicle_names: Array<{ id: number; name: string; plate_number: string }>
}

interface TicketAttachment {
  id: number
  file_name: string
  file_size: number
  url: string
  uploaded_by_name: string
  created_at: string
}

interface Comment {
  id: number
  body: string
  author_name: string
  author_email: string
  is_internal: boolean
  attachments: Array<{ file_url?: string; file_name?: string; file_size?: number }>
  created_at: string
}

interface TimelineEvent {
  id: number
  event_type: string
  description: string
  actor_name: string
  actor_email: string
  metadata: Record<string, unknown>
  created_at: string
}

interface StaffUser {
  id: number
  full_name: string
  display_name: string
  email: string
}

interface Department {
  id: number
  name: string
}

interface TicketProduct {
  id: number
  product: number
  product_name: string
  quantity: number
  unit_price: string
  discount: string
  line_total: string
}

interface Product {
  id: number
  name: string
  sku: string
  unit_price: string
  is_service: boolean
  is_active: boolean
}

interface Vehicle {
  id: number
  name: string
  plate_number: string
  type: string
  fuel_type: string
  rate_per_km: string
  is_active: boolean
}

interface VehicleLog {
  id: number
  vehicle: number
  vehicle_name: string
  ticket: number | null
  ticket_number: string
  driven_by: number | null
  driven_by_name: string
  date: string
  odometer_start: string
  odometer_end: string
  distance_km: number
  billing_amount: number
  fuel_liters: string | null
  fuel_cost: string | null
  notes: string
  created_at: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  pending_customer: 'Pending Customer',
  resolved: 'Resolved',
  closed: 'Closed',
  cancelled: 'Cancelled',
}

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-indigo-100 text-indigo-700',
  pending_customer: 'bg-yellow-100 text-yellow-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-600',
}

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-500',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
}

const EVENT_ICONS: Record<string, React.ReactElement> = {
  created: <CircleDot size={14} className="text-indigo-400" />,
  status_change: <ArrowRightLeft size={14} className="text-blue-400" />,
  assigned: <UserCheck size={14} className="text-green-400" />,
  transferred: <ArrowRightLeft size={14} className="text-purple-400" />,
  commented: <MessageSquare size={14} className="text-gray-400" />,
  product_added: <CheckCircle2 size={14} className="text-amber-400" />,
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Assign Modal ──────────────────────────────────────────────────────────────

function AssignModal({
  ticketId, currentAssignee, currentTeamMembers, open, onClose, onDone,
}: { ticketId: number; currentAssignee: number | null; currentTeamMembers: number[]; open: boolean; onClose: () => void; onDone: () => void }) {
  const [userId, setUserId] = useState<number | ''>(currentAssignee ?? '')
  const [teamIds, setTeamIds] = useState<number[]>(currentTeamMembers)

  useEffect(() => {
    setUserId(currentAssignee ?? '')
    setTeamIds(currentTeamMembers)
  }, [currentAssignee, currentTeamMembers, open])

  const { data: staff = [] } = useQuery<StaffUser[]>({
    queryKey: ['staff-list'],
    queryFn: () => apiClient.get('/accounts/staff/').then(r =>
      Array.isArray(r.data) ? r.data : (r.data.results ?? r.data.data ?? [])
    ),
    enabled: open,
  })

  // Primary assign
  const assignMutation = useMutation({
    mutationFn: () => apiClient.post(TICKETS.ASSIGN(ticketId), { user_id: userId }),
    onSuccess: () => { toast.success('Primary assignee updated') },
    onError: () => toast.error('Failed to assign ticket'),
  })

  // Team members - via PATCH on the ticket
  const teamMutation = useMutation({
    mutationFn: () => apiClient.patch(TICKETS.DETAIL(ticketId), { team_members: teamIds }),
    onSuccess: () => { toast.success('Team members updated') },
    onError: () => toast.error('Failed to update team members'),
  })

  async function handleSave() {
    const promises = []
    if (userId !== (currentAssignee ?? '')) promises.push(assignMutation.mutateAsync())
    promises.push(teamMutation.mutateAsync())
    await Promise.all(promises)
    onDone()
  }

  function toggleTeamMember(id: number) {
    setTeamIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  return (
    <Modal open={open} onClose={onClose} title="Assign Staff" width="max-w-sm">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Primary Assignee</label>
          <select
            value={userId}
            onChange={e => setUserId(e.target.value ? Number(e.target.value) : '')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">— Unassigned —</option>
            {staff.map(s => (
              <option key={s.id} value={s.id}>{s.display_name || s.full_name || s.email}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
            <Users size={12} /> Team Members (multiple)
          </label>
          <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
            {staff.map(s => (
              <label key={s.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={teamIds.includes(s.id)}
                  onChange={() => toggleTeamMember(s.id)}
                  className="rounded text-indigo-600"
                />
                <span className="text-sm text-gray-700">{s.display_name || s.full_name || s.email}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={assignMutation.isPending || teamMutation.isPending}
            className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
          >
            {(assignMutation.isPending || teamMutation.isPending) && <Loader2 size={13} className="animate-spin" />}
            Save
          </button>
          <button onClick={onClose} className="flex-1 border border-gray-300 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Transfer Modal ────────────────────────────────────────────────────────────

function TransferModal({
  ticketId, open, onClose, onDone,
}: { ticketId: number; open: boolean; onClose: () => void; onDone: () => void }) {
  const [deptId, setDeptId] = useState<number | ''>('')
  const [reason, setReason] = useState('')

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: () => apiClient.get(DEPARTMENTS.LIST).then(r =>
      Array.isArray(r.data) ? r.data : (r.data.results ?? r.data.data ?? [])
    ),
    enabled: open,
  })

  const mutation = useMutation({
    mutationFn: () => apiClient.post(TICKETS.TRANSFER(ticketId), { to_department: deptId, reason }),
    onSuccess: () => { toast.success('Ticket transferred'); setReason(''); setDeptId(''); onDone() },
    onError: () => toast.error('Failed to transfer ticket'),
  })

  return (
    <Modal open={open} onClose={onClose} title="Transfer Ticket" width="max-w-sm">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Transfer To</label>
          <select
            value={deptId}
            onChange={e => setDeptId(e.target.value ? Number(e.target.value) : '')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">— Select department —</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Reason</label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            placeholder="Why is this being transferred?"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => mutation.mutate()}
            disabled={!deptId || mutation.isPending}
            className="flex-1 flex items-center justify-center gap-1.5 bg-purple-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-60"
          >
            {mutation.isPending && <Loader2 size={13} className="animate-spin" />}
            Transfer
          </button>
          <button onClick={onClose} className="flex-1 border border-gray-300 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Ticket Products Panel ─────────────────────────────────────────────────────

function TicketProductsPanel({
  ticketId,
  ticketStatus,
}: { ticketId: number; ticketStatus: string }) {
  const qc = useQueryClient()
  // Debounced product search state
  const [productSearch, setProductSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [qty, setQty] = useState(1)
  const [generatingInvoice, setGeneratingInvoice] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Debounce search by 350ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(productSearch), 350)
    return () => clearTimeout(timer)
  }, [productSearch])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setShowDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const { data: products = [] } = useQuery<TicketProduct[]>({
    queryKey: ['ticket-products', ticketId],
    queryFn: () =>
      apiClient.get(TICKETS.TICKET_PRODUCTS(ticketId)).then(r =>
        Array.isArray(r.data) ? r.data : (r.data.results ?? r.data.data ?? [])
      ),
  })

  // Only search when we have at least 1 char
  const { data: searchResults = [], isFetching: searching } = useQuery<Product[]>({
    queryKey: ['product-search', debouncedSearch],
    queryFn: () =>
      apiClient.get(INVENTORY.PRODUCTS, { params: { search: debouncedSearch, page_size: 20 } })
        .then(r => Array.isArray(r.data) ? r.data : (r.data.results ?? [])),
    enabled: debouncedSearch.length > 0,
    staleTime: 10_000,
  })

  const addMutation = useMutation({
    mutationFn: () =>
      apiClient.post(TICKETS.TICKET_PRODUCTS(ticketId), {
        product: selectedProduct!.id,
        quantity: qty,
      }),
    onSuccess: () => {
      toast.success('Product added')
      setSelectedProduct(null)
      setProductSearch('')
      setQty(1)
      setShowDropdown(false)
      qc.invalidateQueries({ queryKey: ['ticket-products', ticketId] })
      qc.invalidateQueries({ queryKey: ['ticket-timeline', String(ticketId)] })
    },
    onError: () => toast.error('Failed to add product'),
  })

  const removeMutation = useMutation({
    mutationFn: (productId: number) =>
      apiClient.delete(TICKETS.TICKET_PRODUCT_DETAIL(ticketId, productId)),
    onSuccess: () => {
      toast.success('Product removed')
      qc.invalidateQueries({ queryKey: ['ticket-products', ticketId] })
    },
    onError: () => toast.error('Failed to remove product'),
  })

  const generateInvoiceMutation = useMutation({
    mutationFn: () =>
      apiClient.post(ACCOUNTING.INVOICE_GENERATE_FROM_TICKET, { ticket: ticketId }),
    onSuccess: (res) => {
      const inv = res.data
      toast.success(`Invoice ${inv.invoice_number || '#' + inv.id} generated!`)
      setGeneratingInvoice(false)
      qc.invalidateQueries({ queryKey: ['invoices'] })
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Failed to generate invoice')
      setGeneratingInvoice(false)
    },
  })

  const isClosed = ['closed', 'cancelled'].includes(ticketStatus)

  const grandTotal = products.reduce((sum, p) => sum + parseFloat(p.line_total || '0'), 0)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
          <Package size={16} className="text-amber-500" /> Products &amp; Parts
        </h2>
        {products.length > 0 && (
          <button
            onClick={() => { setGeneratingInvoice(true); generateInvoiceMutation.mutate() }}
            disabled={generateInvoiceMutation.isPending || generatingInvoice}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition"
          >
            {generateInvoiceMutation.isPending
              ? <Loader2 size={11} className="animate-spin" />
              : <FileText size={11} />
            }
            Generate Invoice
          </button>
        )}
      </div>

      {/* Product list */}
      {products.length === 0 ? (
        <p className="text-sm text-gray-400 mb-4">No products added yet.</p>
      ) : (
        <div className="mb-4 divide-y divide-gray-100">
          {products.map(p => (
            <div key={p.id} className="flex items-center justify-between py-2.5 text-sm">
              <div className="flex-1">
                <span className="font-medium text-gray-800">{p.product_name}</span>
                <span className="text-gray-400 ml-2">×{p.quantity}</span>
              </div>
              <div className="text-gray-600 font-medium mr-3">
                Rs. {parseFloat(p.line_total).toFixed(2)}
              </div>
              {!isClosed && (
                <button
                  onClick={() => removeMutation.mutate(p.id)}
                  disabled={removeMutation.isPending}
                  className="text-red-400 hover:text-red-600 transition"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
          <div className="flex justify-between pt-2.5 text-sm font-semibold text-gray-800">
            <span>Total</span>
            <span>Rs. {grandTotal.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Add product form — debounced search */}
      {!isClosed && (
        <div className="flex gap-2 items-end pt-3 border-t border-gray-100">
          <div className="flex-1 relative" ref={dropdownRef}>
            <label className="block text-xs text-gray-500 mb-1">Product</label>
            {selectedProduct ? (
              /* Show selected product as a chip */
              <div className="flex items-center gap-2 border border-amber-300 bg-amber-50 rounded-lg px-3 py-1.5 text-sm">
                <span className="flex-1 text-gray-800">{selectedProduct.name}</span>
                <button
                  onClick={() => { setSelectedProduct(null); setProductSearch('') }}
                  className="text-gray-400 hover:text-gray-600 leading-none"
                >×</button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="Search products…"
                  value={productSearch}
                  onChange={e => { setProductSearch(e.target.value); setShowDropdown(true) }}
                  onFocus={() => productSearch && setShowDropdown(true)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                {showDropdown && debouncedSearch.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-auto">
                    {searching ? (
                      <div className="px-3 py-2 text-xs text-gray-400 flex items-center gap-1.5">
                        <Loader2 size={12} className="animate-spin" /> Searching…
                      </div>
                    ) : searchResults.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-gray-400">No products found</div>
                    ) : (
                      searchResults.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => { setSelectedProduct(p); setShowDropdown(false) }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 flex justify-between items-center"
                        >
                          <span className="font-medium text-gray-800">{p.name}</span>
                          <span className="text-xs text-gray-400">
                            {p.is_service ? 'Service' : `Rs. ${parseFloat(p.unit_price).toFixed(2)}`}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="w-20">
            <label className="block text-xs text-gray-500 mb-1">Qty</label>
            <input
              type="number"
              min={1}
              value={qty}
              onChange={e => setQty(Math.max(1, Number(e.target.value)))}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <button
            onClick={() => addMutation.mutate()}
            disabled={!selectedProduct || addMutation.isPending}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 transition"
          >
            {addMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Add
          </button>
        </div>
      )}
    </div>
  )
}

// ── Vehicle Section (dispatched vehicles + trip logs) ───────────────────────

/**
 * Unified vehicle panel for a ticket:
 *  - TOP: Dispatched Vehicles — the fleet M2M assigned to this ticket
 *    (set during wizard, editable here via PATCH /tickets/{id}/)
 *  - BOTTOM: Trip Logs — VehicleLog records for actual trips
 *    (odometer, distance, billing; logged after the trip)
 */
function TicketVehicleSection({
  ticket,
  ticketId,
}: { ticket: TicketDetail; ticketId: number }) {
  const qc = useQueryClient()
  const isClosed = ['closed', 'cancelled'].includes(ticket.status)

  // ── Dispatched vehicle editing ────────────────────────────────────────────
  const [editingDispatch, setEditingDispatch] = useState(false)
  const [pendingVehicles, setPendingVehicles] = useState<number[]>([])

  // ── Trip-log form ─────────────────────────────────────────────────────────
  const [showLogForm, setShowLogForm] = useState(false)
  const [logVehicleId, setLogVehicleId] = useState<number | ''>('')
  const [logDate, setLogDate] = useState(new Date().toISOString().slice(0, 10))
  const [odoStart, setOdoStart] = useState<number | ''>('')
  const [odoEnd, setOdoEnd] = useState<number | ''>('')
  const [fuelLiters, setFuelLiters] = useState<number | ''>('')
  const [fuelCost, setFuelCost] = useState<number | ''>('')
  const [logNotes, setLogNotes] = useState('')

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: allVehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ['vehicles-active'],
    queryFn: () =>
      apiClient.get(TICKETS.VEHICLES, { params: { is_active: true, page_size: 100 } }).then(r =>
        Array.isArray(r.data) ? r.data : (r.data.results ?? r.data.data ?? [])
      ),
  })

  const { data: logs = [] } = useQuery<VehicleLog[]>({
    queryKey: ['ticket-vehicle-logs', ticketId],
    queryFn: () =>
      apiClient.get(TICKETS.VEHICLE_TICKET_LOGS(ticketId)).then(r =>
        Array.isArray(r.data) ? r.data : (r.data.results ?? r.data.data ?? [])
      ),
    enabled: !!ticketId,
  })

  // ── Dispatch mutation — PATCH ticket's vehicles M2M ───────────────────────
  const dispatchMutation = useMutation({
    mutationFn: () => apiClient.patch(TICKETS.DETAIL(ticketId), { vehicles: pendingVehicles }),
    onSuccess: () => {
      toast.success('Dispatched vehicles updated')
      setEditingDispatch(false)
      qc.invalidateQueries({ queryKey: ['ticket', String(ticketId)] })
    },
    onError: () => toast.error('Failed to update vehicles'),
  })

  function openDispatchEdit() {
    setPendingVehicles(ticket.vehicles ?? [])
    setEditingDispatch(true)
  }
  function togglePending(id: number) {
    setPendingVehicles(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  }

  // ── Trip-log mutations ────────────────────────────────────────────────────
  function resetLogForm() {
    // Default to first dispatched vehicle when there's exactly one
    setLogVehicleId(ticket.vehicles?.length === 1 ? ticket.vehicles[0] : '')
    setLogDate(new Date().toISOString().slice(0, 10))
    setOdoStart('')
    setOdoEnd('')
    setFuelLiters('')
    setFuelCost('')
    setLogNotes('')
    setShowLogForm(false)
  }

  const addLogMutation = useMutation({
    mutationFn: () =>
      apiClient.post(TICKETS.VEHICLE_LOGS, {
        vehicle: logVehicleId,
        ticket: ticketId,
        date: logDate,
        odometer_start: odoStart,
        odometer_end: odoEnd,
        ...(fuelLiters !== '' ? { fuel_liters: fuelLiters } : {}),
        ...(fuelCost !== '' ? { fuel_cost: fuelCost } : {}),
        notes: logNotes,
      }),
    onSuccess: () => {
      toast.success('Trip log saved')
      resetLogForm()
      qc.invalidateQueries({ queryKey: ['ticket-vehicle-logs', ticketId] })
    },
    onError: () => toast.error('Failed to save trip log'),
  })

  const removeLogMutation = useMutation({
    mutationFn: (logId: number) => apiClient.delete(TICKETS.VEHICLE_LOG_DETAIL(logId)),
    onSuccess: () => {
      toast.success('Log removed')
      qc.invalidateQueries({ queryKey: ['ticket-vehicle-logs', ticketId] })
    },
    onError: () => toast.error('Failed to remove log'),
  })

  // ── Derived ───────────────────────────────────────────────────────────────
  const dispatchedVehicles = ticket.vehicle_names ?? []
  const totalBilling = logs.reduce((s, l) => s + l.billing_amount, 0)
  const selectedLogVehicle = allVehicles.find(v => v.id === logVehicleId)
  const previewKm =
    odoEnd !== '' && odoStart !== ''
      ? Math.max(Number(odoEnd) - Number(odoStart), 0)
      : null
  const previewBilling =
    previewKm !== null && selectedLogVehicle
      ? (previewKm * parseFloat(selectedLogVehicle.rate_per_km)).toFixed(2)
      : null

  // For the log form: show dispatched vehicles first (in a group), then the rest
  const dispatchedIds = new Set(ticket.vehicles ?? [])
  const logVehicleOptions = [
    ...allVehicles.filter(v => dispatchedIds.has(v.id)),
    ...allVehicles.filter(v => !dispatchedIds.has(v.id)),
  ]

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* ── Section header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
          <Car size={16} className="text-sky-500" /> Vehicles
        </h2>
      </div>

      {/* ── Part 1: Dispatched Vehicles ─────────────────────────────────────── */}
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Dispatched</p>
          {!isClosed && !editingDispatch && (
            <button
              onClick={openDispatchEdit}
              className="text-xs text-sky-600 hover:text-sky-800 underline"
            >
              Edit
            </button>
          )}
        </div>

        {!editingDispatch ? (
          // Display mode
          dispatchedVehicles.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No vehicles dispatched for this ticket.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {dispatchedVehicles.map(v => (
                <span
                  key={v.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-sky-50 border border-sky-200 text-sky-800 text-xs font-medium rounded-full"
                >
                  <Car size={11} />
                  {v.name}
                  {v.plate_number && (
                    <span className="text-sky-500 font-normal">· {v.plate_number}</span>
                  )}
                </span>
              ))}
            </div>
          )
        ) : (
          // Edit mode — multi-toggle picker
          <div className="space-y-2">
            {allVehicles.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No active vehicles registered.</p>
            ) : (
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                {allVehicles.map(v => {
                  const sel = pendingVehicles.includes(v.id)
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => togglePending(v.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                        sel ? 'bg-sky-50' : 'bg-white hover:bg-gray-50'
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs ${
                        sel ? 'bg-sky-600 text-white' : 'bg-gray-200 text-gray-500'
                      }`}>
                        {sel ? '✓' : <Car size={11} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm font-medium ${ sel ? 'text-sky-800' : 'text-gray-700'}`}>
                          {v.name}
                        </span>
                        {v.plate_number && (
                          <span className="ml-1.5 text-xs text-gray-400">{v.plate_number}</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-400">{v.type} · Rs.{v.rate_per_km}/km</span>
                    </button>
                  )
                })}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => dispatchMutation.mutate()}
                disabled={dispatchMutation.isPending}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-50 transition"
              >
                {dispatchMutation.isPending && <Loader2 size={12} className="animate-spin" />}
                Save
              </button>
              <button
                onClick={() => setEditingDispatch(false)}
                className="px-4 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Part 2: Trip Logs ───────────────────────────────────────────────── */}
      <div className="px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Trip Logs</p>
          {!isClosed && !showLogForm && (
            <button
              onClick={() => {
                // Pre-fill vehicle when only one is dispatched
                setLogVehicleId(ticket.vehicles?.length === 1 ? ticket.vehicles[0] : '')
                setShowLogForm(true)
              }}
              className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-800 underline"
            >
              <Plus size={11} /> Log Trip
            </button>
          )}
        </div>

        {/* Log list */}
        {logs.length === 0 && !showLogForm && (
          <p className="text-sm text-gray-400 italic">No trip logs recorded yet.</p>
        )}
        {logs.length > 0 && (
          <div className="divide-y divide-gray-100 mb-3">
            {logs.map(log => (
              <div key={log.id} className="py-3 flex items-start gap-3">
                {/* Vehicle colour dot */}
                <div className="w-7 h-7 rounded-full bg-sky-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Car size={12} className="text-sky-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-sm font-medium text-gray-800">{log.vehicle_name}</span>
                    <span className="text-xs text-gray-400">{log.date}</span>
                    {log.driven_by_name && (
                      <span className="text-xs text-gray-500">· {log.driven_by_name}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <MapPin size={10} /> {log.distance_km.toFixed(1)} km
                    </span>
                    <span className="font-medium text-gray-700">Rs. {log.billing_amount.toFixed(2)}</span>
                    {log.fuel_liters && <span>Fuel {log.fuel_liters} L</span>}
                    {log.fuel_cost && <span>Fuel cost Rs. {parseFloat(log.fuel_cost).toFixed(2)}</span>}
                    <span className="text-gray-300">Odo {log.odometer_start}→{log.odometer_end}</span>
                  </div>
                  {log.notes && (
                    <p className="text-xs text-gray-400 mt-0.5 italic">{log.notes}</p>
                  )}
                </div>
                {!isClosed && (
                  <button
                    onClick={() => removeLogMutation.mutate(log.id)}
                    disabled={removeLogMutation.isPending}
                    className="text-red-400 hover:text-red-600 transition flex-shrink-0 mt-0.5"
                    title="Remove log"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
            {/* Total */}
            <div className="flex items-center justify-between pt-2.5 text-sm font-semibold text-gray-800">
              <span>Total Trip Billing</span>
              <span>Rs. {totalBilling.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Add trip-log form */}
        {showLogForm && !isClosed && (
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-600">New Trip Log</p>
            <div className="grid grid-cols-2 gap-3">
              {/* Vehicle — dispatched ones listed first */}
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">
                  Vehicle <span className="text-red-400">*</span>
                  {dispatchedVehicles.length > 0 && (
                    <span className="ml-1 text-sky-500">(dispatched first)</span>
                  )}
                </label>
                <select
                  value={logVehicleId}
                  onChange={e => setLogVehicleId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="">— Select vehicle —</option>
                  {dispatchedIds.size > 0 && (
                    <optgroup label="Dispatched for this ticket">
                      {logVehicleOptions
                        .filter(v => dispatchedIds.has(v.id))
                        .map(v => (
                          <option key={v.id} value={v.id}>
                            {v.name}{v.plate_number ? ` (${v.plate_number})` : ''} · Rs.{v.rate_per_km}/km
                          </option>
                        ))}
                    </optgroup>
                  )}
                  {logVehicleOptions.filter(v => !dispatchedIds.has(v.id)).length > 0 && (
                    <optgroup label="Other vehicles">
                      {logVehicleOptions
                        .filter(v => !dispatchedIds.has(v.id))
                        .map(v => (
                          <option key={v.id} value={v.id}>
                            {v.name}{v.plate_number ? ` (${v.plate_number})` : ''} · Rs.{v.rate_per_km}/km
                          </option>
                        ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Date <span className="text-red-400">*</span></label>
                <input
                  type="date"
                  value={logDate}
                  onChange={e => setLogDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {/* Odometer Start */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Odo Start (km) <span className="text-red-400">*</span></label>
                <input
                  type="number" min={0} step={0.1}
                  value={odoStart}
                  onChange={e => setOdoStart(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="e.g. 12000"
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {/* Odometer End */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Odo End (km) <span className="text-red-400">*</span></label>
                <input
                  type="number" min={0} step={0.1}
                  value={odoEnd}
                  onChange={e => setOdoEnd(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="e.g. 12045"
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {/* Live preview */}
              {previewKm !== null && (
                <div className="col-span-2 flex items-center gap-3 bg-sky-50 rounded-lg px-3 py-2 text-xs text-sky-700 font-medium">
                  <MapPin size={11} />
                  {previewKm.toFixed(1)} km
                  {previewBilling !== null && <> · Rs. {previewBilling} billing</>}
                </div>
              )}

              {/* Fuel */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Fuel (L)</label>
                <input
                  type="number" min={0} step={0.1}
                  value={fuelLiters}
                  onChange={e => setFuelLiters(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="optional"
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {/* Fuel cost */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Fuel Cost (Rs.)</label>
                <input
                  type="number" min={0} step={0.01}
                  value={fuelCost}
                  onChange={e => setFuelCost(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="optional"
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {/* Notes */}
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={logNotes}
                  onChange={e => setLogNotes(e.target.value)}
                  placeholder="Optional trip notes…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => addLogMutation.mutate()}
                disabled={!logVehicleId || odoStart === '' || odoEnd === '' || !logDate || addLogMutation.isPending}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-50 transition"
              >
                {addLogMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                Save Log
              </button>
              <button
                onClick={resetLogForm}
                className="px-4 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Close Ticket Modal ───────────────────────────────────────────────────────

function CloseTicketModal({ ticketId, open, onClose, onDone }: {
  ticketId: number
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [coinAmount, setCoinAmount] = useState<number | ''>('')
  const [reason, setReason] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.post(TICKETS.CLOSE(ticketId), {
        coin_amount: Number(coinAmount),
        reason,
      }),
    onSuccess: () => {
      toast.success('Ticket closed and coins awarded!')
      setCoinAmount('')
      setReason('')
      onDone()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg ?? 'Failed to close ticket')
    },
  })

  return (
    <Modal open={open} onClose={onClose} title="Close Ticket & Award Coins">
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Closing this ticket will mark it as <span className="font-medium text-gray-700">Closed</span> and
          immediately credit the assigned staff member with the specified coins.
        </p>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Coin Amount <span className="text-red-400">*</span>
          </label>
          <input
            type="number"
            min={0}
            step={1}
            value={coinAmount}
            onChange={e => setCoinAmount(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder="e.g. 10"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Reason / Note</label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            placeholder="Optional note for the coin award…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => mutation.mutate()}
            disabled={coinAmount === '' || coinAmount < 0 || mutation.isPending}
            className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 transition"
          >
            {mutation.isPending && <Loader2 size={13} className="animate-spin" />}
            Close Ticket
          </button>
          <button
            onClick={onClose}
            className="flex-1 border border-gray-300 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>()
  const ticketId = Number(id)
  const qc = useQueryClient()

  const { isManager } = usePermissions()
  const user = useAuthStore((s) => s.user)
  const managerView = isManager

  const [commentBody, setCommentBody] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [showAssign, setShowAssign] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [newStatus, setNewStatus] = useState('')
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [commentFiles, setCommentFiles] = useState<File[]>([])
  const commentFileRef = useRef<HTMLInputElement>(null)
  const attachFileRef = useRef<HTMLInputElement>(null)
  const [uploadingAttach, setUploadingAttach] = useState(false)
  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: ticket, isLoading } = useQuery<TicketDetail>({
    queryKey: ['ticket', id],
    queryFn: () =>
      apiClient.get(TICKETS.DETAIL(ticketId)).then(r => r.data.data ?? r.data),
    enabled: !!id,
  })

  const { data: comments = [], isLoading: commentsLoading } = useQuery<Comment[]>({
    queryKey: ['ticket-comments', id],
    queryFn: () =>
      apiClient.get(TICKETS.COMMENTS(ticketId)).then(r =>
        Array.isArray(r.data) ? r.data : (r.data.results ?? r.data.data ?? [])
      ),
    enabled: !!id,
  })

  const { data: timeline = [], isLoading: timelineLoading } = useQuery<TimelineEvent[]>({
    queryKey: ['ticket-timeline', id],
    queryFn: () =>
      apiClient.get(TICKETS.TIMELINE(ticketId)).then(r => r.data.data ?? r.data),
    enabled: !!id,
  })

  const { data: attachments = [] } = useQuery<TicketAttachment[]>({
    queryKey: ['ticket-attachments', id],
    queryFn: () =>
      apiClient.get(TICKETS.TICKET_ATTACHMENTS(ticketId)).then(r =>
        Array.isArray(r.data) ? r.data : (r.data.results ?? r.data.data ?? [])
      ),
    enabled: !!id,
  })

  // ── Mutations ─────────────────────────────────────────────────────────────

  const statusMutation = useMutation({
    mutationFn: (s: string) => apiClient.post(TICKETS.STATUS(ticketId), { status: s }),
    onSuccess: () => {
      toast.success('Status updated')
      qc.invalidateQueries({ queryKey: ['ticket', id] })
      qc.invalidateQueries({ queryKey: ['ticket-timeline', id] })
      setNewStatus('')
    },
    onError: () => toast.error('Failed to update status'),
  })

  const commentMutation = useMutation({
    mutationFn: async () => {
      // Upload any attached files first as ticket attachments
      const uploadedRefs: Array<{ file_url: string; file_name: string; file_size: number }> = []
      for (const file of commentFiles) {
        const fd = new FormData()
        fd.append('file', file)
        const res = await apiClient.post(TICKETS.TICKET_ATTACHMENTS(ticketId), fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        uploadedRefs.push({
          file_url: res.data.url,
          file_name: res.data.file_name || file.name,
          file_size: res.data.file_size || file.size,
        })
      }
      return apiClient.post(TICKETS.COMMENTS(ticketId), {
        body: commentBody,
        is_internal: isInternal,
        ...(uploadedRefs.length > 0 ? { attachments: uploadedRefs } : {}),
      })
    },
    onSuccess: () => {
      toast.success('Comment added')
      setCommentBody('')
      setIsInternal(false)
      setCommentFiles([])
      qc.invalidateQueries({ queryKey: ['ticket-comments', id] })
      qc.invalidateQueries({ queryKey: ['ticket-attachments', id] })
      qc.invalidateQueries({ queryKey: ['ticket-timeline', id] })
    },
    onError: () => toast.error('Failed to add comment'),
  })

  async function handleAttachmentUpload(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploadingAttach(true)
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.append('file', file)
        await apiClient.post(TICKETS.TICKET_ATTACHMENTS(ticketId), fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }
      toast.success('File(s) uploaded')
      qc.invalidateQueries({ queryKey: ['ticket-attachments', id] })
    } catch {
      toast.error('Upload failed')
    } finally {
      setUploadingAttach(false)
      if (attachFileRef.current) attachFileRef.current.value = ''
    }
  }

  async function deleteAttachment(attachId: number) {
    await apiClient.delete(TICKETS.TICKET_ATTACHMENT_DETAIL(ticketId, attachId))
    qc.invalidateQueries({ queryKey: ['ticket-attachments', id] })
    toast.success('Removed')
  }

  function refreshAll() {
    qc.invalidateQueries({ queryKey: ['ticket', id] })
    qc.invalidateQueries({ queryKey: ['ticket-timeline', id] })
  }

  // ── Loading / Error states ────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-indigo-400" />
      </div>
    )
  }

  if (!ticket) {
    return <div className="p-6 text-center text-red-500">Ticket not found.</div>
  }

  return (
    <div className="-mx-6 md:-mx-8 -mt-6 md:-mt-8 flex flex-col bg-gray-50">

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4">
        <Link
          to="/tickets"
          className="inline-flex items-center gap-1 text-sm text-indigo-500 hover:text-indigo-700"
        >
          <ArrowLeft size={15} /> Tickets
        </Link>
        <span className="text-gray-300">/</span>
        <span className="font-mono text-xs text-indigo-400">{ticket.ticket_number}</span>
        <h1 className="text-sm font-semibold text-gray-900 truncate flex-1">{ticket.title}</h1>

        {/* Status + priority badges */}
        <span className={`flex-shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[ticket.status]}`}>
          {STATUS_LABELS[ticket.status] ?? ticket.status}
        </span>
        <span className={`flex-shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${PRIORITY_COLORS[ticket.priority]}`}>
          {ticket.priority}
        </span>
        {ticket.sla_breached && (
          <span className="flex-shrink-0 flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
            <AlertCircle size={11} /> SLA Breached
          </span>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {managerView ? (
            <>
              <div className="flex items-center gap-1">
                <select
                  value={newStatus || ticket.status}
                  onChange={e => setNewStatus(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {Object.entries(STATUS_LABELS)
                    .filter(([v]) => v !== 'closed')
                    .map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <button
                  onClick={() => statusMutation.mutate(newStatus || ticket.status)}
                  disabled={statusMutation.isPending || !newStatus || newStatus === ticket.status}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
                >
                  {statusMutation.isPending && <Loader2 size={11} className="animate-spin" />}
                  Update
                </button>
              </div>
              {ticket.status === 'resolved' && (
                <button
                  onClick={() => setShowCloseModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
                >
                  <Coins size={13} /> Close &amp; Award Coins
                </button>
              )}
            </>
          ) : (
            ticket.assigned_to === user?.id &&
              ['in_progress', 'pending_customer'].includes(ticket.status) ? (
              <button
                onClick={() => statusMutation.mutate('resolved')}
                disabled={statusMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                {statusMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={13} />}
                Mark Resolved
              </button>
            ) : null
          )}
          <button
            onClick={() => setShowAssign(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-green-300 text-green-700 rounded-lg hover:bg-green-50 transition"
          >
            <UserCheck size={13} /> Assign
          </button>
          <button
            onClick={() => setShowTransfer(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-purple-300 text-purple-700 rounded-lg hover:bg-purple-50 transition"
          >
            <ArrowRightLeft size={13} /> Transfer
          </button>
        </div>
      </div>

      {/* ── Body: two panes ──────────────────────────────────────────────────── */}
      <div className="flex gap-0 items-start">

        {/* ── Left: scrollable details ──────────────────────────────────────── */}
        <div className="flex-1 p-6 space-y-5 min-w-0 pb-10">

          {/* Info card */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            {ticket.description && (
              <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed mb-4 pb-4 border-b border-gray-100">
                {ticket.description}
              </p>
            )}
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              {[
                { label: 'Type', value: ticket.ticket_type_name || '—' },
                { label: 'Customer', value: ticket.customer_name || '—' },
                { label: 'Department', value: ticket.department_name || '—' },
                { label: 'Assigned To', value: ticket.assigned_to_name || 'Unassigned' },
                { label: 'Created By', value: ticket.created_by_name || '—' },
                { label: 'SLA Deadline', value: ticket.sla_deadline ? formatDateTime(ticket.sla_deadline) : '—' },
                { label: 'Created', value: formatDateTime(ticket.created_at) },
                { label: 'Contact Phone', value: (ticket.contact_phone || ticket.customer_phone)
                    ? <a href={`tel:${ticket.contact_phone || ticket.customer_phone}`} className="text-indigo-600 hover:underline flex items-center gap-1"><Phone size={10} />{ticket.contact_phone || ticket.customer_phone}</a>
                    : '—'
                },
              ].map(item => (
                <div key={item.label} className="bg-gray-50 rounded-lg p-3">
                  <dt className="text-xs text-gray-400 mb-1">{item.label}</dt>
                  <dd className="text-gray-800 font-medium text-xs">{item.value}</dd>
                </div>
              ))}
              {(ticket.team_member_names?.length ?? 0) > 0 && (
                <div className="col-span-2 sm:col-span-3 bg-gray-50 rounded-lg p-3">
                  <dt className="text-xs text-gray-400 mb-1.5 flex items-center gap-1"><Users size={11} /> Team Members</dt>
                  <dd className="flex flex-wrap gap-1.5">
                    {ticket.team_member_names.map(name => (
                      <span key={name} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">{name}</span>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Products & Parts */}
          <TicketProductsPanel ticketId={ticketId} ticketStatus={ticket.status} />

          {/* Vehicles */}
          <TicketVehicleSection ticket={ticket} ticketId={ticketId} />

          {/* Attachments */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Paperclip size={15} className="text-gray-400" /> Attachments
              <button
                onClick={() => attachFileRef.current?.click()}
                disabled={uploadingAttach}
                className="ml-auto flex items-center gap-1.5 px-3 py-1 text-xs bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 disabled:opacity-50"
              >
                {uploadingAttach ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                {uploadingAttach ? 'Uploading…' : 'Upload'}
              </button>
            </h2>
            <input ref={attachFileRef} type="file" multiple className="hidden" onChange={e => handleAttachmentUpload(e.target.files)} />
            {attachments.length === 0 && <p className="text-sm text-gray-400">No attachments yet.</p>}
            <div className="space-y-2">
              {attachments.map(a => (
                <div key={a.id} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg">
                  <FileText size={15} className="text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 truncate">{a.file_name}</p>
                    <p className="text-xs text-gray-400">{a.file_size ? `${(a.file_size / 1024).toFixed(1)} KB · ` : ''}{a.uploaded_by_name}</p>
                  </div>
                  <a href={a.url} target="_blank" rel="noreferrer" className="text-indigo-500 hover:text-indigo-700 p-1" title="Download">
                    <Download size={14} />
                  </a>
                  <button onClick={() => deleteAttachment(a.id)} className="text-red-400 hover:text-red-600 p-1" title="Remove">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Clock size={15} className="text-gray-400" /> Activity Timeline
            </h2>
            {timelineLoading && <p className="text-sm text-gray-400">Loading…</p>}
            <div className="relative">
              <div className="absolute left-3.5 top-0 bottom-0 w-px bg-gray-200" />
              <ol className="space-y-4">
                {timeline.map(event => (
                  <li key={event.id} className="flex gap-3 relative">
                    <div className="w-7 h-7 rounded-full bg-white border border-gray-200 flex items-center justify-center flex-shrink-0 z-10">
                      {EVENT_ICONS[event.event_type] ?? <CircleDot size={13} className="text-gray-300" />}
                    </div>
                    <div className="flex-1 pt-0.5 pb-4">
                      <p className="text-xs text-gray-700 leading-snug">{event.description}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {event.actor_name && <span className="font-medium text-gray-500">{event.actor_name} · </span>}
                        {formatDateTime(event.created_at)}
                      </p>
                    </div>
                  </li>
                ))}
                {!timelineLoading && timeline.length === 0 && (
                  <li className="text-sm text-gray-400 pl-10">No events yet.</li>
                )}
              </ol>
            </div>
          </div>
        </div>

        {/* ── Right: Comments pane ──────────────────────────────────────────── */}
        <div className="w-96 flex-shrink-0 flex flex-col bg-white border-l border-gray-200 sticky top-[46px]" style={{ height: 'calc(100vh - 92px)' }}>

          {/* Pane header */}
          <div className="flex-shrink-0 px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
            <MessageSquare size={15} className="text-indigo-400" />
            <span className="font-semibold text-gray-800 text-sm">Comments</span>
            {comments.length > 0 && (
              <span className="ml-auto text-xs bg-indigo-100 text-indigo-600 font-medium px-2 py-0.5 rounded-full">
                {comments.length}
              </span>
            )}
          </div>

          {/* Comment list — scrollable */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
            {commentsLoading && <p className="text-sm text-gray-400 text-center py-8">Loading comments…</p>}
            {!commentsLoading && comments.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center py-16">
                <MessageSquare size={32} className="text-gray-200 mb-3" />
                <p className="text-sm text-gray-400">No comments yet.</p>
                <p className="text-xs text-gray-300 mt-1">Start the conversation below.</p>
              </div>
            )}
            {comments.map(c => (
              <div
                key={c.id}
                className={`rounded-xl p-3.5 text-sm ${
                  c.is_internal
                    ? 'bg-amber-50 border border-amber-200'
                    : 'bg-gray-50 border border-gray-100'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-indigo-600">
                      {(c.author_name || c.author_email || 'U').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="font-medium text-gray-800 text-xs truncate">
                    {c.author_name || c.author_email || 'Unknown'}
                  </span>
                  {c.is_internal && (
                    <span className="flex items-center gap-0.5 text-xs text-amber-600 font-medium flex-shrink-0">
                      <Lock size={9} /> Internal
                    </span>
                  )}
                  <span className="text-xs text-gray-400 ml-auto flex-shrink-0 text-right">
                    {formatDateTime(c.created_at)}
                  </span>
                </div>
                <p className="text-gray-700 whitespace-pre-wrap text-sm leading-relaxed">{c.body}</p>
                {c.attachments && c.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {c.attachments.map((att, i) => (
                      <a
                        key={i}
                        href={att.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-xs text-indigo-600 underline hover:text-indigo-800"
                      >
                        <Paperclip size={10} /> {att.file_name || 'attachment'}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Compose box — pinned at bottom */}
          <div className="flex-shrink-0 border-t border-gray-200 bg-white p-4 space-y-2.5">
            {/* Internal toggle strip */}
            {isInternal && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
                <Lock size={11} /> This comment is internal only
              </div>
            )}
            <textarea
              value={commentBody}
              onChange={e => setCommentBody(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && commentBody.trim()) {
                  e.preventDefault()
                  commentMutation.mutate()
                }
              }}
              rows={3}
              placeholder="Write a comment… (⌘+Enter to send)"
              className={`w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 transition ${
                isInternal
                  ? 'border-amber-300 bg-amber-50/50 focus:ring-amber-400'
                  : 'border-gray-300 focus:ring-indigo-500'
              }`}
            />
            {/* Attached files preview */}
            <input
              ref={commentFileRef}
              type="file"
              multiple
              className="hidden"
              onChange={e => {
                setCommentFiles(prev => [...prev, ...Array.from(e.target.files ?? [])])
                e.target.value = ''
              }}
            />
            {commentFiles.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {commentFiles.map((f, i) => (
                  <span
                    key={i}
                    className="flex items-center gap-1 text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full"
                  >
                    <Paperclip size={10} /> {f.name}
                    <button
                      onClick={() => setCommentFiles(p => p.filter((_, j) => j !== i))}
                      className="ml-0.5 hover:text-red-500"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isInternal}
                    onChange={e => setIsInternal(e.target.checked)}
                    className="rounded text-amber-500 border-gray-300"
                  />
                  <Lock size={10} /> Internal
                </label>
                <button
                  onClick={() => commentFileRef.current?.click()}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50"
                  title="Attach file"
                >
                  <Paperclip size={11} /> Attach
                </button>
              </div>
              <button
                onClick={() => commentMutation.mutate()}
                disabled={!commentBody.trim() || commentMutation.isPending}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition font-medium"
              >
                {commentMutation.isPending
                  ? <Loader2 size={13} className="animate-spin" />
                  : <Send size={13} />
                }
                {commentMutation.isPending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <AssignModal
        ticketId={ticketId}
        currentAssignee={ticket.assigned_to}
        currentTeamMembers={ticket.team_members ?? []}
        open={showAssign}
        onClose={() => setShowAssign(false)}
        onDone={() => { setShowAssign(false); refreshAll() }}
      />
      <TransferModal
        ticketId={ticketId}
        open={showTransfer}
        onClose={() => setShowTransfer(false)}
        onDone={() => { setShowTransfer(false); refreshAll() }}
      />
      <CloseTicketModal
        ticketId={ticketId}
        open={showCloseModal}
        onClose={() => setShowCloseModal(false)}
        onDone={() => { setShowCloseModal(false); refreshAll() }}
      />
    </div>
  )
}

