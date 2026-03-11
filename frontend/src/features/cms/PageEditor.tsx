/**
 * frontend/src/features/cms/PageEditor.tsx
 * Phase 2 — GrapeJS Visual Page Editor
 *
 * Route: /cms/pages/:pageId/edit
 *
 * KEY IMPLEMENTATION NOTES:
 *  1. GrapeJS CSS is imported statically so Vite bundles it with this chunk.
 *     Without it, all GrapeJS panels are invisible (unstyled divs).
 *  2. Tailwind's * box-sizing reset is neutralised for .gjs-editor in index.css.
 *  3. Container layout: parent is `position:relative flex-1`, child is
 *     `position:absolute inset-0` — GrapeJS needs a positioned block with
 *     explicit pixel dimensions, not a flex child with height:100%.
 *  4. Save flow: export grapes_data (JSON) + custom_html + custom_css → PUT
 *     to /api/v1/cms/pages/{pk}/grapes/. Public renderer serves custom_html.
 *  5. Desktop-only — redirects mobile visitors back to pages tab.
 */

// ── GrapeJS CSS — MUST be a static import so Vite processes it ───────────────
// Dynamic import() does NOT work for CSS in Vite; this loads with the chunk.
import 'grapesjs/dist/css/grapes.min.css'

import { useEffect, useRef, useCallback, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowLeft, Save, ExternalLink, Loader2, Monitor, Tablet, Smartphone, Undo2, Redo2 } from 'lucide-react'
import { useCMSPages, useCMSPageGrapes, useSaveCMSPageGrapes } from './hooks'
import type { CMSPage } from './types'

// ── Minimal GrapeJS type surface we use ──────────────────────────────────────
type GrapeEditor = {
  getHtml:         () => string
  getCss:          (opts?: { avoidProtected?: boolean }) => string
  getProjectData:  () => Record<string, unknown>
  loadProjectData: (data: Record<string, unknown>) => void
  setComponents:   (html: string) => void
  destroy:         () => void
  on:              (event: string, cb: () => void) => void
  UndoManager:     { undo: () => void; redo: () => void; hasUndo: () => boolean; hasRedo: () => boolean }
  setDevice:       (name: string) => void
  getDevice:       () => string
}

type Device = 'Desktop' | 'Tablet' | 'Mobile portrait'

// ── DeviceBar component ───────────────────────────────────────────────────────
function DeviceBar({ editor }: { editor: GrapeEditor | null }) {
  const [device, setDevice] = useState<Device>('Desktop')
  if (!editor) return null

  const switchDevice = (name: Device) => {
    editor.setDevice(name)
    setDevice(name)
  }

  return (
    <div className="flex items-center gap-0.5 bg-gray-700 rounded-lg p-0.5">
      {([
        { name: 'Desktop' as Device,          Icon: Monitor,    title: 'Desktop' },
        { name: 'Tablet' as Device,           Icon: Tablet,     title: 'Tablet' },
        { name: 'Mobile portrait' as Device,  Icon: Smartphone, title: 'Mobile' },
      ] as const).map(({ name, Icon, title }) => (
        <button
          key={name}
          onClick={() => switchDevice(name)}
          title={title}
          className={`p-1.5 rounded-md transition-colors ${
            device === name
              ? 'bg-indigo-600 text-white'
              : 'text-gray-400 hover:text-white hover:bg-gray-600'
          }`}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PageEditor() {
  const { pageId } = useParams<{ pageId: string }>()
  const navigate   = useNavigate()
  const id         = Number(pageId)

  // Two refs: outer = positioned wrapper, inner = GrapeJS mount target
  const wrapperRef   = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef    = useRef<GrapeEditor | null>(null)
  const [editorReady, setEditorReady] = useState(false)

  const { data: pages = [], isLoading: pagesLoading } = useCMSPages()
  const page: CMSPage | undefined = pages.find(p => p.id === id)

  const { data: grapes, isLoading: grapesLoading } = useCMSPageGrapes(id)
  const saveMutation = useSaveCMSPageGrapes(id)

  const isLoading = pagesLoading || grapesLoading

  // ── GrapeJS init — runs once after data is ready ──────────────────────────
  useEffect(() => {
    if (isLoading || !containerRef.current || editorRef.current) return

    Promise.all([
      import('grapesjs'),
      import('grapesjs-blocks-basic'),
      import('grapesjs-preset-webpage'),
    ]).then(([{ default: gjs }, basicBlocks, presetWebpage]) => {
      if (!containerRef.current) return

      const editor = gjs.init({
        container: containerRef.current,
        // Let GrapeJS fill its container — layout is handled by CSS (absolute inset-0)
        height: '100%',
        width:  'auto',

        storageManager: false,   // we own persistence
        undoManager:    { trackChanges: true },

        // Plugins
        plugins:     [basicBlocks.default, presetWebpage.default],
        pluginsOpts: {
          [(basicBlocks.default as { id?: string }).id ?? 'gjs-blocks-basic']: {},
          [(presetWebpage.default as { id?: string }).id ?? 'grapesjs-preset-webpage']: {},
        },

        // Device manager — drives the toolbar preview buttons
        deviceManager: {
          devices: [
            { name: 'Desktop',         width: '' },
            { name: 'Tablet',          width: '768px',  widthMedia: '768px' },
            { name: 'Mobile portrait', width: '320px',  widthMedia: '480px' },
          ],
        },

        // Canvas fonts
        canvas: {
          styles: [
            'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap',
          ],
        },

        // Minimal panel config — use the preset-webpage defaults for blocks/styles
        panels: { defaults: [] },
      }) as unknown as GrapeEditor

      editorRef.current = editor

      // Populate content (priority: saved GrapeJS state → saved custom HTML → block bootstrap)
      if (grapes?.grapes_data && Object.keys(grapes.grapes_data).length > 0) {
        editor.loadProjectData(grapes.grapes_data as Record<string, unknown>)
      } else if (grapes?.custom_html) {
        editor.setComponents(grapes.custom_html)
      } else if (grapes?.bootstrap_html) {
        // First-time open: pre-populate editor with inline-styled block HTML
        editor.setComponents(grapes.bootstrap_html)
      }

      setEditorReady(true)
    })

    return () => {
      if (editorRef.current) {
        editorRef.current.destroy()
        editorRef.current = null
        setEditorReady(false)
      }
    }
  }, [isLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save handler ──────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    const editor = editorRef.current
    if (!editor) return

    toast.loading('Saving…', { id: 'grapes-save' })
    try {
      await saveMutation.mutateAsync({
        grapes_data: editor.getProjectData(),
        custom_html: editor.getHtml(),
        custom_css:  editor.getCss({ avoidProtected: true }) ?? '',
      })
      toast.success('Page saved!', { id: 'grapes-save' })
    } catch {
      toast.error('Failed to save page', { id: 'grapes-save' })
    }
  }, [saveMutation])

  // ── Undo / Redo ───────────────────────────────────────────────────────────
  const handleUndo = () => editorRef.current?.UndoManager.undo()
  const handleRedo = () => editorRef.current?.UndoManager.redo()

  // ── Preview ───────────────────────────────────────────────────────────────
  const handlePreview = () => {
    const slug = page?.slug ?? ''
    window.open(slug ? `/preview/${slug}` : '/preview', '_blank', 'noopener')
  }

  // ── Mobile guard ──────────────────────────────────────────────────────────
  if (typeof window !== 'undefined' && window.innerWidth < 1024) {
    navigate('/cms?tab=pages')
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900">

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0 h-12">

        {/* Back */}
        <button
          onClick={() => navigate('/cms?tab=pages')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
        >
          <ArrowLeft size={14} />
          Pages
        </button>

        <div className="h-5 w-px bg-gray-600" />

        {/* Page name */}
        <span className="text-sm font-semibold text-white truncate max-w-xs">
          {isLoading ? 'Loading…' : (page?.title ?? `Page #${id}`)}
        </span>
        {page?.slug !== undefined && (
          <span className="text-xs text-gray-500 font-mono">
            /{page.slug || '(home)'}
          </span>
        )}

        {/* Centre: device switcher */}
        <div className="flex-1 flex justify-center">
          <DeviceBar editor={editorReady ? editorRef.current : null} />
        </div>

        {/* Right: undo, redo, preview, save */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleUndo}
            disabled={!editorReady}
            title="Undo (Ctrl+Z)"
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-700 hover:text-white disabled:opacity-40 transition-colors"
          >
            <Undo2 size={15} />
          </button>
          <button
            onClick={handleRedo}
            disabled={!editorReady}
            title="Redo (Ctrl+Shift+Z)"
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-700 hover:text-white disabled:opacity-40 transition-colors"
          >
            <Redo2 size={15} />
          </button>

          <div className="h-5 w-px bg-gray-600 mx-1" />

          <button
            onClick={handlePreview}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
          >
            <ExternalLink size={14} />
            Preview
          </button>
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending || !editorReady}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-60 transition-colors"
          >
            {saveMutation.isPending
              ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
              : <><Save size={14} /> Save</>}
          </button>
        </div>
      </header>

      {/* ── Editor area ─────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <Loader2 size={24} className="animate-spin mr-3" />
          Loading editor…
        </div>
      ) : (
        /*
         * LAYOUT KEY:
         *  - wrapperRef: `relative flex-1 min-h-0`  ← flex child, contains the fill
         *  - containerRef: `absolute inset-0`        ← GrapeJS mount target
         *
         * GrapeJS internally uses absolute positioning for panels. It needs
         * its mount element to have explicit dimensions (px), which a
         * `position:absolute; inset:0` child provides from the positioned parent.
         * Using `height: '100%'` on a raw flex child doesn't work.
         */
        <div ref={wrapperRef} className="relative flex-1 min-h-0">
          <div
            ref={containerRef}
            className="absolute inset-0"
          />
        </div>
      )}
    </div>
  )
}

