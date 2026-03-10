/**
 * FiscalYearBadge
 * ===============
 * Displays the current Nepal fiscal year in a compact badge.
 * Uses the client-computed value immediately (no loading state).
 *
 * Usage:
 *   <FiscalYearBadge />
 *   <FiscalYearBadge variant="outline" showRange />
 */

import { currentFiscalYear, fiscalYearDateRange, adToIso } from '../utils/nepaliDate';

interface Props {
  /** Show the AD date range below the FY label. Default: false. */
  showRange?: boolean;
  /** Display variant. Default: "solid". */
  variant?: 'solid' | 'outline' | 'text';
  /** Extra class. */
  className?: string;
}

export default function FiscalYearBadge({ showRange = false, variant = 'solid', className = '' }: Props) {
  const fy = currentFiscalYear();
  const { startAd, endAd } = fiscalYearDateRange(fy);

  const baseStyle: Record<string, string> = {
    solid:   'bg-blue-600 text-white px-2.5 py-0.5 rounded-full text-xs font-semibold',
    outline: 'border border-blue-600 text-blue-700 px-2.5 py-0.5 rounded-full text-xs font-semibold',
    text:    'text-blue-700 text-xs font-semibold',
  };

  return (
    <span className={`inline-flex flex-col items-start gap-0.5 ${className}`}>
      <span className={baseStyle[variant]} title={`Nepal Fiscal Year ${fy.labelFull}`}>
        FY {fy.label}
      </span>
      {showRange && (
        <span className="text-xs text-gray-500">
          {adToIso(startAd)} → {adToIso(endAd)}
        </span>
      )}
    </span>
  );
}
