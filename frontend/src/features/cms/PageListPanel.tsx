/**
 * frontend/src/features/cms/PageListPanel.tsx
 * List, create, publish/unpublish, and delete CMS pages.
 * Full drag-and-drop block builder is Phase 2 (GrapeJS integration).
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Plus, Eye, EyeOff, Trash2, FileText, Pencil, LayoutTemplate } from 'lucide-react'
import { useCMSPages, useCreateCMSPage, useDeleteCMSPage, usePublishCMSPage } from './hooks'
import type { CMSPageWritePayload, PageType } from './types'

const PAGE_TYPE_LABELS: Record<PageType, string> = {
  home:       'Home',
  standard:   'Standard',
  contact:    'Contact',
  blog_index: 'Blog Index',
  landing:    'Landing Page',
}

const BLANK: CMSPageWritePayload = {
  title: '',
  slug: '',
  page_type: 'standard',
  sort_order: 0,
  show_in_nav: true,
  is_published: false,
}

export default function PageListPanel() {
  const { data: pages = [], isLoading } = useCMSPages()
  const createMutation  = useCreateCMSPage()
  const deleteMutation  = useDeleteCMSPage()
  const publishMutation = usePublishCMSPage()
  const navigate = useNavigate()

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<CMSPageWritePayload>(BLANK)

  const set = (k: keyof CMSPageWritePayload) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }))

  const handleCreate = async () => {
    if (!form.title) { toast.error('Page title is required'); return }
    try {
      await createMutation.mutateAsync(form)
      toast.success('Page created')
      setForm(BLANK)
      setShowForm(false)
    } catch {
      toast.error('Failed to create page')
    }
  }

  const handleDelete = async (id: number, title: string) => {
    if (!confirm(`Delete page "${title}"? This cannot be undone.`)) return
    try {
      await deleteMutation.mutateAsync(id)
      toast.success('Page deleted')
    } catch {
      toast.error('Failed to delete page')
    }
  }

  const togglePublish = async (id: number, isPublished: boolean) => {
    try {
      await publishMutation.mutateAsync({ id, action: isPublished ? 'unpublish' : 'publish' })
      toast.success(isPublished ? 'Page unpublished' : 'Page published')
    } catch {
      toast.error('Failed to update page')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Pages</h2>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          <Plus size={14} /> New Page
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-white border border-indigo-100 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">Create Page</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
              <input className="input" value={form.title} onChange={set('title')} placeholder="About Us" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Slug</label>
              <input className="input" value={form.slug ?? ''} onChange={set('slug')} placeholder="about (auto-generated if blank)" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Page Type</label>
              <select className="input" value={form.page_type} onChange={set('page_type')}>
                {(Object.keys(PAGE_TYPE_LABELS) as PageType[]).map(t => (
                  <option key={t} value={t}>{PAGE_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sort Order</label>
              <input type="number" className="input" value={form.sort_order ?? 0}
                onChange={e => setForm(f => ({ ...f, sort_order: +e.target.value }))} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.show_in_nav ?? true} onChange={set('show_in_nav')} />
            Show in navigation
          </label>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
            <button onClick={handleCreate} disabled={createMutation.isPending}
              className="px-4 py-1.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {createMutation.isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Page list */}
      {isLoading ? (
        <p className="text-sm text-gray-500">Loading pages…</p>
      ) : pages.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
          <FileText className="mx-auto mb-2 text-gray-300" size={32} />
          <p className="text-sm text-gray-500">No pages yet. Create your first page above.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {[...pages].sort((a, b) => a.sort_order - b.sort_order).map(page => (
            <div key={page.id} className="flex items-center px-4 py-3 gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{page.title}</p>
                <p className="text-xs text-gray-500">{PAGE_TYPE_LABELS[page.page_type]} · /{page.slug || '(home)'}</p>
              </div>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${page.is_published ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                {page.is_published ? 'Published' : 'Draft'}
              </span>
              <button
                onClick={() => navigate(`/cms/pages/${page.id}/blocks`)}
                className="text-gray-400 hover:text-emerald-600 transition-colors"
                title="Manage sections"
              >
                <LayoutTemplate size={15} />
              </button>
              <button
                onClick={() => navigate(`/cms/pages/${page.id}/edit`)}
                className="text-gray-400 hover:text-indigo-600 transition-colors"
                title="Open GrapeJS visual editor"
              >
                <Pencil size={15} />
              </button>
              <button
                onClick={() => togglePublish(page.id, page.is_published)}
                className="text-gray-400 hover:text-indigo-600 transition-colors"
                title={page.is_published ? 'Unpublish' : 'Publish'}
              >
                {page.is_published ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
              <button
                onClick={() => handleDelete(page.id, page.title)}
                className="text-gray-400 hover:text-red-500 transition-colors"
                title="Delete page"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
