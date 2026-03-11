/**
 * frontend/src/features/cms/BlogManager.tsx
 * List, create, edit, publish, and delete blog posts.
 * Includes a full edit modal with a built-in rich-text body editor
 * and cover image file upload with live preview.
 */
import { useState, useRef, useCallback } from 'react'
import toast from 'react-hot-toast'
import {
  Plus, Eye, EyeOff, Trash2, BookOpen, Pencil, X,
  Bold, Italic, Underline, List, ListOrdered, Quote, Link,
  Heading1, Heading2, Heading3, Upload, ImageIcon,
} from 'lucide-react'
import {
  useCMSBlogPosts, useCreateCMSBlogPost, useUpdateCMSBlogPost,
  useDeleteCMSBlogPost, usePublishCMSBlogPost,
} from './hooks'
import type { CMSBlogPost, CMSBlogPostWritePayload } from './types'

// ── Built-in rich text editor (contentEditable, zero deps) ───────────────────
function RichTextEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)

  // Sync initial value into the editable div (only on first mount)
  const onRef = useCallback((el: HTMLDivElement | null) => {
    if (el && el.innerHTML !== value) {
      el.innerHTML = value ?? ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ;(ref as React.MutableRefObject<HTMLDivElement | null>).current = el
  }, []) // intentionally empty deps — runs once

  const exec = (cmd: string, val?: string) => {
    document.execCommand(cmd, false, val)
    ref.current?.focus()
    // Emit updated HTML
    if (ref.current) onChange(ref.current.innerHTML)
  }

  const ToolBtn = ({ label, icon, cmd, val }: {
    label: string; icon: React.ReactNode; cmd: string; val?: string
  }) => (
    <button type="button" title={label}
      onMouseDown={e => { e.preventDefault(); exec(cmd, val) }}
      className="p-1.5 rounded hover:bg-gray-200 text-gray-600 hover:text-gray-900 transition-colors">
      {icon}
    </button>
  )

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-gray-50 border-b border-gray-200">
        <ToolBtn label="Heading 1" icon={<Heading1 size={14} />} cmd="formatBlock" val="H1" />
        <ToolBtn label="Heading 2" icon={<Heading2 size={14} />} cmd="formatBlock" val="H2" />
        <ToolBtn label="Heading 3" icon={<Heading3 size={14} />} cmd="formatBlock" val="H3" />
        <span className="w-px h-4 bg-gray-300 mx-1" />
        <ToolBtn label="Bold" icon={<Bold size={14} />} cmd="bold" />
        <ToolBtn label="Italic" icon={<Italic size={14} />} cmd="italic" />
        <ToolBtn label="Underline" icon={<Underline size={14} />} cmd="underline" />
        <span className="w-px h-4 bg-gray-300 mx-1" />
        <ToolBtn label="Bullet list" icon={<List size={14} />} cmd="insertUnorderedList" />
        <ToolBtn label="Numbered list" icon={<ListOrdered size={14} />} cmd="insertOrderedList" />
        <ToolBtn label="Blockquote" icon={<Quote size={14} />} cmd="formatBlock" val="BLOCKQUOTE" />
        <span className="w-px h-4 bg-gray-300 mx-1" />
        <button type="button" title="Insert link"
          onMouseDown={e => {
            e.preventDefault()
            const url = prompt('Enter URL:', 'https://')
            if (url) exec('createLink', url)
          }}
          className="p-1.5 rounded hover:bg-gray-200 text-gray-600 hover:text-gray-900 transition-colors">
          <Link size={14} />
        </button>
        <ToolBtn label="Paragraph" icon={<span className="text-[11px] font-bold px-0.5">P</span>} cmd="formatBlock" val="P" />
      </div>
      {/* Editable area */}
      <div
        ref={onRef}
        contentEditable
        suppressContentEditableWarning
        onInput={e => onChange((e.target as HTMLDivElement).innerHTML)}
        className="min-h-[200px] px-4 py-3 text-sm text-gray-800 focus:outline-none prose prose-sm max-w-none"
        style={{ lineHeight: '1.7' }}
      />
    </div>
  )
}

const BLANK: CMSBlogPostWritePayload = {
  title: '', slug: '', excerpt: '', body: '', tags: [], author_name: '', is_published: false,
}

// ── Cover image upload row ────────────────────────────────────────────────────
function CoverImageField({
  value, onChange,
  file, onFileChange,
}: {
  value: string
  onChange: (url: string) => void
  file: File | null
  onFileChange: (f: File | null) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const previewSrc = file ? URL.createObjectURL(file) : (value || null)

  return (
    <div>
      <label className="label">Cover Image</label>

      {/* Preview */}
      {previewSrc && (
        <div className="relative mb-2">
          <img src={previewSrc} alt="Cover preview"
            className="w-full h-36 object-cover rounded-lg border border-gray-200" />
          <button
            type="button"
            onClick={() => { onFileChange(null); onChange('') }}
            className="absolute top-1.5 right-1.5 p-1 bg-white/90 rounded-full shadow text-gray-500 hover:text-red-500"
            title="Remove image"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Upload button */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg
            hover:bg-gray-50 text-gray-600 transition-colors"
        >
          <Upload size={13} />
          {file ? 'Change image' : 'Upload image'}
        </button>
        <input
          className="input flex-1 text-sm"
          value={file ? '' : value}
          onChange={e => { onFileChange(null); onChange(e.target.value) }}
          placeholder="…or paste an image URL"
          disabled={!!file}
        />
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0] ?? null
          if (f) { onFileChange(f); onChange('') }
          e.target.value = ''
        }}
      />
    </div>
  )
}

// ── Shared form used by both Create panel and Edit modal ─────────────────────
function BlogForm({
  form, setForm, tagInput, setTagInput,
  coverFile, onCoverFileChange,
  onSubmit, onCancel, isPending, isEdit,
}: {
  form: CMSBlogPostWritePayload
  setForm: React.Dispatch<React.SetStateAction<CMSBlogPostWritePayload>>
  tagInput: string
  setTagInput: (v: string) => void
  coverFile: File | null
  onCoverFileChange: (f: File | null) => void
  onSubmit: () => void
  onCancel: () => void
  isPending: boolean
  isEdit?: boolean
}) {
  const set = (k: keyof CMSBlogPostWritePayload) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))

  const addTag = () => {
    const t = tagInput.trim().toLowerCase()
    if (t && !(form.tags ?? []).includes(t)) setForm(f => ({ ...f, tags: [...(f.tags ?? []), t] }))
    setTagInput('')
  }
  const removeTag = (tag: string) =>
    setForm(f => ({ ...f, tags: (f.tags ?? []).filter(t => t !== tag) }))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Title *</label>
          <input className="input" value={form.title} onChange={set('title')} placeholder="My first post" />
        </div>
        <div>
          <label className="label">Slug (auto if blank)</label>
          <input className="input" value={form.slug ?? ''} onChange={set('slug')} placeholder="my-first-post" />
        </div>
        <div>
          <label className="label">Author Name</label>
          <input className="input" value={form.author_name ?? ''} onChange={set('author_name')} placeholder="Staff Writer" />
        </div>
      </div>

      {/* Cover image with file upload */}
      <CoverImageField
        value={form.featured_image ?? ''}
        onChange={url => setForm(f => ({ ...f, featured_image: url }))}
        file={coverFile}
        onFileChange={onCoverFileChange}
      />

      <div>
        <label className="label">Excerpt</label>
        <textarea className="input" rows={2} value={form.excerpt ?? ''} onChange={set('excerpt')}
          placeholder="Short summary shown in listings..." />
      </div>
      <div>
        <label className="label">Body (Rich Text)</label>
        <RichTextEditor value={form.body ?? ''} onChange={v => setForm(f => ({ ...f, body: v }))} />
      </div>
      <div>
        <label className="label">Tags</label>
        <div className="flex gap-2">
          <input className="input flex-1" value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
            placeholder="Add tag and press Enter" />
          <button onClick={addTag} className="px-3 py-1.5 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">Add</button>
        </div>
        {(form.tags ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {(form.tags ?? []).map(tag => (
              <span key={tag} className="flex items-center gap-1 px-2 py-0.5 text-xs bg-indigo-50 text-indigo-700 rounded-full">
                {tag}
                <button onClick={() => removeTag(tag)} className="hover:text-red-500">&times;</button>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-600">Cancel</button>
        <button onClick={onSubmit} disabled={isPending}
          className="px-4 py-1.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          {isPending ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save Changes' : 'Create Post')}
        </button>
      </div>
    </div>
  )
}

// ── Edit modal ────────────────────────────────────────────────────────────────
function EditPostModal({ post, onClose }: { post: CMSBlogPost; onClose: () => void }) {
  const [form, setForm] = useState<CMSBlogPostWritePayload>({
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt ?? '',
    body: post.body ?? '',
    featured_image: post.featured_image ?? '',
    tags: [...(post.tags ?? [])],
    author_name: post.author_name ?? '',
    is_published: post.is_published,
  })
  const [tagInput, setTagInput] = useState('')
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const updateMutation = useUpdateCMSBlogPost(post.id)

  const handleSave = async () => {
    if (!form.title) { toast.error('Title is required'); return }
    try {
      let payload: Partial<CMSBlogPostWritePayload> | FormData = form
      if (coverFile) {
        const fd = new FormData()
        Object.entries(form).forEach(([k, v]) => {
          if (k === 'featured_image') return // will be set from File
          if (Array.isArray(v)) fd.append(k, JSON.stringify(v))
          else if (v != null) fd.append(k, String(v))
        })
        fd.append('featured_image', coverFile, coverFile.name)
        payload = fd
      }
      await updateMutation.mutateAsync(payload)
      toast.success('Blog post updated')
      onClose()
    } catch {
      toast.error('Failed to save changes')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="font-semibold text-gray-900">Edit Blog Post</h3>
            <p className="text-xs text-gray-400 mt-0.5">"{post.title}"</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5 flex-1">
          <BlogForm
            form={form} setForm={setForm}
            tagInput={tagInput} setTagInput={setTagInput}
            coverFile={coverFile} onCoverFileChange={setCoverFile}
            onSubmit={handleSave} onCancel={onClose}
            isPending={updateMutation.isPending} isEdit
          />
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function BlogManager() {
  const { data: posts = [], isLoading } = useCMSBlogPosts()
  const createMutation  = useCreateCMSBlogPost()
  const deleteMutation  = useDeleteCMSBlogPost()
  const publishMutation = usePublishCMSBlogPost()

  const [showForm, setShowForm]       = useState(false)
  const [editingPost, setEditingPost] = useState<CMSBlogPost | null>(null)
  const [form, setForm]               = useState<CMSBlogPostWritePayload>(BLANK)
  const [tagInput, setTagInput]       = useState('')
  const [coverFile, setCoverFile]     = useState<File | null>(null)

  const handleCreate = async () => {
    if (!form.title) { toast.error('Title is required'); return }
    try {
      let payload: CMSBlogPostWritePayload | FormData = form
      if (coverFile) {
        const fd = new FormData()
        Object.entries(form).forEach(([k, v]) => {
          if (k === 'featured_image') return
          if (Array.isArray(v)) fd.append(k, JSON.stringify(v))
          else if (v != null) fd.append(k, String(v))
        })
        fd.append('featured_image', coverFile, coverFile.name)
        payload = fd
      }
      await createMutation.mutateAsync(payload)
      toast.success('Blog post created')
      setForm(BLANK)
      setTagInput('')
      setCoverFile(null)
      setShowForm(false)
    } catch {
      toast.error('Failed to create post')
    }
  }

  const handleDelete = async (id: number, title: string) => {
    if (!confirm(`Delete "${title}"?`)) return
    try {
      await deleteMutation.mutateAsync(id)
      toast.success('Post deleted')
    } catch {
      toast.error('Failed to delete post')
    }
  }

  const togglePublish = async (id: number, isPublished: boolean) => {
    try {
      await publishMutation.mutateAsync({ id, action: isPublished ? 'unpublish' : 'publish' })
      toast.success(isPublished ? 'Post unpublished' : 'Post published')
    } catch {
      toast.error('Failed to update post')
    }
  }

  const activePosts = posts.filter(p => !p.is_deleted)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Blog Posts ({activePosts.length})</h2>
        <button onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
          <Plus size={14} /> New Post
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-white border border-indigo-100 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">New Blog Post</h3>
          <BlogForm
            form={form} setForm={setForm}
            tagInput={tagInput} setTagInput={setTagInput}
            coverFile={coverFile} onCoverFileChange={setCoverFile}
            onSubmit={handleCreate}
            onCancel={() => { setShowForm(false); setForm(BLANK); setTagInput(''); setCoverFile(null) }}
            isPending={createMutation.isPending}
          />
        </div>
      )}

      {/* Post list */}
      {isLoading ? (
        <p className="text-sm text-gray-500">Loading posts...</p>
      ) : activePosts.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
          <BookOpen className="mx-auto mb-2 text-gray-300" size={32} />
          <p className="text-sm text-gray-500">No blog posts yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {activePosts.map(post => (
            <div key={post.id} className="flex items-center px-4 py-3 gap-3">
              {/* Cover thumbnail */}
              {post.featured_image ? (
                <img src={post.featured_image} alt="" className="w-12 h-10 rounded-lg object-cover shrink-0 border border-gray-100" />
              ) : (
                <div className="w-12 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                  <ImageIcon size={14} className="text-gray-300" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{post.title}</p>
                <p className="text-xs text-gray-500 truncate">
                  {post.author_name && <span>by {post.author_name} · </span>}
                  {(post.tags ?? []).join(', ') || 'no tags'}
                </p>
              </div>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                post.is_published ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {post.is_published ? 'Published' : 'Draft'}
              </span>
              {/* Edit */}
              <button onClick={() => setEditingPost(post)}
                className="p-1 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50" title="Edit post">
                <Pencil size={14} />
              </button>
              {/* Publish toggle */}
              <button onClick={() => togglePublish(post.id, post.is_published)}
                className="text-gray-400 hover:text-indigo-600" title={post.is_published ? 'Unpublish' : 'Publish'}>
                {post.is_published ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
              {/* Delete */}
              <button onClick={() => handleDelete(post.id, post.title)}
                className="text-gray-400 hover:text-red-500" title="Delete">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {editingPost && (
        <EditPostModal post={editingPost} onClose={() => setEditingPost(null)} />
      )}
    </div>
  )
}
