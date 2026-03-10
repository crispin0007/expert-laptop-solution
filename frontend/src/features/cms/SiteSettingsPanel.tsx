/**
 * frontend/src/features/cms/SiteSettingsPanel.tsx
 * Edit site branding, theme, SEO defaults, and publish toggle.
 */
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useCMSSite, useUpdateCMSSite, usePublishCMSSite } from './hooks'
import type { CMSSiteWritePayload } from './types'

const FONT_OPTIONS = ['Inter', 'Roboto', 'Poppins', 'Lato', 'Open Sans', 'Merriweather', 'Playfair Display']
const THEME_OPTIONS = [
  { key: 'modern-indigo', label: 'Modern Indigo' },
  { key: 'corporate-blue', label: 'Corporate Blue' },
  { key: 'bold-slate', label: 'Bold Slate' },
  { key: 'warm-terracotta', label: 'Warm Terracotta' },
  { key: 'minimal-gray', label: 'Minimal Gray' },
]

export default function SiteSettingsPanel() {
  const { data: site, isLoading } = useCMSSite()
  const updateMutation  = useUpdateCMSSite()
  const publishMutation = usePublishCMSSite()

  const [form, setForm] = useState<CMSSiteWritePayload>({})

  useEffect(() => {
    if (site) {
      setForm({
        site_name:               site.site_name,
        tagline:                 site.tagline,
        theme_key:               site.theme_key,
        primary_color:           site.primary_color,
        secondary_color:         site.secondary_color,
        font_family:             site.font_family,
        default_meta_title:      site.default_meta_title,
        default_meta_description: site.default_meta_description,
        custom_head_script:      site.custom_head_script,
      })
    }
  }, [site])

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync(form)
      toast.success('Site settings saved')
    } catch {
      toast.error('Failed to save settings')
    }
  }

  const handlePublish = async () => {
    if (!site) return
    try {
      await publishMutation.mutateAsync(site.is_published ? 'unpublish' : 'publish')
      toast.success(site.is_published ? 'Site unpublished' : 'Site published')
    } catch {
      toast.error('Failed to update publish state')
    }
  }

  const set = (k: keyof CMSSiteWritePayload) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  if (isLoading) return <p className="text-gray-500 text-sm">Loading…</p>

  return (
    <div className="space-y-8">
      {/* Identity */}
      <Section title="Identity">
        <Field label="Site Name">
          <input className="input" value={form.site_name ?? ''} onChange={set('site_name')} placeholder="Acme Corp" />
        </Field>
        <Field label="Tagline">
          <input className="input" value={form.tagline ?? ''} onChange={set('tagline')} placeholder="Your one-stop shop for…" />
        </Field>
      </Section>

      {/* Theme */}
      <Section title="Theme">
        <Field label="Theme">
          <select className="input" value={form.theme_key ?? ''} onChange={set('theme_key')}>
            {THEME_OPTIONS.map(t => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Primary Colour">
            <div className="flex items-center gap-2">
              <input type="color" value={form.primary_color ?? '#4F46E5'} onChange={set('primary_color')}
                className="w-10 h-9 rounded border border-gray-300 cursor-pointer p-0.5" />
              <input className="input flex-1" value={form.primary_color ?? ''} onChange={set('primary_color')} />
            </div>
          </Field>
          <Field label="Secondary Colour">
            <div className="flex items-center gap-2">
              <input type="color" value={form.secondary_color ?? '#7C3AED'} onChange={set('secondary_color')}
                className="w-10 h-9 rounded border border-gray-300 cursor-pointer p-0.5" />
              <input className="input flex-1" value={form.secondary_color ?? ''} onChange={set('secondary_color')} />
            </div>
          </Field>
        </div>
        <Field label="Font Family">
          <select className="input" value={form.font_family ?? ''} onChange={set('font_family')}>
            {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </Field>
      </Section>

      {/* SEO */}
      <Section title="SEO Defaults">
        <Field label="Default Meta Title">
          <input className="input" value={form.default_meta_title ?? ''} onChange={set('default_meta_title')} />
        </Field>
        <Field label="Default Meta Description">
          <textarea className="input" rows={2} value={form.default_meta_description ?? ''} onChange={set('default_meta_description')} />
        </Field>
      </Section>

      {/* Scripts */}
      <Section title="Custom Head Script">
        <Field label="HTML / Script (injected in <head>)">
          <textarea className="input font-mono text-xs" rows={5}
            value={form.custom_head_script ?? ''} onChange={set('custom_head_script')}
            placeholder="<!-- Google Analytics, etc. -->" />
        </Field>
      </Section>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={handlePublish}
          disabled={publishMutation.isPending}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            site?.is_published
              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              : 'bg-emerald-600 text-white hover:bg-emerald-700'
          }`}
        >
          {site?.is_published ? 'Unpublish Site' : 'Publish Site'}
        </button>
        <button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="px-5 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          {updateMutation.isPending ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}
