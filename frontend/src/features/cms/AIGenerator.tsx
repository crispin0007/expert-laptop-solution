/**
 * frontend/src/features/cms/AIGenerator.tsx
 * Generate website designs using AI.
 *
 * Phase 1: stub backend returns 3 placeholder designs.
 * Phase 2: real LLM (Claude/Gemini) generation.
 *
 * Flow:
 *  1. Enter a prompt describing the business
 *  2. POST /cms/generate/ → job created (queued)
 *  3. Poll job until status=completed (auto via refetchInterval in hook)
 *  4. Display 3 design cards with theme preview
 *  5. Select design → POST /cms/generate/{id}/select/ → applies to site + pages
 */
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Sparkles, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { useCMSGenerationJobs, useStartCMSGeneration, useCMSGenerationJob, useSelectCMSDesign } from './hooks'
import type { DesignOption } from './types'

// ── Design card ───────────────────────────────────────────────────────────────

function DesignCard({
  design,
  index: _index,
  selected,
  onSelect,
}: {
  design: DesignOption
  index: number
  selected: boolean
  onSelect: () => void
}) {
  return (
    <div
      onClick={onSelect}
      className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
        selected ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white hover:border-gray-400'
      }`}
    >
      {/* Theme preview swatch */}
      <div className="flex gap-2 mb-3">
        <div className="w-8 h-8 rounded" style={{ backgroundColor: design.theme.primary_color }} />
        <div className="w-8 h-8 rounded" style={{ backgroundColor: design.theme.secondary_color }} />
      </div>
      <h3 className="text-sm font-semibold text-gray-900">{design.name}</h3>
      <p className="text-xs text-gray-500 mt-1">{design.description}</p>
      <p className="text-xs text-gray-400 mt-2">Font: {design.theme.font_family}</p>
      <p className="text-xs text-gray-400">Pages: {design.pages.length}</p>
      {selected && (
        <div className="flex items-center gap-1 mt-3 text-indigo-600 text-xs font-medium">
          <CheckCircle size={12} /> Selected
        </div>
      )}
    </div>
  )
}

// ── Job status display ────────────────────────────────────────────────────────

function JobPanel({ jobId }: { jobId: number }) {
  const { data: job } = useCMSGenerationJob(jobId)
  const selectMutation = useSelectCMSDesign(jobId)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [applyToSite, setApplyToSite] = useState(true)

  if (!job) return null

  const handleApply = async () => {
    if (selectedIndex === null) { toast.error('Select a design first'); return }
    try {
      await selectMutation.mutateAsync({ design_index: selectedIndex, apply_to_site: applyToSite })
      toast.success(applyToSite ? 'Design applied to your site!' : 'Design saved')
    } catch {
      toast.error('Failed to apply design')
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          Job #{job.id} · {new Date(job.created_at).toLocaleString()}
        </p>
        <StatusBadge status={job.status} />
      </div>

      <p className="text-sm text-gray-700 italic">"{job.prompt}"</p>

      {job.status === 'queued' || job.status === 'generating' ? (
        <div className="flex items-center gap-2 text-indigo-600 text-sm">
          <Loader2 size={16} className="animate-spin" /> Generating designs…
        </div>
      ) : job.status === 'failed' ? (
        <div className="flex items-center gap-2 text-red-600 text-sm">
          <AlertCircle size={16} /> Generation failed: {job.failure_reason ?? 'unknown error'}
        </div>
      ) : job.design_options && job.design_options.length > 0 ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            {job.design_options.map((design, i) => (
              <DesignCard
                key={i}
                design={design}
                index={i}
                selected={selectedIndex === i}
                onSelect={() => setSelectedIndex(i)}
              />
            ))}
          </div>
          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={applyToSite} onChange={e => setApplyToSite(e.target.checked)} />
              Apply theme + pages to my site
            </label>
            <button
              onClick={handleApply}
              disabled={selectedIndex === null || selectMutation.isPending}
              className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {selectMutation.isPending ? 'Applying…' : 'Apply Design'}
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const MAP: Record<string, string> = {
    queued:     'bg-amber-100 text-amber-700',
    generating: 'bg-blue-100 text-blue-700',
    completed:  'bg-emerald-100 text-emerald-700',
    failed:     'bg-red-100 text-red-600',
  }
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${MAP[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AIGenerator() {
  const { data: jobs = [], isLoading } = useCMSGenerationJobs()
  const startMutation = useStartCMSGeneration()

  const [prompt, setPrompt] = useState('')
  const [activeJobId, setActiveJobId] = useState<number | null>(null)

  const handleGenerate = async () => {
    if (!prompt.trim()) { toast.error('Describe your business first'); return }
    try {
      const job = await startMutation.mutateAsync({ prompt: prompt.trim() })
      setActiveJobId(job.id)
      toast.success('Generation started — designs will appear shortly')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { errors?: string[] } } })?.response?.data?.errors?.[0]
      toast.error(msg ?? 'Failed to start generation')
    }
  }

  return (
    <div className="space-y-6">
      {/* Prompt panel */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-indigo-500" />
          <h2 className="text-sm font-semibold text-gray-700">Generate Website with AI</h2>
          <span className="text-xs text-gray-400 ml-auto">10 generations / day</span>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Describe your business
          </label>
          <textarea
            className="input w-full"
            rows={4}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="e.g. We are an IT solutions company in Kathmandu specialising in network infrastructure, cybersecurity consultancy, and cloud migration for SMEs. We want a professional, trustworthy look."
          />
        </div>
        <div className="flex justify-end">
          <button
            onClick={handleGenerate}
            disabled={startMutation.isPending}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {startMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {startMutation.isPending ? 'Starting…' : 'Generate Designs'}
          </button>
        </div>
      </div>

      {/* Active job */}
      {activeJobId && <JobPanel key={activeJobId} jobId={activeJobId} />}

      {/* Past jobs */}
      {!isLoading && jobs.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Past Generations</h3>
          {jobs.filter(j => j.id !== activeJobId).map(job => (
            <div key={job.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-2.5">
              <div>
                <p className="text-sm text-gray-700 truncate max-w-sm">"{job.prompt}"</p>
                <p className="text-xs text-gray-400">{new Date(job.created_at).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={job.status} />
                {job.status === 'completed' && (
                  <button
                    onClick={() => setActiveJobId(job.id)}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    View designs
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
