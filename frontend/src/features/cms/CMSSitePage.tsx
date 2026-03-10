/**
 * frontend/src/features/cms/CMSSitePage.tsx
 * Main CMS & Website Builder dashboard.
 *
 * Tabs: Site Settings | Pages | Blog | Domain | AI Generator
 */
import { useState } from 'react'
import { Globe, Layout, BookOpen, Link2, Sparkles } from 'lucide-react'
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
  const [activeTab, setActiveTab] = useState<Tab>('settings')
  const { data: site, isLoading } = useCMSSite()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">CMS & Website Builder</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {isLoading
                ? 'Loading…'
                : site
                ? `${site.site_name || 'Untitled Site'} · ${site.is_published ? '🟢 Published' : '⚪ Draft'}`
                : 'Configure your public website'}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <nav className="flex gap-1 mt-4 -mb-px">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`
                flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors
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
