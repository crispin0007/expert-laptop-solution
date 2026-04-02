/**
 * frontend/src/features/cms/SiteSettingsPanel.tsx
 * Edit site branding, theme, SEO defaults, and publish toggle.
 */
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Plus, Trash2 } from 'lucide-react'
import { useCMSSite, useUpdateCMSSite, usePublishCMSSite } from './hooks'
import type { CMSSiteWritePayload, NavItem } from './types'

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
        primary_color:           site.primary_color || '#4F46E5',
        secondary_color:         site.secondary_color || '#7C3AED',
        font_family:             site.font_family,
        default_meta_title:      site.default_meta_title,
        default_meta_description: site.default_meta_description,
        custom_head_script:      site.custom_head_script,
        header_nav:              site.header_nav ?? [],
        footer_nav:              site.footer_nav ?? [],
        social_facebook:         site.social_facebook ?? '',
        social_instagram:        site.social_instagram ?? '',
        social_twitter:          site.social_twitter ?? '',
        social_linkedin:         site.social_linkedin ?? '',
        social_youtube:          site.social_youtube ?? '',
        social_tiktok:           site.social_tiktok ?? '',
        announcement_text:       site.announcement_text ?? '',
        announcement_active:     site.announcement_active ?? false,
        announcement_color:      site.announcement_color ?? '#4F46E5',
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

      {/* Announcement Bar */}
      <Section title="Announcement Bar">
        <div className="flex items-center gap-3 mb-3">
          <input
            type="checkbox"
            id="announcement_active"
            checked={form.announcement_active ?? false}
            onChange={e => setForm(f => ({ ...f, announcement_active: e.target.checked }))}
            className="w-4 h-4 rounded border-gray-300 text-indigo-600"
          />
          <label htmlFor="announcement_active" className="text-sm font-medium text-gray-700">Show announcement bar</label>
        </div>
        <Field label="Message">
          <input className="input" value={form.announcement_text ?? ''} onChange={set('announcement_text')}
            placeholder="Free shipping on orders over Rs 2,000!" />
        </Field>
        <Field label="Background Colour">
          <div className="flex items-center gap-2">
            <input type="color" value={form.announcement_color ?? '#4F46E5'} onChange={set('announcement_color')}
              className="w-10 h-9 rounded border border-gray-300 cursor-pointer p-0.5" />
            <input className="input flex-1" value={form.announcement_color ?? ''} onChange={set('announcement_color')} />
          </div>
        </Field>
      </Section>

      {/* Social Links */}
      <Section title="Social Media">
        {(['facebook', 'instagram', 'twitter', 'linkedin', 'youtube', 'tiktok'] as const).map(platform => (
          <Field key={platform} label={platform.charAt(0).toUpperCase() + platform.slice(1)}>
            <input className="input" type="url"
              value={(form as Record<string, string>)[`social_${platform}`] ?? ''}
              onChange={e => setForm(f => ({ ...f, [`social_${platform}`]: e.target.value }))}
              placeholder={`https://${platform}.com/yourpage`} />
          </Field>
        ))}
      </Section>

      {/* Navigation Builder */}
      <Section title="Header Navigation">
        <NavBuilder
          items={form.header_nav ?? []}
          onChange={items => setForm(f => ({ ...f, header_nav: items }))}
        />
      </Section>
      <Section title="Footer Navigation">
        <NavBuilder
          items={form.footer_nav ?? []}
          onChange={items => setForm(f => ({ ...f, footer_nav: items }))}
        />
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

// ── Nav Builder ───────────────────────────────────────────────────────────────

function NavBuilder({ items, onChange }: { items: NavItem[]; onChange: (items: NavItem[]) => void }) {
  const add = () => onChange([...items, { label: '', url: '', open_new_tab: false }])
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i))
  const update = (i: number, field: keyof NavItem, value: string | boolean) => {
    const next = items.map((item, idx) => idx === i ? { ...item, [field]: value } : item)
    onChange(next)
  }

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            className="input flex-1"
            placeholder="Label"
            value={item.label}
            onChange={e => update(i, 'label', e.target.value)}
          />
          <input
            className="input flex-1"
            placeholder="URL (e.g. /about)"
            value={item.url}
            onChange={e => update(i, 'url', e.target.value)}
          />
          <label className="flex items-center gap-1 text-xs text-gray-600 whitespace-nowrap">
            <input
              type="checkbox"
              checked={item.open_new_tab ?? false}
              onChange={e => update(i, 'open_new_tab', e.target.checked)}
              className="w-3.5 h-3.5 rounded border-gray-300"
            />
            New tab
          </label>
          <button onClick={() => remove(i)} className="text-gray-400 hover:text-red-500 transition-colors">
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <button
        onClick={add}
        className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800"
      >
        <Plus size={13} /> Add link
      </button>
    </div>
  )
}
