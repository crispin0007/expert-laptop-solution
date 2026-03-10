/**
 * DateDisplay
 * ===========
 * Respects the user's date mode preference (BS or AD).
 *
 * When dateMode = 'bs' (default):
 *   Primary   — Nepali/Bikram Sambat date   e.g. "2082-11-17"
 *   Secondary — English/Gregorian date      e.g. "2026-02-28"
 *
 * When dateMode = 'ad':
 *   Primary   — English/Gregorian date      e.g. "2026-02-28"
 *   Secondary — Nepali/Bikram Sambat date   e.g. "2082-11-17"
 *
 * Usage:
 *   <DateDisplay bsDisplay={invoice.created_at_bs} />
 *   <DateDisplay adDate={invoice.created_at} />
 *   <DateDisplay bsDisplay={ticket.sla_deadline_bs} adDate={ticket.sla_deadline} />
 */

import { type BsDateDisplay, resolveBsDisplay } from '../utils/nepaliDate'
import { usePreferenceStore } from '../store/preferenceStore'

interface Props {
  /** Pre-converted BS display from API ``field_bs`` companion (preferred). */
  bsDisplay?: BsDateDisplay | null;
  /** Raw AD date or datetime string (fallback if bsDisplay is absent). */
  adDate?: string | null;
  /** Show time component (only meaningful for datetime fields). */
  showTime?: boolean;
  /** Show the secondary calendar beneath the primary. Default: true. */
  showAd?: boolean;
  /** Extra class applied to the wrapper. */
  className?: string;
  /** Compact mode: shows only the primary date without the secondary line. */
  compact?: boolean;
}

export default function DateDisplay({
  bsDisplay,
  adDate,
  showTime = false,
  showAd = true,
  className = '',
  compact = false,
}: Props) {
  const dateMode = usePreferenceStore(s => s.dateMode)
  const display = resolveBsDisplay(bsDisplay, adDate)

  if (!display) {
    return <span className={`text-gray-400 text-sm ${className}`}>—</span>
  }

  const timeLabel = showTime && display.time ? ` ${display.time}` : ''

  // Choose primary/secondary based on user preference
  const primaryLabel   = dateMode === 'ad' ? display.ad_iso  : display.bs
  const secondaryLabel = dateMode === 'ad' ? display.bs      : display.ad_iso
  const primaryTitle   = dateMode === 'ad' ? `BS: ${display.bs}` : `AD: ${display.ad_iso}`

  if (compact) {
    return (
      <span
        className={`text-sm font-medium text-gray-800 ${className}`}
        title={primaryTitle}
      >
        {primaryLabel}{timeLabel}
      </span>
    )
  }

  return (
    <span className={`inline-flex flex-col leading-tight ${className}`}>
      {/* Primary */}
      <span className="text-sm font-semibold text-gray-900">
        {primaryLabel}{timeLabel}
      </span>

      {/* Secondary */}
      {showAd && (
        <span className="text-xs text-gray-400 mt-0.5">
          {secondaryLabel}
          {showTime && display.time ? ` · ${display.time}` : ''}
        </span>
      )}
    </span>
  )
}

