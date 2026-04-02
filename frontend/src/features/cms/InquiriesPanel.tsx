/**
 * frontend/src/features/cms/InquiriesPanel.tsx
 * Manage website contact form submissions (inquiries).
 *
 * Features: status-filter tabs, mark-read, reply note, convert to customer, delete.
 */
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Mail, UserPlus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import {
  useCMSInquiries,
  useUpdateCMSInquiry,
  useDeleteCMSInquiry,
  useConvertCMSInquiry,
} from './hooks'
import type { CMSInquiry, InquiryStatus } from './types'

const STATUS_TABS: { id: InquiryStatus | 'all'; label: string }[] = [
  { id: 'all',       label: 'All' },
  { id: 'new',       label: 'New' },
  { id: 'read',      label: 'Read' },
  { id: 'replied',   label: 'Replied' },
  { id: 'converted', label: 'Converted' },
  { id: 'archived',  label: 'Archived' },
]

const STATUS_BADGE: Record<InquiryStatus, string> = {
  new:       'bg-blue-100 text-blue-700',
  read:      'bg-gray-100 text-gray-600',
  replied:   'bg-green-100 text-green-700',
  converted: 'bg-emerald-100 text-emerald-700',
  archived:  'bg-yellow-50 text-yellow-700',
}

export default function InquiriesPanel() {
  const [activeStatus, setActiveStatus] = useState<InquiryStatus | 'all'>('all')
  const [expanded, setExpanded] = useState<number | null>(null)

  const { data: inquiries = [], isLoading } = useCMSInquiries(
    activeStatus === 'all' ? undefined : activeStatus,
  )
  const deleteMutation  = useDeleteCMSInquiry()
  const convertMutation = useConvertCMSInquiry()

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this inquiry?')) return
    try {
      await deleteMutation.mutateAsync(id)
      toast.success('Inquiry deleted')
      if (expanded === id) setExpanded(null)
    } catch {
      toast.error('Failed to delete inquiry')
    }
  }

  const handleConvert = async (id: number) => {
    try {
      await convertMutation.mutateAsync(id)
      toast.success('Converted to customer')
    } catch {
      toast.error('Failed to convert')
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
          Website Inquiries
        </h2>

        {/* Status tabs */}
        <div className="flex gap-1 border-b border-gray-200 mb-4 overflow-x-auto">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveStatus(tab.id)}
              className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                activeStatus === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {isLoading && <p className="text-sm text-gray-400">Loading…</p>}

        {!isLoading && inquiries.length === 0 && (
          <p className="text-sm text-gray-400 py-6 text-center">No inquiries found.</p>
        )}

        <div className="divide-y divide-gray-100">
          {inquiries.map(inquiry => (
            <InquiryRow
              key={inquiry.id}
              inquiry={inquiry}
              isExpanded={expanded === inquiry.id}
              onToggle={() => setExpanded(expanded === inquiry.id ? null : inquiry.id)}
              onDelete={() => handleDelete(inquiry.id)}
              onConvert={() => handleConvert(inquiry.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Inquiry Row ───────────────────────────────────────────────────────────────

function InquiryRow({
  inquiry,
  isExpanded,
  onToggle,
  onDelete,
  onConvert,
}: {
  inquiry: CMSInquiry
  isExpanded: boolean
  onToggle: () => void
  onDelete: () => void
  onConvert: () => void
}) {
  const [replyNote, setReplyNote] = useState(inquiry.reply_note || '')
  const updateMutation = useUpdateCMSInquiry(inquiry.id)

  const handleSaveReply = async () => {
    try {
      await updateMutation.mutateAsync({ status: 'replied', reply_note: replyNote })
      toast.success('Marked as replied')
    } catch {
      toast.error('Failed to save')
    }
  }

  const handleArchive = async () => {
    try {
      await updateMutation.mutateAsync({ status: 'archived' })
      toast.success('Archived')
    } catch {
      toast.error('Failed to archive')
    }
  }

  return (
    <div className="py-3">
      {/* Summary row */}
      <div className="flex items-start gap-3 cursor-pointer" onClick={onToggle}>
        <Mail size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-900">{inquiry.name}</span>
            <span className="text-xs text-gray-500">{inquiry.email}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_BADGE[inquiry.status]}`}>
              {inquiry.status}
            </span>
          </div>
          <p className="text-xs text-gray-500 truncate mt-0.5">
            {inquiry.subject || inquiry.message.slice(0, 80)}
          </p>
        </div>
        <span className="text-xs text-gray-400 flex-shrink-0">
          {new Date(inquiry.created_at).toLocaleDateString()}
        </span>
        {isExpanded ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="ml-7 mt-3 space-y-3">
          {inquiry.phone && (
            <p className="text-xs text-gray-600"><span className="font-medium">Phone:</span> {inquiry.phone}</p>
          )}
          {inquiry.source_page && (
            <p className="text-xs text-gray-600"><span className="font-medium">Source page:</span> {inquiry.source_page}</p>
          )}
          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap">
            {inquiry.message}
          </div>

          {/* Reply note */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Reply / Notes</label>
            <textarea
              className="input text-sm"
              rows={3}
              value={replyNote}
              onChange={e => setReplyNote(e.target.value)}
              placeholder="Internal note or reply summary…"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleSaveReply}
              disabled={updateMutation.isPending}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              Save &amp; Mark Replied
            </button>
            {inquiry.status !== 'converted' && (
              <button
                onClick={onConvert}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-emerald-600 text-emerald-700 hover:bg-emerald-50 transition-colors"
              >
                <UserPlus size={13} /> Convert to Customer
              </button>
            )}
            {inquiry.status !== 'archived' && (
              <button
                onClick={handleArchive}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Archive
              </button>
            )}
            <button
              onClick={onDelete}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg text-red-600 hover:bg-red-50 transition-colors ml-auto"
            >
              <Trash2 size={13} /> Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
