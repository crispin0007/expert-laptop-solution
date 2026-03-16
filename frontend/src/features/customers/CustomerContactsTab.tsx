import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus, Pencil, Trash2, Star } from 'lucide-react'
import apiClient from '../../api/client'
import Modal from '../../components/Modal'
import { usePermissions } from '../../hooks/usePermissions'

interface Contact {
  id: number
  name: string
  email: string
  phone: string
  designation: string
  is_primary: boolean
}

interface Props {
  customerId: number
}

const EMPTY = { name: '', email: '', phone: '', designation: '', is_primary: false }

export default function CustomerContactsTab({ customerId }: Props) {
  const qc = useQueryClient()
  const { can } = usePermissions()
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<Contact | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null)
  const [form, setForm] = useState(EMPTY)

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ['customers', customerId, 'contacts'],
    queryFn: async () => {
      const res = await apiClient.get(`/customers/${customerId}/contacts/`)
      const raw = res.data?.data ?? res.data
      return Array.isArray(raw) ? raw : (raw?.results ?? [])
    },
  })

  function openCreate() { setForm(EMPTY); setShowForm(true); setEditTarget(null) }
  function openEdit(c: Contact) {
    setForm({ name: c.name, email: c.email, phone: c.phone, designation: c.designation, is_primary: c.is_primary })
    setEditTarget(c)
    setShowForm(true)
  }

  const saveMutation = useMutation({
    mutationFn: (payload: typeof EMPTY) =>
      editTarget
        ? apiClient.patch(`/customers/${customerId}/contacts/${editTarget.id}/`, payload)
        : apiClient.post(`/customers/${customerId}/contacts/`, payload),
    onSuccess: () => {
      toast.success(editTarget ? 'Contact updated' : 'Contact added')
      qc.invalidateQueries({ queryKey: ['customers', customerId, 'contacts'] })
      setShowForm(false)
      setEditTarget(null)
    },
    onError: () => toast.error('Failed to save contact'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/customers/${customerId}/contacts/${id}/`),
    onSuccess: () => {
      toast.success('Contact removed')
      setDeleteTarget(null)
      qc.invalidateQueries({ queryKey: ['customers', customerId, 'contacts'] })
    },
    onError: () => toast.error('Failed to delete contact'),
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">{contacts.length} contact{contacts.length !== 1 ? 's' : ''}</p>
        {can('can_update_customers') && (
          <button onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">
            <Plus size={14} /> Add Contact
          </button>
        )}
      </div>

      {contacts.length === 0 && (
        <p className="text-center text-gray-400 py-8 text-sm">No contacts yet.</p>
      )}

      <div className="space-y-2">
        {contacts.map(c => (
          <div key={c.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3 border border-gray-100">
            <div className="flex items-center gap-3">
              {c.is_primary && <Star size={13} className="text-amber-400 fill-amber-400 flex-shrink-0" />}
              <div>
                <p className="text-sm font-medium text-gray-900 flex items-center gap-1">
                  {c.name}
                  {c.designation && <span className="text-xs text-gray-400">· {c.designation}</span>}
                </p>
                <p className="text-xs text-gray-400">{c.email}{c.phone ? ` · ${c.phone}` : ''}</p>
              </div>
            </div>
            <div className="flex gap-1">
              {can('can_update_customers') && (
                <>
                  <button onClick={() => openEdit(c)} className="p-1.5 rounded hover:bg-white text-gray-400">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => setDeleteTarget(c)} className="p-1.5 rounded hover:bg-red-50 text-red-400">
                    <Trash2 size={13} />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add/Edit modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editTarget ? 'Edit Contact' : 'Add Contact'} width="max-w-md">
        <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(form) }} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input type="text" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Designation</label>
              <input type="text" value={form.designation} onChange={e => setForm(f => ({ ...f, designation: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. CEO" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_primary} onChange={e => setForm(f => ({ ...f, is_primary: e.target.checked }))}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
            <span className="text-sm text-gray-700">Primary contact</span>
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saveMutation.isPending}
              className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete confirm */}
      <Modal open={deleteTarget !== null} onClose={() => setDeleteTarget(null)} title="Remove contact?" width="max-w-sm">
        <p className="text-sm text-gray-600 mb-6">
          Remove <span className="font-semibold text-gray-900">{deleteTarget?.name}</span>?
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setDeleteTarget(null)}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={() => deleteMutation.mutate(deleteTarget!.id)} disabled={deleteMutation.isPending}
            className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50">
            {deleteMutation.isPending ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
