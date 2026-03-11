/**
 * PublicSite.tsx — Public website renderer.
 *
 * Route: /preview/*  (no auth required)
 * Data source: /api/v1/cms/public/* (unauthenticated API)
 *
 * Sub-routes handled internally:
 *   /preview/           → home page (slug='')
 *   /preview/services   → page slug='services'
 *   /preview/blog       → blog listing
 *   /preview/blog/slug  → blog post
 *   /preview/:slug      → any other page
 */
import { useState, useEffect } from 'react'
import { Routes, Route, Link, useParams, useSearchParams } from 'react-router-dom'
import apiClient from '../../../api/client'
import { BlockRenderer, type Block } from './Blocks'
import { Menu, X, ChevronRight, Clock, Tag } from 'lucide-react'

// Draft endpoints: auth-required, bypass is_published
// This renderer is only ever mounted at /preview/* (logged-in staff)
// NOTE: apiClient already has baseURL='/api/v1' — do NOT repeat the prefix here
const BASE = '/cms/draft'

// ── API calls ─────────────────────────────────────────────────────────────────
async function fetchSite() {
  const r = await apiClient.get(`${BASE}/site/`)
  return r.data.data
}
async function fetchPage(slug: string) {
  // Empty slug = home page; use /pages/ (no slug segment) to avoid /pages// 404
  const url = slug ? `${BASE}/pages/${slug}/` : `${BASE}/pages/`
  const r = await apiClient.get(url)
  return r.data.data
}
async function fetchBlogList() {
  const r = await apiClient.get(`${BASE}/blog/`)
  const payload = r.data.data ?? r.data.results ?? r.data
  return Array.isArray(payload) ? payload : []
}
async function fetchBlogPost(slug: string) {
  const r = await apiClient.get(`${BASE}/blog/${slug}/`)
  return r.data.data
}

// ── Site context ──────────────────────────────────────────────────────────────
interface SiteData {
  site_name: string
  tagline: string
  logo: string | null
  primary_color: string
  secondary_color: string
  font_family: string
  default_meta_title: string
  pages: NavPage[]
  custom_domain: string | null
}
interface NavPage {
  page_type: string
  title: string
  slug: string
  show_in_nav: boolean
}

// ── Nav ───────────────────────────────────────────────────────────────────────
function SiteNav({ site, basePath }: { site: SiteData; basePath: string }) {
  const [open, setOpen] = useState(false)
  const p = site.primary_color

  const navPages = site.pages.filter(p => p.show_in_nav)

  function pageHref(page: NavPage) {
    if (page.page_type === 'blog_index') return `${basePath}/blog`
    return page.slug ? `${basePath}/${page.slug}` : basePath
  }

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm">
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-16">
        {/* Logo / brand */}
        <Link to={basePath} className="flex items-center gap-2">
          {site.logo
            ? <img src={site.logo} alt={site.site_name} className="h-8 w-auto" />
            : <span className="text-xl font-extrabold" style={{ color: p }}>{site.site_name}</span>
          }
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navPages.map(page => (
            <Link
              key={page.slug}
              to={pageHref(page)}
              className="px-4 py-2 text-sm font-medium text-gray-600 rounded-lg hover:text-gray-900 hover:bg-gray-100 transition-colors"
            >
              {page.title}
            </Link>
          ))}
        </nav>

        {/* Mobile hamburger */}
        <button
          onClick={() => setOpen(o => !o)}
          className="md:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-gray-100 bg-white px-4 py-3 space-y-1">
          {navPages.map(page => (
            <Link
              key={page.slug}
              to={pageHref(page)}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <ChevronRight size={14} className="text-gray-400" />
              {page.title}
            </Link>
          ))}
        </div>
      )}
    </header>
  )
}

// ── Footer ────────────────────────────────────────────────────────────────────
function SiteFooter({ site }: { site: SiteData }) {
  return (
    <footer className="border-t border-gray-200 bg-gray-50 py-10 px-6 text-center text-sm text-gray-400">
      <p className="font-semibold text-gray-600 mb-1">{site.site_name}</p>
      {site.tagline && <p className="mb-3">{site.tagline}</p>}
      <p>© {new Date().getFullYear()} {site.site_name}. All rights reserved.</p>
      <p className="mt-2 text-xs text-gray-300">Powered by NEXUS BMS</p>
    </footer>
  )
}

// ── Loading / Error ───────────────────────────────────────────────────────────
function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function ErrorScreen({ msg }: { msg: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center text-center px-6">
      <div>
        <div className="text-6xl mb-4">😕</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Page Not Found</h1>
        <p className="text-gray-500 mb-6">{msg}</p>
        <Link to="/preview" className="text-indigo-600 font-medium hover:underline">← Back to Home</Link>
      </div>
    </div>
  )
}

// ── Page renderer ─────────────────────────────────────────────────────────────
function PageView({ slug, site, pageId }: { slug: string; site: SiteData; pageId?: string }) {
  const [page, setPage] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    // If a numeric pageId is provided, fetch by ID (bypasses slug requirement)
    const fetcher = pageId
      ? apiClient.get(`${BASE}/pages/${pageId}/`).then(r => r.data.data)
      : fetchPage(slug)
    fetcher
      .then(setPage)
      .catch(() => setError('This page could not be found.'))
      .finally(() => setLoading(false))
  }, [slug, pageId])

  if (loading) return <LoadingSpinner />
  if (error || !page) return <ErrorScreen msg={error} />

  // ── GrapeJS visual-editor path ───────────────────────────────────────────
  // When a page has been saved via the visual editor, the API returns:
  //   custom_html: the rendered HTML from GrapeJS
  //   custom_css:  the styles exported from GrapeJS
  //   blocks: []   (suppressed by PublicPageDetailSerializer)
  // In this case we render the raw HTML + inject the CSS directly.
  if (page.custom_html) {
    return (
      <main>
        {page.custom_css && (
          <style dangerouslySetInnerHTML={{ __html: page.custom_css }} />
        )}
        <div dangerouslySetInnerHTML={{ __html: page.custom_html }} />
      </main>
    )
  }

  // ── Block-builder path ───────────────────────────────────────────────────
  const blocks: Block[] = (page.blocks ?? []).filter((b: Block) => b !== null)
  const theme = { primary_color: site.primary_color, secondary_color: site.secondary_color, font_family: site.font_family }

  return (
    <main>
      {blocks.length === 0 && (
        <div className="py-32 text-center text-gray-400">
          <p className="text-lg">This page has no content yet.</p>
        </div>
      )}
      {blocks.map((block, i) => (
        <BlockRenderer key={i} block={block} theme={theme} />
      ))}
    </main>
  )
}

// ── Blog listing ──────────────────────────────────────────────────────────────
function BlogListView({ site, basePath }: { site: SiteData; basePath: string }) {
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const p = site.primary_color

  useEffect(() => {
    fetchBlogList().then(setPosts).finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner />

  return (
    <main className="min-h-screen bg-white">
      {/* Header */}
      <div className="py-20 px-6 text-center text-white" style={{ background: `linear-gradient(135deg, ${p} 0%, ${site.secondary_color} 100%)` }}>
        <h1 className="text-4xl font-extrabold mb-3">Blog</h1>
        <p className="text-white/80">Insights, guides, and news from {site.site_name}</p>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-16">
        {posts.length === 0 ? (
          <p className="text-center text-gray-400">No posts published yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {posts.map((post: any, i: number) => (
              <Link
                key={i}
                to={`${basePath}/blog/${post.slug}`}
                className="group block bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5"
              >
                {post.featured_image && (
                  <img src={post.featured_image} alt={post.title} className="w-full h-48 object-cover" />
                )}
                {!post.featured_image && (
                  <div className="w-full h-4 opacity-60" style={{ background: `linear-gradient(90deg, ${p}, ${site.secondary_color})` }} />
                )}
                <div className="p-6">
                  <h2 className="text-lg font-bold text-gray-900 group-hover:text-indigo-600 mb-2 leading-snug">
                    {post.title}
                  </h2>
                  {post.excerpt && <p className="text-sm text-gray-500 leading-relaxed mb-4 line-clamp-3">{post.excerpt}</p>}
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {post.read_time_minutes} min read
                    </span>
                    {post.author_name && <span>by {post.author_name}</span>}
                  </div>
                  {post.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {post.tags.slice(0, 3).map((tag: string) => (
                        <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                          <Tag size={9} />{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

// ── Blog post detail ──────────────────────────────────────────────────────────
function BlogPostView({ site }: { site: SiteData }) {
  const { slug } = useParams<{ slug: string }>()
  const [post, setPost] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const p = site.primary_color

  useEffect(() => {
    if (!slug) return
    setLoading(true)
    fetchBlogPost(slug).then(setPost).finally(() => setLoading(false))
  }, [slug])

  if (loading) return <LoadingSpinner />
  if (!post) return <ErrorScreen msg="This blog post could not be found." />

  return (
    <main>
      {/* Hero */}
      <div className="py-20 px-6 text-white" style={{ background: `linear-gradient(135deg, ${p} 0%, ${site.secondary_color} 100%)` }}>
        <div className="max-w-3xl mx-auto">
          {post.tags?.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {post.tags.map((tag: string) => (
                <span key={tag} className="px-3 py-0.5 rounded-full text-xs font-medium bg-white/20 text-white">{tag}</span>
              ))}
            </div>
          )}
          <h1 className="text-3xl md:text-5xl font-extrabold leading-tight mb-4">{post.title}</h1>
          <div className="flex items-center gap-4 text-white/70 text-sm">
            {post.author_name && <span>by {post.author_name}</span>}
            <span className="flex items-center gap-1"><Clock size={13} />{post.read_time_minutes} min read</span>
          </div>
        </div>
      </div>

      {/* Body */}
      <article className="max-w-3xl mx-auto px-6 py-14">
        {post.excerpt && <p className="text-xl text-gray-500 leading-relaxed mb-8 border-l-4 pl-5" style={{ borderColor: p }}>{post.excerpt}</p>}
        <div
          className="prose prose-gray prose-lg max-w-none"
          dangerouslySetInnerHTML={{ __html: post.body }}
        />
        <div className="mt-12 pt-8 border-t border-gray-100">
          <Link to="/preview/blog" className="text-sm font-medium hover:underline" style={{ color: p }}>
            ← Back to Blog
          </Link>
        </div>
      </article>
    </main>
  )
}

// ── Page dispatcher by slug ───────────────────────────────────────────────────
function SlugPage({ site }: { site: SiteData }) {
  const { slug = '' } = useParams<{ slug: string }>()
  const [searchParams] = useSearchParams()
  const pageId = searchParams.get('pageId') ?? undefined
  return <PageView slug={slug} site={site} pageId={pageId} />
}

// ── Main public site ──────────────────────────────────────────────────────────
const FALLBACK_SITE: SiteData = {
  site_name: 'Preview',
  tagline: '',
  logo: null,
  primary_color: '#4F46E5',
  secondary_color: '#7C3AED',
  font_family: 'Inter',
  default_meta_title: '',
  pages: [],
  custom_domain: null,
}

export default function PublicSite() {
  const [site, setSite] = useState<SiteData | null>(null)
  const [loading, setLoading] = useState(true)
  const basePath = '/preview'
  // Must be called unconditionally, before any early return (Rules of Hooks)
  const [searchParams] = useSearchParams()

  useEffect(() => {
    fetchSite()
      .then(setSite)
      .catch(() => setSite(FALLBACK_SITE))   // never hard-block on missing/unpublished site
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner />

  const activeSite = site ?? FALLBACK_SITE

  // If ?pageId=<n> on the index route, pass it through
  const rootPageId = searchParams.get('pageId') ?? undefined

  return (
    <div style={{ fontFamily: `'${activeSite.font_family}', sans-serif` }}>
      <SiteNav site={activeSite} basePath={basePath} />
      <Routes>
        <Route index element={<PageView slug="" site={activeSite} pageId={rootPageId} />} />
        <Route path="blog" element={<BlogListView site={activeSite} basePath={basePath} />} />
        <Route path="blog/:slug" element={<BlogPostView site={activeSite} />} />
        <Route path=":slug" element={<SlugPage site={activeSite} />} />
      </Routes>
      <SiteFooter site={activeSite} />
    </div>
  )
}
