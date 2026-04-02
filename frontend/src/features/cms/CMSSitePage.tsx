/**
 * frontend/src/features/cms/CMSSitePage.tsx
 * Main CMS & Website Builder dashboard.
 *
 * Tabs are URL-driven via ?tab= query param so sidebar links work correctly.
 * Tabs: Site Settings | Pages | Blog | Domain | AI Generator
 */
import { useSearchParams } from 'react-router-dom'
import { Globe, Layout, BookOpen, Link2, Sparkles, ExternalLink, Eye, MessageSquare, BarChart2 } from 'lucide-react'
import { useCMSSite } from './hooks'
import { useTenantStore } from '../../store/tenantStore'
import SiteSettingsPanel from './SiteSettingsPanel'
import PageListPanel from './PageListPanel'
import BlogManager from './BlogManager'
import DomainSetup from './DomainSetup'
import AIGenerator from './AIGenerator'
import InquiriesPanel from './InquiriesPanel'
import AnalyticsPanel from './AnalyticsPanel'

/**
 * Derive the public website URL for the current tenant.
 *
 * Dev:  http://pro.localhost:5173/preview  (same host, /preview route)
 * Prod: https://els.bms.techyatra.com.np/preview (or custom domain)
 *
 * When a verified custom domain is set it takes precedence.
 */
function useWebsiteUrls(customDomain: string | null) {
  const subdomain = useTenantStore(s => s.subdomain)
  const { hostname, port, protocol } = window.location

  // Custom domain always wins
  if (customDomain) {
    return {
      liveUrl:    `https://${customDomain}`,
      previewUrl: `${protocol}//${hostname}${port ? ':' + port : ''}/preview`,
    }
  }

  // Build the subdomain URL for the current environment
  const base = `${protocol}//${hostname}${port ? ':' + port : ''}`
  return {
    liveUrl:    subdomain ? `https://${subdomain}.bms.techyatra.com.np` : null,
    previewUrl: `${base}/preview`,
  }
}

type Tab = 'settings' | 'pages' | 'blog' | 'domain' | 'ai' | 'inquiries' | 'analytics'

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'settings',  label: 'Site Settings', icon: Globe },
  { id: 'pages',     label: 'Pages',         icon: Layout },
  { id: 'blog',      label: 'Blog',          icon: BookOpen },
  { id: 'domain',    label: 'Domain',        icon: Link2 },
  { id: 'ai',        label: 'AI Generator',  icon: Sparkles },
  { id: 'inquiries', label: 'Inquiries',     icon: MessageSquare },
  { id: 'analytics', label: 'Analytics',     icon: BarChart2 },
]

export default function CMSSitePage() {
  const [params, setParams] = useSearchParams()
  const rawTab = params.get('tab') as Tab | null
  const activeTab: Tab = TABS.some(t => t.id === rawTab) ? (rawTab as Tab) : 'settings'

  const setTab = (id: Tab) => setParams({ tab: id }, { replace: true })

  const { data: site, isLoading } = useCMSSite()
  const { liveUrl, previewUrl } = useWebsiteUrls(site?.custom_domain ?? null)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">CMS &amp; Website Builder</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {isLoading
                ? 'Loading…'
                : site
                ? `${site.site_name || 'Untitled Site'} · ${site.is_published ? '🟢 Published' : '⚪ Draft'}`
                : 'Configure your public website'}
            </p>
            {/* Public website URL display */}
            {!isLoading && site && (
              <div className="flex items-center gap-3 mt-1.5">
                {liveUrl && (
                  <a
                    href={liveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 hover:underline"
                  >
                    <Globe size={11} />
                    {liveUrl.replace('https://', '')}
                  </a>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Eye size={14} />
              Preview
            </a>
            {liveUrl && site?.is_published && (
              <a
                href={liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                <ExternalLink size={14} />
                Visit Live Site
              </a>
            )}
          </div>
        </div>

        {/* Tabs */}
        <nav className="flex gap-1 mt-4 -mb-px overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`
                flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                ${activeTab === id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
              `}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        {activeTab === 'settings'  && <SiteSettingsPanel />}
        {activeTab === 'pages'      && <PageListPanel />}
        {activeTab === 'blog'       && <BlogManager />}
        {activeTab === 'domain'     && <DomainSetup />}
        {activeTab === 'ai'         && <AIGenerator />}
        {activeTab === 'inquiries'  && <InquiriesPanel />}
        {activeTab === 'analytics'  && <AnalyticsPanel />}
      </div>
    </div>
  )
}
