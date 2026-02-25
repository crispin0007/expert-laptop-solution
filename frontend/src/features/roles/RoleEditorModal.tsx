import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import apiClient from '../../api/client'
import { ROLES } from '../../api/endpoints'
import Modal from '../../components/Modal'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PermissionGroup {
  group: string
  keys: string[]
}

interface PermissionMapResponse {
  keys: Record<string, string>        // permission key → human label
  groups: PermissionGroup[]
}

interface Role {
  id?: number
  name: string
  description: string
  permissions: Record<string, boolean>
  is_system_role?: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  role: Role | null   // null = create new
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RoleEditorModal({ open, onClose, role }: Props) {
  const qc = useQueryClient()
  const isEdit = !!role?.id

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [permissions, setPermissions] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Load permission map from backend
  const { data: mapData } = useQuery<PermissionMapResponse>({
    queryKey: ['roles-permission-map'],
    queryFn: async () => {
      const res = await apiClient.get(ROLES.PERMISSION_MAP)
      return res.data
    },
    staleTime: 5 * 60 * 1000,
  })

  // Sync form state when role prop changes
  useEffect(() => {
    if (open) {
      setName(role?.name ?? '')
      setDescription(role?.description ?? '')
      // Initialise every key to false, then apply saved values
      const base: Record<string, boolean> = {}
      if (mapData) {
        for (const key of Object.keys(mapData.keys)) {
          base[key] = false
        }
      }
      setPermissions({ ...base, ...(role?.permissions ?? {}) })
      setErrors({})
    }
  }, [open, role, mapData])

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      isEdit
        ? apiClient.patch(ROLES.DETAIL(role!.id!), payload)
        : apiClient.post(ROLES.LIST, payload),
    onSuccess: () => {
      toast.success(isEdit ? 'Role updated' : 'Role created')
      qc.invalidateQueries({ queryKey: ['roles'] })
      onClose()
    },
    onError: (err: any) => {
      const data = err?.response?.data
      if (data && typeof data === 'object') {
        const errs: Record<string, string> = {}
        for (const [k, v] of Object.entries(data)) {
          errs[k] = Array.isArray(v) ? (v as string[]).join(' ') : String(v)
        }
        setErrors(errs)
        toast.error('Please fix the errors below')
      } else {
        toast.error('Failed to save role')
      }
    },
  })

  function toggle(key: string) {
    setPermissions(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function toggleGroup(keys: string[], value: boolean) {
    setPermissions(prev => {
      const next = { ...prev }
      for (const k of keys) next[k] = value
      return next
    })
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    saveMutation.mutate({ name: name.trim(), description: description.trim(), permissions })
  }

  const inp = (err?: string) =>
    `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
      err ? 'border-red-400' : 'border-gray-300'
    }`

  const groups = mapData?.groups ?? []
  const permMap = mapData?.keys ?? {}
  const isSystemRole = role?.is_system_role ?? false

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit Role — ${role?.name}` : 'Create Custom Role'}
      width="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Name + Description */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              disabled={isSystemRole}
              className={inp(errors.name)}
              placeholder="e.g. Finance Manager"
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className={inp()}
              placeholder="Optional short description"
            />
          </div>
        </div>

        {/* Permission groups */}
        <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
          {groups.map(group => {
            const allOn = group.keys.every(k => permissions[k])
            const anyOn = group.keys.some(k => permissions[k])
            return (
              <div key={group.group} className="border border-gray-200 rounded-xl overflow-hidden">
                {/* Group header */}
                <div className="flex items-center justify-between bg-gray-50 px-4 py-2.5 border-b border-gray-200">
                  <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    {group.group}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.keys, !allOn)}
                    className={`text-xs font-medium px-2 py-0.5 rounded-full transition-colors ${
                      allOn
                        ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                        : anyOn
                        ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                        : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                    }`}
                  >
                    {allOn ? 'Deselect all' : 'Select all'}
                  </button>
                </div>

                {/* Permission checkboxes */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3">
                  {group.keys.map(key => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={permissions[key] ?? false}
                        onChange={() => toggle(key)}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-gray-700 group-hover:text-gray-900 leading-snug">
                        {permMap[key] ?? key}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )
          })}

          {groups.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">Loading permissions…</p>
          )}
        </div>

        {errors.permissions && (
          <p className="text-xs text-red-500">{errors.permissions}</p>
        )}

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="px-5 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Role'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
