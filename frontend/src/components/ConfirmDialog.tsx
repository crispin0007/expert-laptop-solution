/**
 * ConfirmDialog — Context-based professional confirm dialog.
 *
 * Usage:
 *   1. Wrap app in <ConfirmProvider> (already done in main.tsx)
 *   2. In any component: const confirm = useConfirm()
 *   3. Call: await confirm({ title, message, variant, confirmLabel, cancelLabel })
 *      Returns true if user confirms, false if they cancel.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { AlertTriangle, Trash2, Info, X } from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────────────

export type ConfirmVariant = 'danger' | 'warning' | 'info'

export interface ConfirmOptions {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: ConfirmVariant
}

interface ConfirmState extends ConfirmOptions {
  resolve: (ok: boolean) => void
}

// ─── Context ─────────────────────────────────────────────────────────────────

const ConfirmContext = createContext<(opts: ConfirmOptions) => Promise<boolean>>(
  async () => false,
)

// ─── Provider ────────────────────────────────────────────────────────────────

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null)

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>(resolve => setState({ ...opts, resolve }))
  }, [])

  function handleResolve(ok: boolean) {
    state?.resolve(ok)
    setState(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <ConfirmModal
          {...state}
          onConfirm={() => handleResolve(true)}
          onCancel={() => handleResolve(false)}
        />
      )}
    </ConfirmContext.Provider>
  )
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  return useContext(ConfirmContext)
}

// ─── Modal ───────────────────────────────────────────────────────────────────

interface ModalProps extends ConfirmState {
  onConfirm: () => void
  onCancel: () => void
}

const VARIANT_CONFIG: Record<
  ConfirmVariant,
  { icon: ReactNode; iconBg: string; confirmCls: string }
> = {
  danger: {
    icon: <Trash2 size={20} className="text-red-600" />,
    iconBg: 'bg-red-100',
    confirmCls:
      'bg-red-600 hover:bg-red-700 focus:ring-red-500 text-white',
  },
  warning: {
    icon: <AlertTriangle size={20} className="text-amber-600" />,
    iconBg: 'bg-amber-100',
    confirmCls:
      'bg-amber-500 hover:bg-amber-600 focus:ring-amber-400 text-white',
  },
  info: {
    icon: <Info size={20} className="text-blue-600" />,
    iconBg: 'bg-blue-100',
    confirmCls:
      'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500 text-white',
  },
}

function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const cfg = VARIANT_CONFIG[variant]

  // Focus cancel button on open (safe default)
  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  // Escape key handler
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      aria-modal="true"
      role="dialog"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Close × button */}
        <button
          onClick={onCancel}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition p-1 rounded-full hover:bg-gray-100"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <div className="p-6 space-y-4">
          {/* Icon + title */}
          <div className="flex items-center gap-3">
            <div className={`flex items-center justify-center w-10 h-10 rounded-full shrink-0 ${cfg.iconBg}`}>
              {cfg.icon}
            </div>
            <h2
              id="confirm-title"
              className="text-base font-semibold text-gray-900 leading-snug"
            >
              {title ?? (variant === 'danger' ? 'Are you sure?' : 'Confirm Action')}
            </h2>
          </div>

          {/* Message */}
          <p id="confirm-message" className="text-sm text-gray-600 leading-relaxed pl-[3.25rem]">
            {message}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end px-6 pb-5">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition focus:outline-none focus:ring-2 focus:ring-gray-300"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm rounded-lg font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-1 ${cfg.confirmCls}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
