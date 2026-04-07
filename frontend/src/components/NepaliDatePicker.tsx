/**
 * NepaliDatePicker
 * ================
 * A date picker that respects the user's calendar preference.
 *
 * When dateMode = 'bs' (default):
 *   Shows Bikram Sambat (BS) dropdowns; emits AD ISO string for API.
 *
 * When dateMode = 'ad':
 *   Shows a native HTML date input (AD/Gregorian); still emits AD ISO string.
 *   Displays the BS equivalent as a hint below.
 *
 * The value prop and onChange callback always use AD ISO strings ("YYYY-MM-DD")
 * so the rest of the app remains unchanged regardless of the user's preference.
 *
 * Usage:
 *   <NepaliDatePicker
 *     value={adIsoValue}
 *     onChange={v => setDate(v)}
 *     label="Due Date"
 *   />
 */

import { useState, useEffect } from 'react';
import {
  adToBs,
  bsToAd,
  adToIso,
  todayBs,
  daysInBsMonth,
  BS_MONTH_NAMES_EN,
} from '../utils/nepaliDate';
import { usePreferenceStore } from '../store/preferenceStore';

interface Props {
  /** Controlled AD ISO date value "YYYY-MM-DD" or empty string. */
  value?: string | null;
  /** Called with the new AD ISO date string whenever the date changes. */
  onChange: (adIso: string) => void;
  /** Form field label. */
  label?: string;
  /** Placeholder text. */
  placeholder?: string;
  /** Mark as required. */
  required?: boolean;
  /** Disable the picker. */
  disabled?: boolean;
  /** Extra class on the wrapper. */
  className?: string;
  /** Minimum selectable AD date. */
  minAdDate?: string;
  /** Maximum selectable AD date. */
  maxAdDate?: string;
  /** Error message to display. */
  error?: string;
}

const YEAR_RANGE_START = 2070;
const YEAR_RANGE_END = 2095;

// ─── AD mode (native input) ─────────────────────────────────────────────────

function AdDatePicker({ value, onChange, label, placeholder, required, disabled, className, minAdDate, maxAdDate, error }: Props) {
  const bsHint = (() => {
    if (!value) return ''
    try {
      const [y, m, d] = value.split('-').map(Number)
      const bs = adToBs(new Date(y, m - 1, d))
      return `BS: ${bs.year}-${String(bs.month).padStart(2, '0')}-${String(bs.day).padStart(2, '0')}`
    } catch { return '' }
  })()

  return (
    <div className={`flex flex-col gap-1 ${className ?? ''}`}>
      {label && (
        <label className="text-sm font-medium text-gray-700">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <input
        type="date"
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        min={minAdDate}
        max={maxAdDate}
        className="w-full border border-gray-300 rounded-md bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 py-1.5 px-2 disabled:bg-gray-50 disabled:text-gray-400"
      />
      {!value && placeholder && <p className="text-xs text-gray-400">{placeholder}</p>}
      {bsHint && <p className="text-xs text-gray-400">{bsHint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

// ─── BS mode (dropdown selects) ─────────────────────────────────────────────

export default function NepaliDatePicker(props: Props) {
  const dateMode = usePreferenceStore(s => s.dateMode)

  if (dateMode === 'ad') {
    return <AdDatePicker {...props} />
  }

  return <BsDatePicker {...props} />
}

function BsDatePicker({
  value,
  onChange,
  label,
  placeholder = 'Select BS date',
  required = false,
  disabled = false,
  className = '',
  error,
}: Props) {
  const today = todayBs();

  // Parse initial AD value to BS
  const parsedInitial = (() => {
    if (!value) return null;
    try {
      const [y, m, d] = value.split('-').map(Number);
      return adToBs(new Date(y, m - 1, d));
    } catch {
      return null;
    }
  })();

  const [bsYear, setBsYear] = useState<number>(parsedInitial?.year ?? today.year);
  const [bsMonth, setBsMonth] = useState<number>(parsedInitial?.month ?? today.month);
  const [bsDay, setBsDay] = useState<number>(parsedInitial?.day ?? today.day);

  // Sync to external value changes
  useEffect(() => {
    if (!value) return;
    try {
      const [y, m, d] = value.split('-').map(Number);
      const bs = adToBs(new Date(y, m - 1, d));
      setBsYear(bs.year);
      setBsMonth(bs.month);
      setBsDay(bs.day);
    } catch {
      // ignore
    }
  }, [value]);

  const maxDayInMonth = daysInBsMonth(bsYear, bsMonth);

  // When month/year changes, clamp the day
  useEffect(() => {
    const max = daysInBsMonth(bsYear, bsMonth);
    if (bsDay > max) {
      const clamped = max;
      setBsDay(clamped);
      emit(bsYear, bsMonth, clamped);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bsYear, bsMonth]);

  function emit(y: number, m: number, d: number) {
    try {
      const ad = bsToAd(y, m, d);
      onChange(adToIso(ad));
    } catch {
      // invalid date — don't emit
    }
  }

  function handleYear(e: React.ChangeEvent<HTMLSelectElement>) {
    const y = Number(e.target.value);
    setBsYear(y);
    emit(y, bsMonth, bsDay);
  }

  function handleMonth(e: React.ChangeEvent<HTMLSelectElement>) {
    const m = Number(e.target.value);
    setBsMonth(m);
    emit(bsYear, m, bsDay);
  }

  function handleDay(e: React.ChangeEvent<HTMLSelectElement>) {
    const d = Number(e.target.value);
    setBsDay(d);
    emit(bsYear, bsMonth, d);
  }

  function handleToday() {
    const t = todayBs();
    setBsYear(t.year);
    setBsMonth(t.month);
    setBsDay(t.day);
    const ad = bsToAd(t.year, t.month, t.day);
    onChange(adToIso(ad));
  }

  const selectBase =
    'appearance-none bg-transparent text-sm text-gray-800 focus:outline-none py-1.5 px-2 disabled:bg-gray-50 disabled:text-gray-400';

  const selectGroup =
    'flex items-center gap-0 border border-gray-300 rounded-md overflow-hidden bg-white shadow-sm';

  const firstSelect = 'w-full sm:w-24 rounded-none';
  const middleSelect = 'w-full sm:w-32 rounded-none border-l border-gray-200';
  const lastSelect = 'w-full sm:w-16 rounded-none border-l border-gray-200';

  // Derive the current AD date for display
  let adDisplay = '';
  try {
    const ad = bsToAd(bsYear, bsMonth, bsDay);
    adDisplay = adToIso(ad);
  } catch {
    // ignore
  }

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label className="text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}

      {/* Selects */}
      <div className={selectGroup}>
        {/* Year */}
        <select
          className={`${selectBase} ${firstSelect}`}
          value={bsYear}
          onChange={handleYear}
          disabled={disabled}
          aria-label="BS Year"
        >
          {Array.from({ length: YEAR_RANGE_END - YEAR_RANGE_START + 1 }, (_, i) => {
            const y = YEAR_RANGE_START + i;
            return <option key={y} value={y}>{y}</option>;
          })}
        </select>

        {/* Month */}
        <select
          className={`${selectBase} ${middleSelect}`}
          value={bsMonth}
          onChange={handleMonth}
          disabled={disabled}
          aria-label="BS Month"
        >
          {BS_MONTH_NAMES_EN.slice(1).map((name, i) => (
            <option key={i + 1} value={i + 1}>{name}</option>
          ))}
        </select>

        {/* Day */}
        <select
          className={`${selectBase} ${lastSelect}`}
          value={bsDay}
          onChange={handleDay}
          disabled={disabled}
          aria-label="BS Day"
        >
          {Array.from({ length: maxDayInMonth }, (_, i) => (
            <option key={i + 1} value={i + 1}>{i + 1}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between gap-3">
        {!disabled && (
          <button
            type="button"
            onClick={handleToday}
            className="text-xs text-blue-600 hover:text-blue-800 underline"
          >
            Today
          </button>
        )}
        {adDisplay && (
          <p className="text-xs text-gray-400">AD: {adDisplay}</p>
        )}
      </div>

      {!value && !adDisplay && (
        <p className="text-xs text-gray-400">{placeholder}</p>
      )}

      {/* Error */}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
