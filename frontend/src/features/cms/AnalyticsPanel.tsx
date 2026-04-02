/**
 * frontend/src/features/cms/AnalyticsPanel.tsx
 * Display page-view analytics and inquiry counts for the CMS site.
 *
 * Features: days filter (7/30/90), total views card, views-by-day sparkline,
 * top pages table, inquiry summary.
 */
import { useState } from 'react'
import { BarChart2, Eye, MessageSquare, TrendingUp } from 'lucide-react'
import { useCMSAnalytics } from './hooks'

const DAY_OPTIONS = [7, 30, 90]

export default function AnalyticsPanel() {
  const [days, setDays] = useState(30)
  const { data, isLoading } = useCMSAnalytics(days)

  return (
    <div className="space-y-6">
      {/* Header + day filter */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
          <BarChart2 size={16} className="text-indigo-500" />
          Website Analytics
        </h2>
        <div className="flex gap-1">
          {DAY_OPTIONS.map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                days === d
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {isLoading && <p className="text-sm text-gray-400">Loading analytics…</p>}

      {data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              icon={Eye}
              label="Total Views"
              value={data.total_views.toLocaleString()}
              color="indigo"
            />
            <StatCard
              icon={TrendingUp}
              label="Avg / Day"
              value={days > 0 ? Math.round(data.total_views / days).toLocaleString() : '0'}
              color="violet"
            />
            <StatCard
              icon={MessageSquare}
              label={`Inquiries (${days}d)`}
              value={data.total_inquiries.toString()}
              color="emerald"
            />
            <StatCard
              icon={MessageSquare}
              label="New Inquiries"
              value={data.new_inquiries.toString()}
              color="blue"
              highlight={data.new_inquiries > 0}
            />
          </div>

          {/* Views by day — simple bar chart */}
          {data.views_by_day.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-4">
                Views by Day
              </h3>
              <MiniBarChart data={data.views_by_day} />
            </div>
          )}

          {/* Top pages */}
          {data.top_pages.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-4">
                Top Pages
              </h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs font-medium text-gray-500 pb-2">Page</th>
                    <th className="text-right text-xs font-medium text-gray-500 pb-2">Views</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.top_pages.map((row, i) => (
                    <tr key={i}>
                      <td className="py-2 text-gray-700 font-mono text-xs">
                        /{row.page_slug || ''}
                      </td>
                      <td className="py-2 text-right text-gray-900 font-medium">
                        {row.count.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.total_views === 0 && data.total_inquiries === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">
              No data yet for this period. Publish your site to start tracking.
            </p>
          )}
        </>
      )}
    </div>
  )
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  highlight = false,
}: {
  icon: React.ElementType
  label: string
  value: string
  color: 'indigo' | 'violet' | 'emerald' | 'blue'
  highlight?: boolean
}) {
  const iconColors = {
    indigo:  'text-indigo-500 bg-indigo-50',
    violet:  'text-violet-500 bg-violet-50',
    emerald: 'text-emerald-500 bg-emerald-50',
    blue:    'text-blue-500 bg-blue-50',
  }
  return (
    <div className={`bg-white rounded-xl border p-4 space-y-2 ${highlight ? 'border-blue-300' : 'border-gray-200'}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconColors[color]}`}>
        <Icon size={16} />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  )
}

// ── Mini Bar Chart ────────────────────────────────────────────────────────────

function MiniBarChart({ data }: { data: { view_date: string; count: number }[] }) {
  const max = Math.max(...data.map(d => d.count), 1)
  return (
    <div className="flex items-end gap-0.5 h-24">
      {data.map((row, i) => {
        const heightPct = Math.max(4, Math.round((row.count / max) * 100))
        return (
          <div key={i} className="flex-1 flex flex-col items-center justify-end group relative">
            <div
              style={{ height: `${heightPct}%` }}
              className="w-full bg-indigo-400 rounded-t hover:bg-indigo-600 transition-colors"
            />
            {/* Tooltip */}
            <div className="absolute bottom-full mb-1 hidden group-hover:block bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
              {row.view_date}: {row.count}
            </div>
          </div>
        )
      })}
    </div>
  )
}
