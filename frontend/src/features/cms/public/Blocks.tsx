/**
 * Blocks.tsx — Renders every CMS block type as real HTML/CSS.
 * Used by the public site preview renderer.
 */
import { useState, useEffect } from 'react'
import { Star, ChevronDown, ChevronUp, Check, ShoppingBag, Mail, ArrowRight, Clock, Tag, Package } from 'lucide-react'
import axios from 'axios'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface Block {
  block_type: string
  sort_order: number
  content: Record<string, any>
  raw_html?: string
}

interface SiteTheme {
  primary_color: string
  secondary_color: string
  font_family: string
}

// ── Block dispatcher ──────────────────────────────────────────────────────────
export function BlockRenderer({ block, theme }: { block: Block; theme: SiteTheme }) {
  const c = block.content ?? {}
  const p = theme.primary_color
  const s = theme.secondary_color

  switch (block.block_type) {
    case 'hero':         return <HeroBlock c={c} primary={p} secondary={s} />
    case 'stats':        return <StatsBlock c={c} primary={p} />
    case 'services':     return <ServicesBlock c={c} primary={p} />
    case 'testimonials': return <TestimonialsBlock c={c} primary={p} />
    case 'cta':          return <CtaBlock c={c} primary={p} />
    case 'pricing':      return <PricingBlock c={c} primary={p} />
    case 'team':         return <TeamBlock c={c} primary={p} />
    case 'text':         return <TextBlock c={c} />
    case 'contact_form': return <ContactFormBlock c={c} primary={p} />
    case 'faq':          return <FaqBlock c={c} primary={p} />
    case 'html':            return <HtmlBlock raw={block.raw_html ?? ''} />
    case 'video':           return <VideoBlock c={c} />
    case 'gallery':         return <GalleryBlock c={c} />
    case 'newsletter':      return <NewsletterBlock c={c} primary={p} />
    case 'product_catalog': return <ProductCatalogBlock c={c} primary={p} secondary={s} />
    case 'blog_preview':    return <BlogPreviewBlock c={c} primary={p} secondary={s} />
    default:                return null
  }
}

// ── Hero ─────────────────────────────────────────────────────────────────────
function HeroBlock({ c, primary, secondary }: any) {
  return (
    <section
      className="relative py-24 px-6 text-center text-white overflow-hidden"
      style={{ background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)` }}
    >
      <div className="relative z-10 max-w-4xl mx-auto">
        {c.heading && (
          <h1 className="text-4xl md:text-6xl font-extrabold leading-tight mb-6">
            {c.heading}
          </h1>
        )}
        {c.subheading && (
          <p className="text-lg md:text-xl text-white/85 max-w-2xl mx-auto mb-10">
            {c.subheading}
          </p>
        )}
        <div className="flex flex-wrap gap-4 justify-center">
          {c.cta_label && (
            <a
              href={c.cta_url || '#'}
              className="px-8 py-3.5 bg-white font-semibold rounded-full shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all text-sm"
              style={{ color: primary }}
            >
              {c.cta_label}
            </a>
          )}
          {c.cta_secondary_label && (
            <a
              href={c.cta_secondary_url || '#'}
              className="px-8 py-3.5 border-2 border-white/70 text-white font-semibold rounded-full hover:bg-white/10 transition-all text-sm"
            >
              {c.cta_secondary_label}
            </a>
          )}
        </div>
      </div>
      {/* Decorative circles */}
      <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full opacity-10 bg-white" />
      <div className="absolute -bottom-20 -left-20 w-96 h-96 rounded-full opacity-10 bg-white" />
    </section>
  )
}

// ── Stats ────────────────────────────────────────────────────────────────────
function StatsBlock({ c, primary }: any) {
  const items: any[] = c.items ?? []
  return (
    <section className="py-16 px-6 bg-white">
      <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
        {items.map((item: any, i: number) => (
          <div key={i}>
            <div className="text-4xl font-extrabold mb-1" style={{ color: primary }}>
              {item.value}
            </div>
            <div className="text-sm text-gray-500 font-medium uppercase tracking-wide">
              {item.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Services ─────────────────────────────────────────────────────────────────
function ServicesBlock({ c, primary: _primary }: any) {
  const items: any[] = c.items ?? []
  return (
    <section className="py-20 px-6 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        {(c.heading || c.subheading) && (
          <div className="text-center mb-14">
            {c.heading && <h2 className="text-3xl font-bold text-gray-900 mb-3">{c.heading}</h2>}
            {c.subheading && <p className="text-gray-500 max-w-xl mx-auto">{c.subheading}</p>}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item: any, i: number) => (
            <div key={i} className="bg-white rounded-2xl p-7 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              {item.icon && <div className="text-3xl mb-4">{item.icon}</div>}
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{item.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Testimonials ─────────────────────────────────────────────────────────────
function TestimonialsBlock({ c, primary: _primary }: any) {
  const items: any[] = c.items ?? []
  return (
    <section className="py-20 px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        {c.heading && (
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">{c.heading}</h2>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {items.map((item: any, i: number) => (
            <div key={i} className="bg-gray-50 rounded-2xl p-7 border border-gray-100">
              <div className="flex mb-3">
                {Array.from({ length: item.rating ?? 5 }).map((_, j) => (
                  <Star key={j} size={16} className="fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-gray-700 text-sm leading-relaxed mb-5 italic">"{item.text}"</p>
              <div>
                <div className="font-semibold text-gray-900 text-sm">{item.name}</div>
                <div className="text-gray-400 text-xs">{item.role}{item.company ? `, ${item.company}` : ''}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── CTA ──────────────────────────────────────────────────────────────────────
function CtaBlock({ c, primary }: any) {
  const bg = c.bg_color || primary
  return (
    <section className="py-20 px-6 text-white text-center" style={{ backgroundColor: bg }}>
      <div className="max-w-2xl mx-auto">
        {c.heading && <h2 className="text-3xl font-bold mb-4">{c.heading}</h2>}
        {c.body && <p className="text-white/80 mb-8">{c.body}</p>}
        {c.cta_label && (
          <a
            href={c.cta_url || '#'}
            className="inline-block px-10 py-4 bg-white font-semibold rounded-full shadow-lg hover:-translate-y-0.5 transition-all text-sm"
            style={{ color: bg }}
          >
            {c.cta_label}
          </a>
        )}
      </div>
    </section>
  )
}

// ── Pricing ──────────────────────────────────────────────────────────────────
function PricingBlock({ c, primary }: any) {
  const plans: any[] = c.plans ?? []
  return (
    <section className="py-20 px-6 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        {(c.heading || c.subheading) && (
          <div className="text-center mb-14">
            {c.heading && <h2 className="text-3xl font-bold text-gray-900 mb-3">{c.heading}</h2>}
            {c.subheading && <p className="text-gray-500 max-w-xl mx-auto">{c.subheading}</p>}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan: any, i: number) => (
            <div
              key={i}
              className={`rounded-2xl p-8 flex flex-col ${
                plan.highlight
                  ? 'text-white shadow-2xl scale-105'
                  : 'bg-white border border-gray-100 shadow-sm'
              }`}
              style={plan.highlight ? { background: `linear-gradient(135deg, ${primary} 0%, #7C3AED 100%)` } : {}}
            >
              <div className="mb-6">
                <div className={`text-sm font-bold uppercase tracking-widest mb-2 ${plan.highlight ? 'text-white/70' : 'text-gray-400'}`}>
                  {plan.name}
                </div>
                <div className="flex items-end gap-1">
                  <span className={`text-4xl font-extrabold ${plan.highlight ? 'text-white' : 'text-gray-900'}`}>
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span className={`text-sm mb-1 ${plan.highlight ? 'text-white/70' : 'text-gray-400'}`}>
                      {plan.period}
                    </span>
                  )}
                </div>
              </div>
              <ul className="space-y-3 flex-1 mb-8">
                {(plan.features ?? []).map((f: string, j: number) => (
                  <li key={j} className="flex items-start gap-2.5 text-sm">
                    <Check size={15} className={`shrink-0 mt-0.5 ${plan.highlight ? 'text-white/80' : 'text-green-500'}`} />
                    <span className={plan.highlight ? 'text-white/90' : 'text-gray-600'}>{f}</span>
                  </li>
                ))}
              </ul>
              <a
                href={plan.cta_url || '#'}
                className={`text-center py-3.5 rounded-full text-sm font-semibold transition-all ${
                  plan.highlight
                    ? 'bg-white hover:bg-white/90'
                    : 'border-2 hover:bg-gray-50'
                }`}
                style={
                  plan.highlight
                    ? { color: primary }
                    : { borderColor: primary, color: primary }
                }
              >
                {plan.cta_label}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Team ─────────────────────────────────────────────────────────────────────
function TeamBlock({ c, primary }: any) {
  const items: any[] = c.items ?? []
  return (
    <section className="py-20 px-6 bg-white">
      <div className="max-w-5xl mx-auto">
        {c.heading && (
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">{c.heading}</h2>
        )}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
          {items.map((member: any, i: number) => (
            <div key={i} className="text-center">
              <div
                className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center text-white text-xl font-bold"
                style={{ background: `linear-gradient(135deg, ${primary}, #7C3AED)` }}
              >
                {member.name?.[0] ?? '?'}
              </div>
              <div className="font-semibold text-gray-900 text-sm">{member.name}</div>
              <div className="text-xs text-gray-400 mb-1">{member.role}</div>
              {member.bio && <p className="text-xs text-gray-500 leading-relaxed">{member.bio}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Rich Text ────────────────────────────────────────────────────────────────
function TextBlock({ c }: any) {
  return (
    <section className="py-16 px-6 bg-white">
      <div className="max-w-3xl mx-auto">
        {c.heading && <h2 className="text-3xl font-bold text-gray-900 mb-6">{c.heading}</h2>}
        {c.body && (
          <div
            className="prose prose-gray max-w-none text-gray-600 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: c.body }}
          />
        )}
      </div>
    </section>
  )
}

// ── Contact Form ─────────────────────────────────────────────────────────────
function ContactFormBlock({ c, primary }: any) {
  const [submitted, setSubmitted] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const fields: string[] = c.fields ?? ['name', 'email', 'message']

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <section className="py-20 px-6">
        <div className="max-w-lg mx-auto text-center">
          <div className="text-5xl mb-4">✅</div>
          <p className="text-lg text-gray-700">{c.success_text || 'Thank you! We will be in touch soon.'}</p>
        </div>
      </section>
    )
  }

  return (
    <section className="py-20 px-6 bg-white">
      <div className="max-w-lg mx-auto">
        {c.heading && <h2 className="text-2xl font-bold text-gray-900 mb-8">{c.heading}</h2>}
        <form onSubmit={handleSubmit} className="space-y-4">
          {fields.map((field: string) => {
            const label = field.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
            return field === 'message' ? (
              <div key={field}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <textarea
                  rows={4}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 resize-none"
                  style={{ '--tw-ring-color': primary } as any}
                  value={values[field] ?? ''}
                  onChange={e => setValues(v => ({ ...v, [field]: e.target.value }))}
                  required
                />
              </div>
            ) : (
              <div key={field}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input
                  type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2"
                  value={values[field] ?? ''}
                  onChange={e => setValues(v => ({ ...v, [field]: e.target.value }))}
                  required={['name', 'email'].includes(field)}
                />
              </div>
            )
          })}
          <button
            type="submit"
            className="w-full py-3.5 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity"
            style={{ backgroundColor: primary }}
          >
            {c.submit_label || 'Send Message'}
          </button>
        </form>
      </div>
    </section>
  )
}

// ── FAQ ──────────────────────────────────────────────────────────────────────
function FaqBlock({ c, primary }: any) {
  const [open, setOpen] = useState<number | null>(null)
  const items: any[] = c.items ?? []
  return (
    <section className="py-20 px-6 bg-gray-50">
      <div className="max-w-3xl mx-auto">
        {c.heading && <h2 className="text-3xl font-bold text-gray-900 text-center mb-10">{c.heading}</h2>}
        <div className="space-y-3">
          {items.map((item: any, i: number) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex justify-between items-center px-6 py-4 text-left text-sm font-semibold text-gray-900 hover:bg-gray-50 transition-colors"
              >
                {item.question}
                {open === i ? <ChevronUp size={16} className="shrink-0" style={{ color: primary }} /> : <ChevronDown size={16} className="shrink-0 text-gray-400" />}
              </button>
              {open === i && (
                <div className="px-6 pb-4 text-sm text-gray-600 leading-relaxed border-t border-gray-100 pt-3">
                  {item.answer}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Raw HTML ─────────────────────────────────────────────────────────────────
function HtmlBlock({ raw }: { raw: string }) {
  return <div dangerouslySetInnerHTML={{ __html: raw }} />
}

// ── Video ────────────────────────────────────────────────────────────────────
function VideoBlock({ c }: any) {
  const url: string = c.url ?? ''
  const embed = url.replace('watch?v=', 'embed/').replace('youtu.be/', 'www.youtube.com/embed/')
  return (
    <section className="py-16 px-6 bg-white">
      <div className="max-w-4xl mx-auto aspect-video rounded-2xl overflow-hidden shadow-xl">
        {embed ? (
          <iframe src={embed} className="w-full h-full" allowFullScreen title={c.title ?? 'Video'} />
        ) : (
          <div className="w-full h-full bg-gray-100 flex items-center justify-center text-gray-400">No video URL</div>
        )}
      </div>
    </section>
  )
}

// ── Gallery ──────────────────────────────────────────────────────────────────
function GalleryBlock({ c }: any) {
  const items: any[] = c.items ?? []
  return (
    <section className="py-16 px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        {c.heading && <h2 className="text-3xl font-bold text-gray-900 text-center mb-10">{c.heading}</h2>}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {items.map((img: any, i: number) => (
            <div key={i} className="aspect-video rounded-xl overflow-hidden bg-gray-100">
              {img.url && <img src={img.url} alt={img.alt ?? ''} className="w-full h-full object-cover" />}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Newsletter ───────────────────────────────────────────────────────────────
function NewsletterBlock({ c, primary }: any) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setStatus('loading')
    setErrorMsg('')
    try {
      await axios.post('/api/v1/cms/public/newsletter/subscribe/', {
        email,
        name,
        source: 'website_block',
      })
      setStatus('success')
      setEmail('')
      setName('')
    } catch (err: any) {
      setStatus('error')
      const detail = err?.response?.data?.errors?.[0] ?? err?.response?.data?.detail ?? 'Subscription failed. Please try again.'
      setErrorMsg(typeof detail === 'string' ? detail : JSON.stringify(detail))
    }
  }

  const bg = c.bg_color || primary

  return (
    <section className="py-20 px-6" style={{ background: `linear-gradient(135deg, ${bg}cc 0%, ${bg} 100%)` }}>
      <div className="max-w-2xl mx-auto text-center text-white">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-white/20 mb-6">
          <Mail className="w-7 h-7 text-white" />
        </div>
        <h2 className="text-3xl md:text-4xl font-extrabold mb-3">
          {c.heading ?? 'Stay in the loop'}
        </h2>
        <p className="text-white/80 text-lg mb-8">
          {c.subheading ?? 'Get the latest updates and news delivered straight to your inbox.'}
        </p>

        {status === 'success' ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
              <Check className="w-8 h-8 text-white" />
            </div>
            <p className="text-white font-semibold text-lg">You're subscribed!</p>
            <p className="text-white/70 text-sm">Thank you for joining our newsletter.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-lg mx-auto">
            {c.show_name_field && (
              <input
                type="text"
                placeholder="Your name"
                value={name}
                onChange={e => setName(e.target.value)}
                className="flex-1 px-4 py-3 rounded-full bg-white/20 border border-white/30 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/50 text-sm"
              />
            )}
            <input
              type="email"
              placeholder="Your email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="flex-1 px-4 py-3 rounded-full bg-white/20 border border-white/30 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/50 text-sm"
            />
            <button
              type="submit"
              disabled={status === 'loading'}
              className="px-6 py-3 bg-white rounded-full font-semibold text-sm hover:bg-white/90 transition-all disabled:opacity-60 flex items-center gap-2 whitespace-nowrap"
              style={{ color: primary }}
            >
              {status === 'loading' ? 'Subscribing…' : (c.button_label ?? 'Subscribe')}
              {status !== 'loading' && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>
        )}

        {status === 'error' && (
          <p className="mt-3 text-red-200 text-sm">{errorMsg}</p>
        )}

        {c.privacy_note && (
          <p className="mt-5 text-white/50 text-xs">{c.privacy_note}</p>
        )}
      </div>
    </section>
  )
}

// ── Product Catalog ──────────────────────────────────────────────────────────
interface CatalogProduct {
  id: string
  name: string
  description: string
  sku: string
  brand: string
  unit_price: number | null
  category: string | null
  image_url: string | null
  in_stock: boolean
}

function ProductCatalogBlock({ c, primary, secondary: _secondary }: any) {
  const [products, setProducts] = useState<CatalogProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [categories, setCategories] = useState<string[]>([])

  useEffect(() => {
    setLoading(true)
    const params: Record<string, string> = {}
    if (search)   params.search   = search
    if (category) params.category = category
    if (c.limit)  params.limit    = String(c.limit)

    axios.get('/api/v1/cms/public/catalog/', { params })
      .then(res => {
        const data: CatalogProduct[] = res.data?.data ?? res.data ?? []
        setProducts(data)
        const cats = Array.from(new Set(data.map(p => p.category).filter(Boolean))) as string[]
        setCategories(cats)
      })
      .catch(() => setProducts([]))
      .finally(() => setLoading(false))
  }, [search, category])

  const currency = c.currency ?? 'NPR'
  const heading  = c.heading  ?? 'Our Products'
  const cols     = Math.min(Math.max(Number(c.columns ?? 3), 2), 4)
  const gridCls  = cols === 2 ? 'grid-cols-2' : cols === 4 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 md:grid-cols-3'

  return (
    <section className="py-16 px-6 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">{heading}</h2>
          {c.subheading && <p className="text-gray-500 text-lg max-w-2xl mx-auto">{c.subheading}</p>}
        </div>

        {/* Filters */}
        {c.show_filters !== false && (
          <div className="flex flex-wrap gap-3 mb-8 justify-center">
            <input
              type="text"
              placeholder="Search products…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="px-4 py-2 rounded-full border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 shadow-sm"
              style={{ '--tw-ring-color': primary } as any}
            />
            {categories.length > 0 && (
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="px-4 py-2 rounded-full border border-gray-200 bg-white text-sm focus:outline-none shadow-sm"
              >
                <option value="">All categories</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Grid */}
        {loading ? (
          <div className={`grid ${gridCls} gap-6`}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl overflow-hidden shadow-sm animate-pulse">
                <div className="aspect-square bg-gray-200" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                  <div className="h-5 bg-gray-200 rounded w-1/3 mt-3" />
                </div>
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Package className="w-12 h-12 mx-auto mb-4 opacity-40" />
            <p className="text-lg">No products found</p>
          </div>
        ) : (
          <div className={`grid ${gridCls} gap-6`}>
            {products.map(product => (
              <div key={product.id} className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
                {/* Image */}
                <div className="aspect-square bg-gray-100 relative overflow-hidden">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                      <ShoppingBag className="w-12 h-12" />
                    </div>
                  )}
                  {/* Stock badge */}
                  <span
                    className="absolute top-3 right-3 text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={product.in_stock
                      ? { background: '#dcfce7', color: '#16a34a' }
                      : { background: '#fee2e2', color: '#dc2626' }
                    }
                  >
                    {product.in_stock ? 'In Stock' : 'Out of Stock'}
                  </span>
                </div>

                {/* Info */}
                <div className="p-4 flex flex-col flex-1">
                  {product.category && (
                    <span className="flex items-center gap-1 text-xs text-gray-400 mb-1">
                      <Tag className="w-3 h-3" />{product.category}
                    </span>
                  )}
                  <h3 className="font-semibold text-gray-900 text-sm leading-snug mb-1">{product.name}</h3>
                  {product.brand && (
                    <p className="text-xs text-gray-400 mb-2">{product.brand}</p>
                  )}
                  <p className="text-xs text-gray-500 leading-relaxed mb-3 flex-1 line-clamp-2">
                    {product.description}
                  </p>

                  <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-100">
                    {product.unit_price != null ? (
                      <span className="font-bold text-gray-900">
                        {currency} {Number(product.unit_price).toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-sm italic">Price on request</span>
                    )}
                    <button
                      className="text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
                      style={{ background: primary, color: '#fff' }}
                    >
                      {c.cta_label ?? 'Enquire'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

// ── Blog Preview ─────────────────────────────────────────────────────────────
interface BlogPost {
  id: string
  title: string
  slug: string
  excerpt: string
  cover_image_url: string | null
  published_at: string
  author_name: string
  read_time_minutes: number | null
  tags: string[]
}

function BlogPreviewBlock({ c, primary }: any) {
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const limit = c.limit ?? 3
    axios.get('/api/v1/cms/public/blog/', { params: { limit } })
      .then(res => {
        const data: BlogPost[] = res.data?.data ?? res.data ?? []
        setPosts(data.slice(0, limit))
      })
      .catch(() => setPosts([]))
      .finally(() => setLoading(false))
  }, [c.limit])

  const heading    = c.heading    ?? 'Latest Articles'
  const subheading = c.subheading ?? 'Stay updated with our latest news and insights.'
  const basePath   = c.blog_base  ?? '/preview/blog'

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    } catch {
      return iso
    }
  }

  return (
    <section className="py-16 px-6 bg-white">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-10 gap-4">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">{heading}</h2>
            <p className="text-gray-500 text-lg">{subheading}</p>
          </div>
          {c.show_all_link !== false && (
            <a
              href="/preview/blog"
              className="inline-flex items-center gap-2 font-semibold text-sm hover:gap-3 transition-all"
              style={{ color: primary }}
            >
              View all posts <ArrowRight className="w-4 h-4" />
            </a>
          )}
        </div>

        {loading ? (
          <div className="grid md:grid-cols-3 gap-8">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-2xl overflow-hidden bg-gray-50 animate-pulse">
                <div className="aspect-video bg-gray-200" />
                <div className="p-5 space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-1/3" />
                  <div className="h-5 bg-gray-200 rounded w-full" />
                  <div className="h-4 bg-gray-200 rounded w-5/6" />
                  <div className="h-4 bg-gray-200 rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p>No posts published yet.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-8">
            {posts.map(post => (
              <a
                key={post.id}
                href={`${basePath}/${post.slug}`}
                className="group block rounded-2xl overflow-hidden border border-gray-100 hover:shadow-lg transition-all"
              >
                {/* Cover */}
                <div className="aspect-video bg-gray-100 overflow-hidden">
                  {post.cover_image_url ? (
                    <img
                      src={post.cover_image_url}
                      alt={post.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300 text-5xl font-bold">
                      {post.title[0] ?? 'B'}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-5">
                  {/* Meta */}
                  <div className="flex items-center gap-3 text-xs text-gray-400 mb-3">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {post.read_time_minutes ? `${post.read_time_minutes} min read` : formatDate(post.published_at)}
                    </span>
                    {post.tags?.[0] && (
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ background: primary + '22', color: primary }}
                      >
                        {post.tags[0]}
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-gray-900 text-base leading-snug mb-2 group-hover:text-primary transition-colors line-clamp-2">
                    {post.title}
                  </h3>
                  <p className="text-gray-500 text-sm leading-relaxed line-clamp-3 mb-4">
                    {post.excerpt}
                  </p>

                  <div className="flex items-center justify-between text-xs text-gray-400 border-t border-gray-100 pt-3">
                    <span>{post.author_name}</span>
                    <span>{formatDate(post.published_at)}</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

