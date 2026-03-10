/**
 * frontend/src/features/cms/BlogManager.tsx
 * List, create, edit, publish, and delete blog posts.
 */
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Plus, Eye, EyeOff, Trash2, BookOpen } from 'lucide-react'
import {
  useCMSBlogPosts, useCreateCMSBlogPost, useUpdateCMSBlogPost,
  useDeleteCMSBlogPost, usePublishCMSBlogPost,
} from './hooks'
import type { CMSBlogPostWritePayload } from './types'

const BLANK: CMSBlogPostWritePayload = {
  title: '',
  slug: '',
  excerpt: '',
  body: '',
  tags: [],
  author_name: '',
  is_published: false,
}

export default function BlogManager() {
  const { data: posts = [], isLoading } = useCMSBlogPosts()
  const createMutation  = useCreateCMSBlogPost()
  const deleteMutation  = useDeleteCMSBlogPost()
  const publishMutation = usePublishCMSBlogPost()

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<CMSBlogPostWritePayload>(BLANK)
  const [tagInput, setTagInput] = useState('')

  const set = (k: keyof CMSBlogPostWritePayload) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))

  const addTag = () => {
    const t = tagInput.trim().toLowerCase()
    if (t && !(form.tags ?? []).includes(t)) {
      setForm(f => ({ ...f, tags: [...(f.tags ?? []), t] }))
    }
    setTagInput('')
  }

  const removeTag = (tag: string) =>
    setForm(f => ({ ...f, tags: (f.tags ?? []).filter(t => t !== tag) }))

  const handleCreate = async () => {
    if (!form.title) { toast.error('Title is required'); return }
    try {
      await createMutation.mutateAsync(form)
      toast.success('Blog post created')
      setForm(BLANK)
      setTagInput('')
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
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          <Plus size={14} /> New Post
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-white border border-indigo-100 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">New Blog Post</h3>
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
              <input className="input" value={form.author_name ?? ''} onChange={set('author_name')} />
            </div>
          </div>
          <div>
            <label className="label">Excerpt</label>
            <textarea className="input" rows={2} value={form.excerpt ?? ''} onChange={set('excerpt')} />
          </div>
          <div>
            <label className="label">Body (HTML)</label>
            <textarea className="input font-mono text-xs" rows={8} value={form.body ?? ''} onChange={set('body')}
              placeholder="<p>Start writing your post...</p>" />
          </div>
          {/* Tags */}
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
                    <button onClick={() => removeTag(tag)} className="hover:text-red-500">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm text-gray-600">Cancel</button>
            <button onClick={handleCreate} disabled={createMutation.isPending}
              className="px-4 py-1.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {createMutation.isPending ? 'Creating…' : 'Create Post'}
            </button>
          </div>
        </div>
      )}

      {/* Post list */}
      {isLoading ? (
        <p className="text-sm text-gray-500">Loading posts…</p>
      ) : activePosts.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
          <BookOpen className="mx-auto mb-2 text-gray-300" size={32} />
          <p className="text-sm text-gray-500">No blog posts yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {activePosts.map(post => (
            <div key={post.id} className="flex items-center px-4 py-3 gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{post.title}</p>
                <p className="text-xs text-gray-500 truncate">
                  {post.author_name && <span>by {post.author_name} · </span>}
                  {(post.tags ?? []).join(', ') || 'no tags'}
                </p>
              </div>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${post.is_published ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                {post.is_published ? 'Published' : 'Draft'}
              </span>
              <button onClick={() => togglePublish(post.id, post.is_published)}
                className="text-gray-400 hover:text-indigo-600" title={post.is_published ? 'Unpublish' : 'Publish'}>
                {post.is_published ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
              <button onClick={() => handleDelete(post.id, post.title)}
                className="text-gray-400 hover:text-red-500" title="Delete">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
