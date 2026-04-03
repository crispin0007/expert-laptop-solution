/**
 * frontend/src/features/cms/PageBlockManager.tsx
 * Section / Block manager for a CMS page.
 *
 * Route: /cms/pages/:pageId/blocks
 *
 * Features:
 *  - Two-step "Add Section" wizard: pick type → fill content form → add
 *  - Image picker with real file upload (→ /api/v1/cms/media/) + live preview
 *  - Proper per-type forms for ALL 16 block types (no JSON fallback)
 *  - Array item editors for stats, services, testimonials, team, faq, gallery, pricing
 *  - Reorder, show/hide, edit, delete sections
 */

import { useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Plus, Eye, EyeOff, Trash2, ChevronUp, ChevronDown,
  ExternalLink, Pencil, X, LayoutTemplate, Upload, ImageIcon, Loader2,
  Star, Mail, Package, BookOpen, Image, Video, Check, AlertCircle,
  DollarSign, Users, HelpCircle, Code, BarChart3, PhoneCall, Megaphone,
  MessageSquare, ChevronLeft, GripVertical, PlusCircle, Minus,
} from 'lucide-react'

import apiClient from '../../api/client'
import { CMS } from '../../api/endpoints'
import {
  useCMSPages, useCMSBlocks, useCreateCMSBlock,
  useDeleteCMSBlock, useReorderCMSBlocks, usePatchCMSBlock,
} from './hooks'
import type { CMSBlock, CMSBlockWritePayload, BlockType } from './types'

// ── Block type definitions ────────────────────────────────────────────────────

interface BlockDef {
  type: BlockType
  label: string
  Icon: React.ElementType
  description: string
  color: string
  defaultContent: Record<string, unknown>
}

const BLOCK_DEFS: BlockDef[] = [
  {
    type: 'hero', label: 'Hero Banner', Icon: Megaphone,
    color: 'bg-indigo-100 text-indigo-700',
    description: 'Full-width banner with headline, subtext, buttons and background image.',
    defaultContent: {
      heading: 'Welcome to Our Website',
      subheading: 'We help you grow your business with the right technology.',
      cta_label: 'Get Started', cta_url: '/contact',
      secondary_cta_label: 'Learn More', secondary_cta_url: '#services',
      bg_image: '',
    },
  },
  {
    type: 'stats', label: 'Stats / Numbers', Icon: BarChart3,
    color: 'bg-violet-100 text-violet-700',
    description: 'Highlight key metrics — clients, projects, years, satisfaction.',
    defaultContent: {
      heading: 'Our Numbers Speak',
      items: [
        { label: 'Happy Clients', value: '500+', icon: 'smile' },
        { label: 'Projects Done', value: '1,200', icon: 'briefcase' },
        { label: 'Years Active', value: '8', icon: 'clock' },
        { label: 'Satisfaction', value: '98%', icon: 'star' },
      ],
    },
  },
  {
    type: 'services', label: 'Services', Icon: LayoutTemplate,
    color: 'bg-sky-100 text-sky-700',
    description: 'Grid of service cards with icon, title, and description.',
    defaultContent: {
      heading: 'What We Offer',
      subheading: 'End-to-end technology solutions for your business.',
      items: [
        { icon: '💻', title: 'Software Development', description: 'Custom web and mobile applications.' },
        { icon: '☁️', title: 'Cloud Solutions', description: 'Scalable infrastructure for any size.' },
        { icon: '🔒', title: 'Cybersecurity', description: 'Keep your data safe and compliant.' },
      ],
    },
  },
  {
    type: 'testimonials', label: 'Testimonials', Icon: Star,
    color: 'bg-yellow-100 text-yellow-700',
    description: 'Customer reviews and star ratings displayed as cards.',
    defaultContent: {
      heading: 'What Our Clients Say',
      items: [
        { name: 'Ram Sharma', role: 'CEO', company: 'TechCorp', rating: 5, text: 'Outstanding service and support. Highly recommended!' },
        { name: 'Sita Thapa', role: 'Manager', company: 'InnovateCo', rating: 5, text: 'The team delivered on time and exceeded expectations.' },
      ],
    },
  },
  {
    type: 'cta', label: 'Call to Action', Icon: Megaphone,
    color: 'bg-orange-100 text-orange-700',
    description: 'Bold banner with a headline and a primary action button.',
    defaultContent: {
      heading: 'Ready to Get Started?',
      subheading: 'Contact us today and let us build something great together.',
      button_label: 'Contact Us', button_url: '/contact',
    },
  },
  {
    type: 'pricing', label: 'Pricing Plans', Icon: DollarSign,
    color: 'bg-green-100 text-green-700',
    description: 'Side-by-side pricing cards with features list and CTA per plan.',
    defaultContent: {
      heading: 'Simple, Transparent Pricing',
      subheading: 'No hidden fees. Cancel anytime.',
      plans: [
        { name: 'Starter', price: '0', period: 'month', features: ['5 users', '10 GB storage', 'Email support'], highlight: false },
        { name: 'Pro', price: '49', period: 'month', features: ['50 users', '100 GB storage', 'Priority support', 'Custom domain'], highlight: true },
        { name: 'Enterprise', price: 'Custom', period: '', features: ['Unlimited users', 'Dedicated server', '24/7 SLA support'], highlight: false },
      ],
    },
  },
  {
    type: 'team', label: 'Team / About', Icon: Users,
    color: 'bg-pink-100 text-pink-700',
    description: 'Showcase your team members with photo, name, and role.',
    defaultContent: {
      heading: 'Meet the Team',
      members: [
        { name: 'Aarav Joshi', role: 'Founder & CEO', photo_url: '', bio: 'Building great products since 2010.' },
        { name: 'Priya Rai', role: 'Head of Design', photo_url: '', bio: 'Design that delights and converts.' },
        { name: 'Kiran Pandey', role: 'Lead Engineer', photo_url: '', bio: '10+ years in full-stack development.' },
      ],
    },
  },
  {
    type: 'text', label: 'Text / Content', Icon: MessageSquare,
    color: 'bg-gray-100 text-gray-700',
    description: 'Rich text section for "About Us" or any long-form copy.',
    defaultContent: {
      heading: 'About Our Company',
      body: '<p>We are a dedicated team of technology professionals committed to delivering the best solutions for your business.</p>',
    },
  },
  {
    type: 'contact_form', label: 'Contact / Map', Icon: PhoneCall,
    color: 'bg-teal-100 text-teal-700',
    description: 'Contact details with address, phone, email, and optional map embed.',
    defaultContent: { heading: 'Get in Touch', email: 'info@example.com', phone: '+977 1 1234567', address: 'Kathmandu, Nepal', map_url: '' },
  },
  {
    type: 'faq', label: 'FAQ', Icon: HelpCircle,
    color: 'bg-amber-100 text-amber-700',
    description: 'Expandable frequently-asked-questions accordion.',
    defaultContent: {
      heading: 'Frequently Asked Questions',
      items: [
        { question: 'What services do you offer?', answer: 'We offer software development, cloud hosting, and IT consulting.' },
        { question: 'How long does a typical project take?', answer: 'Most projects are delivered within 4–12 weeks depending on scope.' },
        { question: 'Do you provide ongoing support?', answer: 'Yes, all our projects come with a 3-month free support period.' },
      ],
    },
  },
  {
    type: 'gallery', label: 'Gallery', Icon: Image,
    color: 'bg-rose-100 text-rose-700',
    description: 'Image grid with optional captions — upload photos or paste URLs.',
    defaultContent: { heading: 'Our Work', items: [{ url: '', alt: 'Project 1' }, { url: '', alt: 'Project 2' }, { url: '', alt: 'Project 3' }] },
  },
  {
    type: 'video', label: 'Video', Icon: Video,
    color: 'bg-red-100 text-red-700',
    description: 'Embedded YouTube or Vimeo video player.',
    defaultContent: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Watch Our Story' },
  },
  {
    type: 'html', label: 'Custom HTML', Icon: Code,
    color: 'bg-slate-100 text-slate-700',
    description: 'Drop in any raw HTML — embeds, tracking scripts, third-party widgets.',
    defaultContent: { code: '<!-- Your custom HTML here -->' },
  },
  {
    type: 'newsletter', label: 'Newsletter Signup', Icon: Mail,
    color: 'bg-indigo-100 text-indigo-700',
    description: 'Email capture form — subscribers go to your Newsletter list.',
    defaultContent: {
      heading: 'Stay in the Loop',
      subheading: 'Get the latest updates delivered straight to your inbox.',
      button_label: 'Subscribe',
      show_name_field: false,
      privacy_note: 'We respect your privacy. Unsubscribe at any time.',
    },
  },
  {
    type: 'product_catalog', label: 'Product Catalog', Icon: Package,
    color: 'bg-emerald-100 text-emerald-700',
    description: 'Shows all website-enabled products from your Inventory module.',
    defaultContent: {
      heading: 'Our Products',
      subheading: 'Browse our full range of products.',
      columns: 3, limit: 12, show_filters: true,
      currency: 'NPR', cta_label: 'Enquire',
    },
  },
  {
    type: 'blog_preview', label: 'Blog Preview', Icon: BookOpen,
    color: 'bg-purple-100 text-purple-700',
    description: 'Shows your latest blog posts as cards with image, title, and excerpt.',
    defaultContent: { heading: 'Latest Articles', subheading: 'Stay updated with our latest news and insights.', limit: 3, show_all_link: true },
  },
]

const DEF: Record<string, BlockDef> = Object.fromEntries(BLOCK_DEFS.map(d => [d.type, d]))

// ── Base field components ─────────────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400'

function Fld({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-gray-600 mb-1 block">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-gray-400 mt-0.5 block">{hint}</span>}
    </label>
  )
}

function TxtIn({ value, onChange, ph = '', mono = false }: { value: string; onChange: (v: string) => void; ph?: string; mono?: boolean }) {
  return (
    <input type="text" value={value} placeholder={ph}
      className={`${inputCls} ${mono ? 'font-mono text-xs' : ''}`}
      onChange={e => onChange(e.target.value)}
    />
  )
}

function TxtArea({ value, onChange, rows = 4, mono = false, ph = '' }: {
  value: string; onChange: (v: string) => void; rows?: number; mono?: boolean; ph?: string
}) {
  return (
    <textarea rows={rows} value={value} placeholder={ph}
      className={`${inputCls} ${mono ? 'font-mono text-xs' : ''}`}
      onChange={e => onChange(e.target.value)}
    />
  )
}

function NumIn({ value, onChange, min = 1, max = 999 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <input type="number" min={min} max={max} value={value}
      className={inputCls}
      onChange={e => onChange(Math.min(max, Math.max(min, +e.target.value)))}
    />
  )
}

function ChkIn({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="rounded accent-indigo-600" />
      {label}
    </label>
  )
}

// ── Image picker with real upload ─────────────────────────────────────────────

function ImagePickerField({ value, onChange, label = 'Image', aspectHint = '' }: {
  value: string
  onChange: (url: string) => void
  label?: string
  aspectHint?: string
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await apiClient.post<{ success: boolean; data: { url: string } }>(
        CMS.MEDIA_UPLOAD, fd, { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      const url = res.data?.data?.url ?? ''
      if (url) {
        onChange(url)
      } else {
        setError('Upload succeeded but no URL returned.')
      }
    } catch {
      setError('Upload failed. Check file size/type and try again.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }, [onChange])

  return (
    <div className="space-y-2">
      <span className="text-xs font-semibold text-gray-600 block">{label}{aspectHint && <span className="font-normal text-gray-400 ml-1">({aspectHint})</span>}</span>

      {/* Preview */}
      {value ? (
        <div className="relative group rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
          <img src={value} alt="preview" className="w-full max-h-48 object-cover" onError={() => {}} />
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute top-2 right-2 p-1 bg-black/60 hover:bg-red-600 text-white rounded-full transition-colors"
            title="Remove image"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-6 text-center">
          <ImageIcon size={28} className="mx-auto mb-2 text-gray-300" />
          <p className="text-xs text-gray-400">No image selected</p>
        </div>
      )}

      {/* Upload + URL row */}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-indigo-50 text-indigo-700
            border border-indigo-200 rounded-lg hover:bg-indigo-100 disabled:opacity-50 transition-colors"
        >
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          {uploading ? 'Uploading…' : 'Upload file'}
        </button>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Or paste image URL…"
          className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      </div>

      {error && (
        <p className="flex items-center gap-1 text-xs text-red-500">
          <AlertCircle size={11} /> {error}
        </p>
      )}
      <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.gif,.webp,.svg" className="hidden" onChange={handleFile} />
    </div>
  )
}

// ── Generic array item editor ─────────────────────────────────────────────────

function ArrayEditor<T extends Record<string, unknown>>({
  items,
  onChange,
  defaultItem,
  addLabel,
  renderItem,
}: {
  items: T[]
  onChange: (items: T[]) => void
  defaultItem: T
  addLabel: string
  renderItem: (item: T, setItem: (patch: Partial<T>) => void, remove: () => void) => React.ReactNode
}) {
  const update = (i: number, patch: Partial<T>) => {
    const next = items.map((it, idx) => idx === i ? { ...it, ...patch } : it)
    onChange(next)
  }
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i))
  const add = () => onChange([...items, { ...defaultItem }])

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="border border-gray-200 rounded-xl p-3 bg-gray-50 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-gray-500 flex items-center gap-1">
              <GripVertical size={11} className="text-gray-300" /> Item {i + 1}
            </span>
            <button type="button" onClick={() => remove(i)}
              className="p-1 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
              <Minus size={13} />
            </button>
          </div>
          {renderItem(item, patch => update(i, patch), () => remove(i))}
        </div>
      ))}
      <button type="button" onClick={add}
        className="w-full py-2 border border-dashed border-indigo-200 rounded-xl text-xs font-medium
          text-indigo-600 hover:bg-indigo-50 transition-colors flex items-center justify-center gap-1.5">
        <PlusCircle size={13} /> {addLabel}
      </button>
    </div>
  )
}

// ── Per-type content forms ────────────────────────────────────────────────────

type Setter = (k: string, v: unknown) => void

function HeroForm({ c, set }: { c: Record<string, unknown>; set: Setter }) {
  const s = (k: string) => String(c[k] ?? '')
  return (
    <div className="space-y-3">
      <Fld label="Heading"><TxtIn value={s('heading')} onChange={v => set('heading', v)} ph="Welcome to Our Website" /></Fld>
      <Fld label="Subheading"><TxtIn value={s('subheading')} onChange={v => set('subheading', v)} ph="Short supporting line" /></Fld>
      <div className="grid grid-cols-2 gap-3">
        <Fld label="Primary button label"><TxtIn value={s('cta_label')} onChange={v => set('cta_label', v)} ph="Get Started" /></Fld>
        <Fld label="Primary button URL"><TxtIn value={s('cta_url')} onChange={v => set('cta_url', v)} ph="/contact" /></Fld>
        <Fld label="Secondary button label"><TxtIn value={s('secondary_cta_label')} onChange={v => set('secondary_cta_label', v)} ph="Learn More" /></Fld>
        <Fld label="Secondary button URL"><TxtIn value={s('secondary_cta_url')} onChange={v => set('secondary_cta_url', v)} ph="#services" /></Fld>
      </div>
      <ImagePickerField
        label="Background image"
        aspectHint="full-width banner, 1440×600 recommended"
        value={s('bg_image')}
        onChange={url => set('bg_image', url)}
      />
    </div>
  )
}

function StatsForm({ c, set }: { c: Record<string, unknown>; set: Setter }) {
  const s = (k: string) => String(c[k] ?? '')
  const items = (c.items as Array<Record<string, unknown>>) ?? []
  return (
    <div className="space-y-3">
      <Fld label="Section heading"><TxtIn value={s('heading')} onChange={v => set('heading', v)} ph="Our Numbers Speak" /></Fld>
      <span className="text-xs font-semibold text-gray-600 block">Stats items</span>
      <ArrayEditor
        items={items}
        onChange={it => set('items', it)}
        defaultItem={{ label: 'New Metric', value: '0', icon: 'star' }}
        addLabel="Add stat"
        renderItem={(item, patch) => (
          <div className="grid grid-cols-2 gap-2">
            <Fld label="Value"><TxtIn value={String(item.value ?? '')} onChange={v => patch({ value: v })} ph="500+" /></Fld>
            <Fld label="Label"><TxtIn value={String(item.label ?? '')} onChange={v => patch({ label: v })} ph="Happy Clients" /></Fld>
          </div>
        )}
      />
    </div>
  )
}

function ServicesForm({ c, set }: { c: Record<string, unknown>; set: Setter }) {
  const s = (k: string) => String(c[k] ?? '')
  const items = (c.items as Array<Record<string, unknown>>) ?? []
  return (
    <div className="space-y-3">
      <Fld label="Heading"><TxtIn value={s('heading')} onChange={v => set('heading', v)} ph="What We Offer" /></Fld>
      <Fld label="Subheading"><TxtIn value={s('subheading')} onChange={v => set('subheading', v)} ph="Short supporting text" /></Fld>
      <span className="text-xs font-semibold text-gray-600 block">Service cards</span>
      <ArrayEditor
        items={items}
        onChange={it => set('items', it)}
        defaultItem={{ icon: '⭐', title: 'New Service', description: 'Brief description.' }}
        addLabel="Add service"
        renderItem={(item, patch) => (
          <div className="space-y-2">
            <div className="grid grid-cols-4 gap-2">
              <Fld label="Icon / Emoji"><TxtIn value={String(item.icon ?? '')} onChange={v => patch({ icon: v })} ph="💻" /></Fld>
              <div className="col-span-3">
                <Fld label="Title"><TxtIn value={String(item.title ?? '')} onChange={v => patch({ title: v })} ph="Service name" /></Fld>
              </div>
            </div>
            <Fld label="Description"><TxtArea value={String(item.description ?? '')} onChange={v => patch({ description: v })} rows={2} /></Fld>
          </div>
        )}
      />
    </div>
  )
}

function TestimonialsForm({ c, set }: { c: Record<string, unknown>; set: Setter }) {
  const s = (k: string) => String(c[k] ?? '')
  const items = (c.items as Array<Record<string, unknown>>) ?? []
  return (
    <div className="space-y-3">
      <Fld label="Heading"><TxtIn value={s('heading')} onChange={v => set('heading', v)} ph="What Our Clients Say" /></Fld>
      <span className="text-xs font-semibold text-gray-600 block">Testimonials</span>
      <ArrayEditor
        items={items}
        onChange={it => set('items', it)}
        defaultItem={{ name: '', role: '', company: '', rating: 5, text: '' }}
        addLabel="Add testimonial"
        renderItem={(item, patch) => (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <Fld label="Name"><TxtIn value={String(item.name ?? '')} onChange={v => patch({ name: v })} ph="Ram Sharma" /></Fld>
              <Fld label="Role"><TxtIn value={String(item.role ?? '')} onChange={v => patch({ role: v })} ph="CEO" /></Fld>
              <Fld label="Company"><TxtIn value={String(item.company ?? '')} onChange={v => patch({ company: v })} ph="TechCorp" /></Fld>
            </div>
            <Fld label="Rating (1–5)">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} type="button" onClick={() => patch({ rating: n })}
                    className={`p-1 rounded transition-colors ${Number(item.rating ?? 5) >= n ? 'text-yellow-400' : 'text-gray-200'}`}>
                    <Star size={18} fill="currentColor" />
                  </button>
                ))}
              </div>
            </Fld>
            <Fld label="Review text"><TxtArea value={String(item.text ?? '')} onChange={v => patch({ text: v })} rows={2} ph="Write their review…" /></Fld>
          </div>
        )}
      />
    </div>
  )
}

function CtaForm({ c, set }: { c: Record<string, unknown>; set: Setter }) {
  const s = (k: string) => String(c[k] ?? '')
  return (
    <div className="space-y-3">
      <Fld label="Heading"><TxtIn value={s('heading')} onChange={v => set('heading', v)} ph="Ready to Get Started?" /></Fld>
      <Fld label="Subheading"><TxtIn value={s('subheading')} onChange={v => set('subheading', v)} ph="Short supporting text" /></Fld>
      <div className="grid grid-cols-2 gap-3">
        <Fld label="Button label"><TxtIn value={s('button_label')} onChange={v => set('button_label', v)} ph="Contact Us" /></Fld>
        <Fld label="Button URL"><TxtIn value={s('button_url')} onChange={v => set('button_url', v)} ph="/contact" /></Fld>
      </div>
      <ImagePickerField
        label="Background image (optional)"
        aspectHint="wide banner works best"
        value={s('bg_image')}
        onChange={url => set('bg_image', url)}
      />
    </div>
  )
}

function PricingForm({ c, set }: { c: Record<string, unknown>; set: Setter }) {
  const s = (k: string) => String(c[k] ?? '')
  const plans = (c.plans as Array<Record<string, unknown>>) ?? []
  return (
    <div className="space-y-3">
      <Fld label="Heading"><TxtIn value={s('heading')} onChange={v => set('heading', v)} ph="Simple, Transparent Pricing" /></Fld>
      <Fld label="Subheading"><TxtIn value={s('subheading')} onChange={v => set('subheading', v)} ph="No hidden fees. Cancel anytime." /></Fld>
      <span className="text-xs font-semibold text-gray-600 block">Plans</span>
      <ArrayEditor
        items={plans}
        onChange={it => set('plans', it)}
        defaultItem={{ name: 'New Plan', price: '0', period: 'month', features: ['Feature 1'], highlight: false }}
        addLabel="Add plan"
        renderItem={(item, patch) => {
          const features = (item.features as string[]) ?? []
          return (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <Fld label="Plan name"><TxtIn value={String(item.name ?? '')} onChange={v => patch({ name: v })} ph="Pro" /></Fld>
                <Fld label="Price"><TxtIn value={String(item.price ?? '')} onChange={v => patch({ price: v })} ph="49" /></Fld>
                <Fld label="Period"><TxtIn value={String(item.period ?? '')} onChange={v => patch({ period: v })} ph="month" /></Fld>
              </div>
              <Fld label="Features (one per line)" hint="Each line becomes a feature bullet">
                <TxtArea
                  value={features.join('\n')}
                  onChange={v => patch({ features: v.split('\n').filter(Boolean) })}
                  rows={4}
                  ph="5 users&#10;10 GB storage&#10;Email support"
                />
              </Fld>
              <ChkIn checked={Boolean(item.highlight)} onChange={v => patch({ highlight: v })} label="Highlight as recommended plan" />
            </div>
          )
        }}
      />
    </div>
  )
}

function TeamForm({ c, set }: { c: Record<string, unknown>; set: Setter }) {
  const s = (k: string) => String(c[k] ?? '')
  const members = (c.members as Array<Record<string, unknown>>) ?? []
  return (
    <div className="space-y-3">
      <Fld label="Section heading"><TxtIn value={s('heading')} onChange={v => set('heading', v)} ph="Meet the Team" /></Fld>
      <span className="text-xs font-semibold text-gray-600 block">Team members</span>
      <ArrayEditor
        items={members}
        onChange={it => set('members', it)}
        defaultItem={{ name: '', role: '', photo_url: '', bio: '' }}
        addLabel="Add member"
        renderItem={(item, patch) => (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Fld label="Name"><TxtIn value={String(item.name ?? '')} onChange={v => patch({ name: v })} ph="Aarav Joshi" /></Fld>
              <Fld label="Role / Title"><TxtIn value={String(item.role ?? '')} onChange={v => patch({ role: v })} ph="Founder & CEO" /></Fld>
            </div>
            <ImagePickerField
              label="Photo"
              aspectHint="square or portrait"
              value={String(item.photo_url ?? '')}
              onChange={url => patch({ photo_url: url })}
            />
            <Fld label="Short bio"><TxtArea value={String(item.bio ?? '')} onChange={v => patch({ bio: v })} rows={2} ph="Brief description…" /></Fld>
          </div>
        )}
      />
    </div>
  )
}

function TextSectionForm({ c, set }: { c: Record<string, unknown>; set: Setter }) {
  const s = (k: string) => String(c[k] ?? '')
  return (
    <div className="space-y-3">
      <Fld label="Heading"><TxtIn value={s('heading')} onChange={v => set('heading', v)} ph="About Our Company" /></Fld>
      <Fld label="Body HTML" hint="Accepts <p>, <strong>, <ul>, <a>, etc.">
        <TxtArea value={s('body')} onChange={v => set('body', v)} rows={8} mono ph="<p>Your content here…</p>" />
      </Fld>
    </div>
  )
}

function ContactSectionForm({ c, set }: { c: Record<string, unknown>; set: Setter }) {
  const s = (k: string) => String(c[k] ?? '')
  return (
    <div className="space-y-3">
      <Fld label="Section heading"><TxtIn value={s('heading')} onChange={v => set('heading', v)} ph="Get in Touch" /></Fld>
      <div className="grid grid-cols-2 gap-3">
        <Fld label="Email"><TxtIn value={s('email')} onChange={v => set('email', v)} ph="info@example.com" /></Fld>
        <Fld label="Phone"><TxtIn value={s('phone')} onChange={v => set('phone', v)} ph="+977 1 1234567" /></Fld>
      </div>
      <Fld label="Address"><TxtIn value={s('address')} onChange={v => set('address', v)} ph="Kathmandu, Nepal" /></Fld>
      <Fld label="Google Maps embed URL" hint="Paste the 'src' URL from an embedded map iframe">
        <TxtIn value={s('map_url')} onChange={v => set('map_url', v)} ph="https://maps.google.com/maps?q=…&output=embed" />
      </Fld>
    </div>
  )
}

function FaqForm({ c, set }: { c: Record<string, unknown>; set: Setter }) {
  const s = (k: string) => String(c[k] ?? '')
  const items = (c.items as Array<Record<string, unknown>>) ?? []
  return (
    <div className="space-y-3">
      <Fld label="Heading"><TxtIn value={s('heading')} onChange={v => set('heading', v)} ph="Frequently Asked Questions" /></Fld>
      <span className="text-xs font-semibold text-gray-600 block">FAQ items</span>
      <ArrayEditor
        items={items}
        onChange={it => set('items', it)}
        defaultItem={{ question: '', answer: '' }}
        addLabel="Add question"
        renderItem={(item, patch) => (
          <div className="space-y-2">
            <Fld label="Question"><TxtIn value={String(item.question ?? '')} onChange={v => patch({ question: v })} ph="What services do you offer?" /></Fld>
            <Fld label="Answer"><TxtArea value={String(item.answer ?? '')} onChange={v => patch({ answer: v })} rows={2} ph="Describe the answer…" /></Fld>
          </div>
        )}
      />
    </div>
  )
}

function GalleryForm({ c, set }: { c: Record<string, unknown>; set: Setter }) {
  const s = (k: string) => String(c[k] ?? '')
  const items = (c.items as Array<Record<string, unknown>>) ?? []
  return (
    <div className="space-y-3">
      <Fld label="Section heading"><TxtIn value={s('heading')} onChange={v => set('heading', v)} ph="Our Work" /></Fld>
      <span className="text-xs font-semibold text-gray-600 block">Gallery images</span>
      <ArrayEditor
        items={items}
        onChange={it => set('items', it)}
        defaultItem={{ url: '', alt: '' }}
        addLabel="Add image"
        renderItem={(item, patch) => (
          <div className="space-y-2">
            <ImagePickerField
              label="Image"
              aspectHint="landscape or square"
              value={String(item.url ?? '')}
              onChange={url => patch({ url })}
            />
            <Fld label="Caption / alt text"><TxtIn value={String(item.alt ?? '')} onChange={v => patch({ alt: v })} ph="Project description…" /></Fld>
          </div>
        )}
      />
    </div>
  )
}

function VideoSectionForm({ c, set }: { c: Record<string, unknown>; set: Setter }) {
  const s = (k: string) => String(c[k] ?? '')
  return (
    <div className="space-y-3">
      <Fld label="Section title"><TxtIn value={s('title')} onChange={v => set('title', v)} ph="Watch Our Story" /></Fld>
      <Fld label="YouTube or Vimeo URL" hint="Full video URL — will be auto-converted to embed">
        <TxtIn value={s('url')} onChange={v => set('url', v)} ph="https://www.youtube.com/watch?v=…" />
      </Fld>
    </div>
  )
}

function HtmlSectionForm({ c, set }: { c: Record<string, unknown>; set: Setter }) {
  const s = (k: string) => String(c[k] ?? '')
  return (
    <Fld label="Custom HTML" hint="Scripts, embeds, widgets. Keep it clean — all HTML is stored as-is.">
      <TxtArea value={s('code')} onChange={v => set('code', v)} rows={10} mono ph="<!-- Your HTML here -->" />
    </Fld>
  )
}

function NewsletterSectionForm({ c, set }: { c: Record<string, unknown>; set: Setter }) {
  const s = (k: string) => String(c[k] ?? '')
  const b = (k: string) => Boolean(c[k])
  return (
    <div className="space-y-3">
      <Fld label="Heading"><TxtIn value={s('heading')} onChange={v => set('heading', v)} ph="Stay in the Loop" /></Fld>
      <Fld label="Subheading"><TxtIn value={s('subheading')} onChange={v => set('subheading', v)} ph="Get updates delivered to your inbox." /></Fld>
      <div className="grid grid-cols-2 gap-3">
        <Fld label="Button label"><TxtIn value={s('button_label')} onChange={v => set('button_label', v)} ph="Subscribe" /></Fld>
        <Fld label="Background colour" hint="hex e.g. #4f46e5"><TxtIn value={s('bg_color')} onChange={v => set('bg_color', v)} ph="#4f46e5" /></Fld>
      </div>
      <Fld label="Privacy note"><TxtIn value={s('privacy_note')} onChange={v => set('privacy_note', v)} ph="We respect your privacy. Unsubscribe anytime." /></Fld>
      <ChkIn checked={b('show_name_field')} onChange={v => set('show_name_field', v)} label='Ask for visitor name in the signup form' />
    </div>
  )
}

function ProductCatalogSectionForm({ c, set }: { c: Record<string, unknown>; set: Setter }) {
  const s = (k: string) => String(c[k] ?? '')
  const n = (k: string, def = 1) => Number(c[k] ?? def)
  const b = (k: string) => Boolean(c[k] ?? true)
  return (
    <div className="space-y-3">
      <Fld label="Heading"><TxtIn value={s('heading')} onChange={v => set('heading', v)} ph="Our Products" /></Fld>
      <Fld label="Subheading"><TxtIn value={s('subheading')} onChange={v => set('subheading', v)} ph="Browse our full range." /></Fld>
      <div className="grid grid-cols-3 gap-3">
        <Fld label="Grid columns (2–4)"><NumIn value={n('columns', 3)} onChange={v => set('columns', v)} min={2} max={4} /></Fld>
        <Fld label="Max products shown"><NumIn value={n('limit', 12)} onChange={v => set('limit', v)} min={1} max={100} /></Fld>
        <Fld label="Currency code"><TxtIn value={s('currency')} onChange={v => set('currency', v)} ph="NPR" /></Fld>
      </div>
      <Fld label="Card CTA button label"><TxtIn value={s('cta_label')} onChange={v => set('cta_label', v)} ph="Enquire" /></Fld>
      <ChkIn checked={b('show_filters')} onChange={v => set('show_filters', v)} label="Show search & category filter bar" />
    </div>
  )
}

function BlogPreviewSectionForm({ c, set }: { c: Record<string, unknown>; set: Setter }) {
  const s = (k: string) => String(c[k] ?? '')
  const n = (k: string, def = 3) => Number(c[k] ?? def)
  const b = (k: string) => Boolean(c[k] ?? true)
  return (
    <div className="space-y-3">
      <Fld label="Heading"><TxtIn value={s('heading')} onChange={v => set('heading', v)} ph="Latest Articles" /></Fld>
      <Fld label="Subheading"><TxtIn value={s('subheading')} onChange={v => set('subheading', v)} ph="Stay updated with our latest news." /></Fld>
      <Fld label="Number of posts to show (1–9)"><NumIn value={n('limit')} onChange={v => set('limit', v)} min={1} max={9} /></Fld>
      <ChkIn checked={b('show_all_link')} onChange={v => set('show_all_link', v)} label='Show "View all posts" link below cards' />
    </div>
  )
}

// ── ContentForm dispatcher ────────────────────────────────────────────────────

function ContentForm({ type, content, onChange }: {
  type: BlockType
  content: Record<string, unknown>
  onChange: (c: Record<string, unknown>) => void
}) {
  const set: Setter = (k, v) => onChange({ ...content, [k]: v })
  const props = { c: content, set }

  switch (type) {
    case 'hero':            return <HeroForm {...props} />
    case 'stats':           return <StatsForm {...props} />
    case 'services':        return <ServicesForm {...props} />
    case 'testimonials':    return <TestimonialsForm {...props} />
    case 'cta':             return <CtaForm {...props} />
    case 'pricing':         return <PricingForm {...props} />
    case 'team':            return <TeamForm {...props} />
    case 'text':            return <TextSectionForm {...props} />
    case 'contact_form':    return <ContactSectionForm {...props} />
    case 'faq':             return <FaqForm {...props} />
    case 'gallery':         return <GalleryForm {...props} />
    case 'video':           return <VideoSectionForm {...props} />
    case 'html':            return <HtmlSectionForm {...props} />
    case 'newsletter':      return <NewsletterSectionForm {...props} />
    case 'product_catalog': return <ProductCatalogSectionForm {...props} />
    case 'blog_preview':    return <BlogPreviewSectionForm {...props} />
    default:
      return (
        <div className="space-y-1">
          <span className="text-xs font-semibold text-gray-600">Content (JSON)</span>
          <textarea rows={12}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
            defaultValue={JSON.stringify(content, null, 2)}
            onChange={e => { try { onChange(JSON.parse(e.target.value)) } catch { /* typing */ } }}
          />
        </div>
      )
  }
}

// ── Block row card ────────────────────────────────────────────────────────────

function BlockCard({
  block, index, total,
  onUp, onDown, onEdit, onToggle, onDelete,
}: {
  block: CMSBlock; index: number; total: number
  onUp: () => void; onDown: () => void
  onEdit: () => void; onToggle: () => void; onDelete: () => void
}) {
  const def = DEF[block.block_type]
  const Icon = def?.Icon ?? LayoutTemplate

  return (
    <div className={`flex items-center gap-3 bg-white px-4 py-3 rounded-xl border transition-opacity
      ${block.is_visible ? 'border-gray-200' : 'border-dashed border-gray-300 opacity-60'}`}>
      <div className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${def?.color ?? 'bg-gray-100 text-gray-600'}`}>
        <Icon size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{def?.label ?? block.block_type}</p>
        <p className="text-xs text-gray-400 truncate">{def?.description ?? block.block_type}</p>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <button onClick={onUp} disabled={index === 0}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 disabled:opacity-30" title="Move up">
          <ChevronUp size={15} />
        </button>
        <button onClick={onDown} disabled={index >= total - 1}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 disabled:opacity-30" title="Move down">
          <ChevronDown size={15} />
        </button>
        <button onClick={onToggle} title={block.is_visible ? 'Hide section' : 'Show section'}
          className="p-1.5 rounded-lg hover:bg-gray-100">
          {block.is_visible
            ? <Eye size={15} className="text-emerald-500" />
            : <EyeOff size={15} className="text-gray-400" />}
        </button>
        <button onClick={onEdit} title="Edit content"
          className="p-1.5 rounded-lg hover:bg-indigo-50 text-gray-400 hover:text-indigo-600">
          <Pencil size={15} />
        </button>
        <button onClick={onDelete} title="Delete section"
          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  )
}

// ── Add section wizard (2-step) ───────────────────────────────────────────────

function AddSectionWizard({
  onAdd,
  onClose,
  adding,
}: {
  onAdd: (type: BlockType, content: Record<string, unknown>) => void
  onClose: () => void
  adding: boolean
}) {
  const [step, setStep] = useState<'pick' | 'configure'>('pick')
  const [selected, setSelected] = useState<BlockDef | null>(null)
  const [content, setContent] = useState<Record<string, unknown>>({})
  const [q, setQ] = useState('')

  const filtered = BLOCK_DEFS.filter(d =>
    d.label.toLowerCase().includes(q.toLowerCase()) ||
    d.description.toLowerCase().includes(q.toLowerCase())
  )

  function pickType(def: BlockDef) {
    setSelected(def)
    setContent(JSON.parse(JSON.stringify(def.defaultContent))) // deep clone
    setStep('configure')
  }

  function handleAdd() {
    if (!selected) return
    onAdd(selected.type, content)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            {step === 'configure' && (
              <button onClick={() => setStep('pick')}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 mr-1">
                <ChevronLeft size={16} />
              </button>
            )}
            <div>
              <h3 className="font-semibold text-gray-900">
                {step === 'pick' ? 'Add Section' : `Configure: ${selected?.label}`}
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {step === 'pick'
                  ? 'Choose a section type to add to this page'
                  : 'Fill in content then click "Add Section"'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Step indicator */}
            <div className="flex items-center gap-1">
              {[1, 2].map(n => (
                <div key={n} className={`w-1.5 h-1.5 rounded-full transition-colors
                  ${(n === 1 && step === 'pick') || (n === 2 && step === 'configure')
                    ? 'bg-indigo-600' : 'bg-gray-200'}`} />
              ))}
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Step 1: type picker ───────────────────────────────────────────── */}
        {step === 'pick' && (
          <>
            <div className="px-5 py-3 border-b border-gray-100 shrink-0">
              <input autoFocus type="text" placeholder="Search section types…" value={q}
                onChange={e => setQ(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div className="overflow-y-auto p-5">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {filtered.map(d => (
                  <button key={d.type} onClick={() => pickType(d)}
                    className="text-left p-3 rounded-xl border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all group">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${d.color}`}>
                      <d.Icon size={15} />
                    </div>
                    <p className="text-sm font-semibold text-gray-800 group-hover:text-indigo-700 leading-tight">{d.label}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5 leading-snug line-clamp-2">{d.description}</p>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="col-span-3 text-center py-8 text-sm text-gray-400">No matching section types</p>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── Step 2: configure ─────────────────────────────────────────────── */}
        {step === 'configure' && selected && (
          <>
            {/* Section type badge */}
            <div className="px-5 py-2 border-b border-gray-100 shrink-0">
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${selected.color}`}>
                <selected.Icon size={11} /> {selected.label}
              </div>
            </div>
            {/* Form */}
            <div className="overflow-y-auto px-5 py-4 flex-1">
              <ContentForm type={selected.type} content={content} onChange={setContent} />
            </div>
            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 shrink-0">
              <button onClick={() => setStep('pick')}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-800">
                ← Back
              </button>
              <div className="flex items-center gap-2">
                <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-800">
                  Cancel
                </button>
                <button onClick={handleAdd} disabled={adding}
                  className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                  {adding
                    ? <><Loader2 size={14} className="animate-spin" /> Adding…</>
                    : <><Check size={14} /> Add Section</>
                  }
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Edit block modal ──────────────────────────────────────────────────────────

function EditBlockModal({ block, onSave, onClose, saving }: {
  block: CMSBlock
  onSave: (content: Record<string, unknown>) => void
  onClose: () => void
  saving: boolean
}) {
  const [content, setContent] = useState<Record<string, unknown>>(block.content ?? {})
  const [tab, setTab] = useState<'form' | 'json'>('form')
  const [jsonStr, setJsonStr] = useState(JSON.stringify(block.content ?? {}, null, 2))
  const [jsonErr, setJsonErr] = useState(false)
  const def = DEF[block.block_type]

  function handleSave() {
    if (tab === 'json') {
      try {
        const parsed = JSON.parse(jsonStr)
        onSave(parsed)
      } catch {
        setJsonErr(true)
        return
      }
    } else {
      onSave(content)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: '92vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5">
            {def && (
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${def.color}`}>
                <def.Icon size={15} />
              </div>
            )}
            <div>
              <h3 className="font-semibold text-gray-900">Edit: {def?.label ?? block.block_type}</h3>
              <p className="text-xs text-gray-400 mt-0.5">Configure this section's content</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-3 shrink-0">
          {(['form', 'json'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors
                ${tab === t ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}>
              {t === 'form' ? 'Form Editor' : 'Raw JSON'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-4 flex-1">
          {tab === 'form' ? (
            <ContentForm type={block.block_type} content={content} onChange={setContent} />
          ) : (
            <div className="space-y-1">
              <textarea rows={18}
                className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 font-mono text-xs
                  ${jsonErr ? 'border-red-400 focus:ring-red-300' : 'border-gray-200 focus:ring-indigo-400'}`}
                value={jsonStr}
                onChange={e => { setJsonStr(e.target.value); setJsonErr(false) }}
              />
              {jsonErr && <p className="flex items-center gap-1 text-xs text-red-500"><AlertCircle size={11} /> Invalid JSON — fix before saving.</p>}
              <p className="text-[11px] text-gray-400">Edit raw JSON carefully. Changes apply only on Save.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 justify-end px-5 py-4 border-t border-gray-100 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Check size={14} /> Save Section</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PageBlockManager() {
  const { pageId } = useParams<{ pageId: string }>()
  const navigate   = useNavigate()
  const id         = Number(pageId)

  const { data: pages = [] }             = useCMSPages()
  const page                             = pages.find(p => p.id === id)
  const { data: blocks = [], isLoading } = useCMSBlocks(id)

  const createBlock   = useCreateCMSBlock(id)
  const patchBlock    = usePatchCMSBlock(id)
  const deleteBlock   = useDeleteCMSBlock(id)
  const reorderBlocks = useReorderCMSBlocks(id)

  const [showWizard, setShowWizard]     = useState(false)
  const [editingBlock, setEditingBlock] = useState<CMSBlock | null>(null)

  const sorted = [...blocks].sort((a, b) => a.sort_order - b.sort_order)

  // ── Add new section ──────────────────────────────────────────────────────────
  const handleAdd = useCallback(async (type: BlockType, content: Record<string, unknown>) => {
    const def = DEF[type]
    const payload: CMSBlockWritePayload = {
      block_type: type,
      content,
      sort_order: sorted.length,
      is_visible: true,
    }
    try {
      await createBlock.mutateAsync(payload)
      toast.success(`"${def?.label ?? type}" section added`)
      setShowWizard(false)
    } catch {
      toast.error('Failed to add section')
    }
  }, [createBlock, sorted.length])

  // ── Toggle visibility ────────────────────────────────────────────────────────
  const handleToggle = useCallback(async (block: CMSBlock) => {
    try {
      await patchBlock.mutateAsync({ blockId: block.id, data: { is_visible: !block.is_visible } })
    } catch {
      toast.error('Failed to update visibility')
    }
  }, [patchBlock])

  // ── Move up / down ───────────────────────────────────────────────────────────
  const handleMove = useCallback(async (index: number, dir: 'up' | 'down') => {
    const arr = [...sorted]
    const swap = dir === 'up' ? index - 1 : index + 1
    if (swap < 0 || swap >= arr.length) return
    ;[arr[index], arr[swap]] = [arr[swap], arr[index]]
    try {
      await reorderBlocks.mutateAsync({ order: arr.map(b => b.id) })
    } catch {
      toast.error('Failed to reorder')
    }
  }, [sorted, reorderBlocks])

  // ── Delete ───────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (block: CMSBlock) => {
    const label = DEF[block.block_type]?.label ?? block.block_type
    if (!confirm(`Delete the "${label}" section? This cannot be undone.`)) return
    try {
      await deleteBlock.mutateAsync(block.id)
      toast.success('Section deleted')
    } catch {
      toast.error('Failed to delete')
    }
  }, [deleteBlock])

  // ── Save edited content ──────────────────────────────────────────────────────
  const handleSaveEdit = useCallback(async (content: Record<string, unknown>) => {
    if (!editingBlock) return
    try {
      await patchBlock.mutateAsync({ blockId: editingBlock.id, data: { content } })
      toast.success('Section saved')
      setEditingBlock(null)
    } catch {
      toast.error('Failed to save section')
    }
  }, [editingBlock, patchBlock])

  // Always use ?pageId=<pk> so preview works even for unpublished/slugless pages
  const previewUrl = page?.slug
    ? `/preview/${page.slug}?pageId=${id}`
    : `/preview?pageId=${id}`

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/cms?tab=pages')}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">
                Manage Sections{page ? ` — ${page.title}` : ''}
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">
                Add, reorder, show/hide and configure each section on this page
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href={previewUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              <ExternalLink size={13} /> Preview
            </a>
            <button onClick={() => navigate(`/cms/pages/${id}/edit`)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              <Code size={13} /> Open in GrapeJS
            </button>
            <button onClick={() => setShowWizard(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
              <Plus size={15} /> Add Section
            </button>
          </div>
        </div>
      </div>

      {/* ── Block list ──────────────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-4 py-8">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-white rounded-xl border border-gray-200 animate-pulse" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-300">
            <LayoutTemplate className="mx-auto mb-3 text-gray-300" size={40} />
            <p className="text-sm font-medium text-gray-600">No sections yet</p>
            <p className="text-xs text-gray-400 mt-1 mb-5">Click "Add Section" to build your page</p>
            <button onClick={() => setShowWizard(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
              <Plus size={14} /> Add First Section
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-400 mb-3">
              {sorted.length} section{sorted.length !== 1 ? 's' : ''}
            </p>
            {sorted.map((block, index) => (
              <BlockCard
                key={block.id}
                block={block}
                index={index}
                total={sorted.length}
                onUp={() => handleMove(index, 'up')}
                onDown={() => handleMove(index, 'down')}
                onEdit={() => setEditingBlock(block)}
                onToggle={() => handleToggle(block)}
                onDelete={() => handleDelete(block)}
              />
            ))}
            <div className="pt-4">
              <button onClick={() => setShowWizard(true)}
                className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-400
                  hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all
                  flex items-center justify-center gap-2">
                <Plus size={16} /> Add another section
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {showWizard && (
        <AddSectionWizard
          onAdd={handleAdd}
          onClose={() => setShowWizard(false)}
          adding={createBlock.isPending}
        />
      )}
      {editingBlock && (
        <EditBlockModal
          block={editingBlock}
          onSave={handleSaveEdit}
          onClose={() => setEditingBlock(null)}
          saving={patchBlock.isPending}
        />
      )}
    </div>
  )
}
