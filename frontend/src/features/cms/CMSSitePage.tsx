/**
 * frontend/src/features/cms/CMSSitePage.tsx
 * Main CMS & Website Builder dashboard.
 *
 * Tabs are URL-driven via ?tab= query param so sidebar links work correctly.
 * Tabs: Site Settings | Pages | Blog | Domain | AI Generator
 */
import { useSearchParams } from 'react-router-dom'
import { Globe, Layout, BookOpen, Link2, Sparkles, ExternalLink } from 'lucide-react'
import { useCMSSite } from './hooks'
import SiteSettingsPanel from './SiteSettingsPanel'
import PageListPanel from './PageListPanel'
import BlogManager from './BlogManager'
import DomainSetup from './DomainSetup'
import AIGenerator from './AIGenerator'

type Tab = 'settings' | 'pages' | 'blog' | 'domain' | 'ai'

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'settings', label: 'Site Settings', icon: Globe },
  { id: 'pages',    label: 'Pages',         icon: Layout },
  { id: 'blog',     label: 'Blog',          icon: BookOpen },
  { id: 'domain',   label: 'Domain',        icon: Link2 },
  { id: 'ai',       label: 'AI Generator',  icon: Sparkles },
]

export default function CMSSitePage() {
  const [params, setParams] = useSearchParams()
  const rawTab = params.get('tab') as Tab | null
  const activeTab: Tab = TABS.some(t => t.id === rawTab) ? (rawTab as Tab) : 'settings'

  const setTab = (id: Tab) => setParams({ tab: id }, { replace: true })

  const { data: site, isLoading } = useCMSSite()

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
          </div>
          <a
            href="/preview"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            <ExternalLink size={14} />
            View Site
          </a>
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
        {activeTab === 'settings' && <SiteSettingsPanel />}
        {activeTab === 'pages'    && <PageListPanel />}
        {activeTab === 'blog'     && <BlogManager />}
        {activeTab === 'domain'   && <DomainSetup />}
        {activeTab === 'ai'       && <AIGenerator />}
      </div>
    </div>
  )
}
