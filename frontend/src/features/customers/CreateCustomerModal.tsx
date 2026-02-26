import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import Modal from '../../components/Modal'
import apiClient from '../../api/client'
import NepalAddressFields, { type NepalAddressValue } from './NepalAddressFields'

interface Props {
  open: boolean
  onClose: () => void
}

const CUSTOMER_TYPES = [
  { value: 'individual',   label: 'Individual'   },
  { value: 'organization', label: 'Organization' },
]

const EMPTY_ADDRESS: NepalAddressValue = {
  province:     '',
  district:     '',
  municipality: '',
  ward_no:      '',
  street:       '',
}

const EMPTY_FORM = {
  type:       'individual',
  name:       '',
  email:      '',
  phone:      '',
  tax_number: '',   // maps to pan_number on submit
  notes:      '',
}

export default function CreateCustomerModal({ open, onClose }: Props) {
  const qc = useQueryClient()
  const [form, setForm]       = useState(EMPTY_FORM)
  const [address, setAddress] = useState<NepalAddressValue>(EMPTY_ADDRESS)
  const [errors, setErrors]   = useState<Record<string, string>>({})

  const isOrg = form.type === 'organization'

  function field(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }))
  }

  const mutation = useMutation({
    mutationFn: (payload: Record<string, string>) => apiClient.post('/customers/', payload),
    onSuccess: () => {
      toast.success('Customer created')
      qc.invalidateQueries({ queryKey: ['customers'] })
      setForm(EMPTY_FORM)
      setAddress(EMPTY_ADDRESS)
      setErrors({})
      onClose()
    },
    onError: (err: any) => {
      const data = err.response?.data
      if (data && typeof data === 'object') {
        const fieldErrors: Record<string, string> = {}
        for (const [k, v] of Object.entries(data)) {
          // backend returns pan_number errors — map back to tax_number for display
          const displayKey = k === 'pan_number' ? 'tax_number' : k
          fieldErrors[displayKey] = Array.isArray(v) ? (v as string[]).join(' ') : String(v)
        }
        setErrors(fieldErrors)
        toast.error('Please fix the errors below')
      } else {
        toast.error('Failed to create customer')
      }
    },
  })

  function validate() {
    const errs: Record<string, string> = {}
    if (!form.name.trim())  errs.name  = 'Name is required'
    if (!form.phone.trim()) errs.phone = 'Phone is required'
    if (isOrg && !form.tax_number.trim()) errs.tax_number = 'PAN / VAT number is required for organizations'
    return errs
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})

    const payload: Record<string, string> = {
      type:  form.type,
      name:  form.name.trim(),
      phone: form.phone.trim(),
    }
    if (form.email.trim())           payload.email        = form.email.trim()
    if (address.province)            payload.province     = address.province
    if (address.district.trim())     payload.district     = address.district.trim()
    if (address.municipality.trim()) payload.municipality = address.municipality.trim()
    if (address.ward_no.trim())      payload.ward_no      = address.ward_no.trim()
    if (address.street.trim())       payload.street       = address.street.trim()
    if (form.tax_number.trim())      payload.pan_number   = form.tax_number.trim()
    if (form.notes.trim())           payload.notes        = form.notes.trim()

    mutation.mutate(payload)
  }

  function handleClose() {
    setForm(EMPTY_FORM)
    setAddress(EMPTY_ADDRESS)
    setErrors({})
    onClose()
  }

  const inputCls = (err?: string) =>
    `w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
      err ? 'border-red-400' : 'border-gray-300'
    }`

  return (
    <Modal open={open} onClose={handleClose} title="Add Customer" width="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Type toggle */}
        <div className="flex rounded-lg border border-gray-300 overflow-hidden">
          {CUSTOMER_TYPES.map(t => (
            <button type="button" key={t.value}
              onClick={() => { setForm(f => ({ ...f, type: t.value })); setErrors({}) }}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                form.type === t.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {isOrg ? 'Company Name' : 'Full Name'} <span className="text-red-500">*</span>
          </label>
          <input type="text" value={form.name} onChange={field('name')}
            placeholder={isOrg ? 'e.g. Acme Corp' : 'e.g. John Doe'}
            className={inputCls(errors.name)} />
          {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
        </div>

        {/* Email (optional) + Phone (required) */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
              <span className="ml-1 text-xs font-normal text-gray-400">(optional)</span>
            </label>
            <input type="email" value={form.email} onChange={field('email')}
              placeholder="e.g. ram@example.com"
              className={inputCls(errors.email)} />
            {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone <span className="text-red-500">*</span>
            </label>
            <input type="tel" value={form.phone} onChange={field('phone')}
              placeholder="e.g. 9841000000"
              className={inputCls(errors.phone)} />
            {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
          </div>
        </div>

        {/* Nepal hierarchical address */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">
            Address
            <span className="ml-1 text-xs font-normal text-gray-400">(optional)</span>
          </p>
          <NepalAddressFields
            value={address}
            onChange={setAddress}
            errors={errors as any}
          />
        </div>

        {/* PAN / VAT — organization only */}
        {isOrg && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              PAN / VAT Number <span className="text-red-500">*</span>
            </label>
            <input type="text" value={form.tax_number} onChange={field('tax_number')}
              placeholder="e.g. 123456789 or PAN123"
              className={inputCls(errors.tax_number)} />
            {errors.tax_number && <p className="text-xs text-red-500 mt-1">{errors.tax_number}</p>}
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea rows={2} value={form.notes} onChange={field('notes')}
            className={inputCls()} />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={handleClose}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button type="submit" disabled={mutation.isPending}
            className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {mutation.isPending ? 'Saving…' : 'Add Customer'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
