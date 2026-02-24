import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { KeyRound, Eye, EyeOff } from 'lucide-react'
import apiClient from '../../api/client'
import Modal from '../../components/Modal'

interface StaffMember {
  id: number
  email: string
  full_name: string
}

interface Props {
  open: boolean
  onClose: () => void
  staff: StaffMember | null
}

export default function ResetPasswordModal({ open, onClose, staff }: Props) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')

  function handleClose() {
    setPassword('')
    setConfirm('')
    setError('')
    onClose()
  }

  const mutation = useMutation({
    mutationFn: (pw: string) =>
      apiClient.post(`/staff/${staff!.id}/reset_password/`, { password: pw }),
    onSuccess: (res) => {
      toast.success(res.data?.detail ?? 'Password reset successfully')
      handleClose()
    },
    onError: (err: any) => {
      const data = err?.response?.data
      const msg = data?.password ?? data?.detail ?? 'Failed to reset password'
      setError(msg)
      toast.error(msg)
    },
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    mutation.mutate(password)
  }

  const inp = `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
    error ? 'border-red-400' : 'border-gray-300'
  }`

  return (
    <Modal open={open} onClose={handleClose}
      title={`Reset Password — ${staff?.full_name || staff?.email || ''}`}
      width="max-w-sm">
      <form onSubmit={handleSubmit} className="space-y-4">

        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <KeyRound size={16} className="text-amber-600 shrink-0" />
          <p className="text-xs text-amber-700">
            The new password will be emailed to <span className="font-semibold">{staff?.email}</span>.
            Ask them to change it after first login.
          </p>
        </div>

        {/* New password */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            New Password <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              className={inp + ' pr-10'} />
            <button type="button" onClick={() => setShowPw(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        {/* Confirm */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Confirm Password <span className="text-red-500">*</span>
          </label>
          <input
            type={showPw ? 'text' : 'password'}
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="Re-enter password"
            className={inp} />
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={handleClose}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button type="submit" disabled={mutation.isPending}
            className="px-5 py-2 text-sm text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50">
            {mutation.isPending ? 'Resetting…' : 'Reset Password'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
