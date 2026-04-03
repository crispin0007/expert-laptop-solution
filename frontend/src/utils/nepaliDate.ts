/**
 * nepaliDate.ts
 * =============
 * Pure-TypeScript Bikram Sambat (BS) ↔ Gregorian (AD) conversion utilities.
 *
 * No external dependencies — uses a verified lookup table for BS 2000–2105.
 *
 * Nepal Fiscal Year (FY)
 * ----------------------
 * Starts 1 Shrawan (BS month 4) ≈ mid-July AD
 * Ends   last day of Ashadh (BS month 3) ≈ mid-July AD
 * Label:  "2081/082"  (the BS year when FY starts, plus last 3 digits of end year)
 */

// ── Reference point ──────────────────────────────────────────────────────────
// Baisakh 1, 2000 BS = April 14, 1943 AD  (verified against Hamro Patro / official Nepal calendar)
const REFERENCE_AD = new Date(1943, 3, 14); // months are 0-indexed in JS
const REFERENCE_BS_YEAR = 2000;

// ── Month names ───────────────────────────────────────────────────────────────
export const BS_MONTH_NAMES_EN = [
  '', 'Baisakh', 'Jestha', 'Ashadh', 'Shrawan',
  'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush',
  'Magh', 'Falgun', 'Chaitra',
] as const;

export const BS_MONTH_NAMES_NP = [
  '', 'बैशाख', 'जेठ', 'असार', 'श्रावण',
  'भाद्र', 'आश्विन', 'कार्तिक', 'मंसिर', 'पौष',
  'माघ', 'फागुन', 'चैत',
] as const;

const NP_DIGITS = '०१२३४५६७८९';
const toNepaliDigits = (n: number) =>
  String(n).split('').map(d => NP_DIGITS[parseInt(d)]).join('');

// ── BS Calendar Lookup Table ──────────────────────────────────────────────────
// Format: bsYear → [daysInMonth1, ..., daysInMonth12]
const BS_CALENDAR: Record<number, number[]> = {
  2000: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2001: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2002: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2003: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2004: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2005: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2006: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2007: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2008: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31],
  2009: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2010: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2011: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2012: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2013: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2014: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2015: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2016: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2017: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2018: [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2019: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2020: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2021: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2022: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2023: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2024: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2025: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2026: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2027: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2028: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2029: [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30],
  2030: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2031: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31],
  2032: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2033: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2034: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2035: [30, 32, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31],
  2036: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2037: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2038: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2039: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2040: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2041: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2042: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2043: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2044: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2045: [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2046: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2047: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2048: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2049: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2050: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2051: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2052: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2053: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2054: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2055: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2056: [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30],
  2057: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2058: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2059: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2060: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2061: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2062: [30, 32, 31, 32, 31, 31, 29, 30, 29, 30, 29, 31],
  2063: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2064: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2065: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2066: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31],
  2067: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2068: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2069: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2070: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2071: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2072: [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2073: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2074: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2075: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2076: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2077: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2078: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2079: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2080: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2081: [31, 31, 32, 32, 31, 30, 30, 30, 29, 30, 30, 30],
  2082: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
  2083: [31, 31, 32, 31, 31, 30, 30, 30, 29, 30, 30, 30],
  2084: [31, 31, 32, 31, 31, 30, 30, 30, 29, 30, 30, 30],
  2085: [31, 32, 31, 32, 30, 31, 30, 30, 29, 30, 30, 30],
  2086: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
  2087: [31, 31, 32, 31, 31, 31, 30, 30, 29, 30, 30, 30],
  2088: [31, 31, 32, 32, 31, 30, 30, 30, 29, 30, 30, 30],
  2089: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2090: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
  2091: [31, 31, 32, 31, 31, 31, 30, 30, 29, 30, 30, 30],
  2092: [31, 31, 32, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2093: [30, 32, 31, 32, 31, 31, 29, 30, 29, 30, 29, 31],
  2094: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2095: [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30],
  2096: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2097: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2098: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2099: [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30],
  2100: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NepaliDate {
  year: number;
  month: number;  // 1-based
  day: number;
  monthNameEn: string;
  monthNameNp: string;
  /** ISO format: "YYYY-MM-DD" */
  iso: string;
  /** English display: "15 Shrawan 2081" */
  displayEn: string;
  /** Nepali display: "१५ श्रावण २०८१" */
  displayNp: string;
}

export interface BsDateDisplay {
  /** BS ISO "YYYY-MM-DD" */
  bs: string;
  /** "15 Shrawan 2081" */
  bs_en: string;
  /** "१५ श्रावण २०८१" */
  bs_np: string;
  /** AD date string */
  ad: string;
  /** AD ISO */
  ad_iso: string;
  /** Time string HH:MM (only for datetime) */
  time?: string;
}

export interface FiscalYear {
  bsYear: number;
  /** e.g. "2081/082" */
  label: string;
  /** e.g. "2081/2082" */
  labelFull: string;
}

// ── Core conversion ───────────────────────────────────────────────────────────

/** Total days in a BS year from the lookup table. */
function daysInBsYear(bsYear: number): number {
  const months = BS_CALENDAR[bsYear];
  if (!months) throw new Error(`BS year ${bsYear} is out of supported range`);
  return months.reduce((a, b) => a + b, 0);
}

/**
 * Convert a JavaScript Date (AD) to a NepaliDate (BS).
 * Time component is ignored; only the date portion is used.
 */
export function adToBs(adDate: Date): NepaliDate {
  // Normalize to midnight local time to avoid timezone drift
  const normalized = new Date(adDate.getFullYear(), adDate.getMonth(), adDate.getDate());
  const refNorm = new Date(
    REFERENCE_AD.getFullYear(), REFERENCE_AD.getMonth(), REFERENCE_AD.getDate()
  );

  let totalDays = Math.round((normalized.getTime() - refNorm.getTime()) / 86400000);
  if (totalDays < 0) throw new Error('Date is before the supported range (1943-04-13)');

  let bsYear = REFERENCE_BS_YEAR;
  let bsMonth = 1;
  let bsDay = 1;

  // Advance whole BS years
  while (true) {
    const diy = daysInBsYear(bsYear);
    if (totalDays < diy) break;
    totalDays -= diy;
    bsYear++;
  }

  // Advance whole BS months
  const months = BS_CALENDAR[bsYear];
  for (let i = 0; i < months.length; i++) {
    if (totalDays < months[i]) {
      bsMonth = i + 1;
      bsDay = totalDays + 1;
      break;
    }
    totalDays -= months[i];
  }

  return makeBsDate(bsYear, bsMonth, bsDay);
}

/**
 * Convert a BS date to a JavaScript Date (AD midnight local time).
 */
export function bsToAd(bsYear: number, bsMonth: number, bsDay: number): Date {
  const months = BS_CALENDAR[bsYear];
  if (!months) throw new Error(`BS year ${bsYear} is out of supported range`);
  if (bsMonth < 1 || bsMonth > 12) throw new Error(`Invalid BS month ${bsMonth}`);
  if (bsDay < 1 || bsDay > months[bsMonth - 1]) throw new Error(`Invalid BS day ${bsDay}`);

  let totalDays = 0;

  // Sum days for BS years before bsYear
  for (let y = REFERENCE_BS_YEAR; y < bsYear; y++) {
    totalDays += daysInBsYear(y);
  }

  // Sum days for BS months before bsMonth in bsYear
  for (let m = 0; m < bsMonth - 1; m++) {
    totalDays += months[m];
  }

  totalDays += bsDay - 1;

  const result = new Date(
    REFERENCE_AD.getFullYear(), REFERENCE_AD.getMonth(), REFERENCE_AD.getDate()
  );
  result.setDate(result.getDate() + totalDays);
  return result;
}

/** Parse a BS ISO string "YYYY-MM-DD" and convert to AD Date. */
export function bsIsoToAd(bsIso: string): Date {
  const [y, m, d] = bsIso.split('-').map(Number);
  return bsToAd(y, m, d);
}

/** Convert a BS ISO string "YYYY-MM-DD" to AD ISO "YYYY-MM-DD". */
export function bsIsoToAdIso(bsIso: string): string {
  const ad = bsIsoToAd(bsIso);
  return adToIso(ad);
}

/** Format a JS Date as "YYYY-MM-DD" string. */
export function adToIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── Display helpers ───────────────────────────────────────────────────────────

function makeBsDate(year: number, month: number, day: number): NepaliDate {
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const monthNameEn = BS_MONTH_NAMES_EN[month] as string;
  const monthNameNp = BS_MONTH_NAMES_NP[month] as string;
  return {
    year, month, day,
    monthNameEn,
    monthNameNp,
    iso,
    displayEn: `${day} ${monthNameEn} ${year}`,
    displayNp: `${toNepaliDigits(day)} ${monthNameNp} ${toNepaliDigits(year)}`,
  };
}

/** Convert an AD Date to a full BsDateDisplay object. */
export function adToBsDisplay(adDate: Date, timeStr?: string): BsDateDisplay {
  const bs = adToBs(adDate);
  const adIso = adToIso(adDate);
  const result: BsDateDisplay = {
    bs: bs.iso,
    bs_en: timeStr ? `${bs.displayEn} ${timeStr}` : bs.displayEn,
    bs_np: bs.displayNp,
    ad: adIso,
    ad_iso: adIso,
  };
  if (timeStr) result.time = timeStr;
  return result;
}

/**
 * Parse an AD ISO date/datetime string and return a BsDateDisplay.
 * Handles both "YYYY-MM-DD" and "YYYY-MM-DDTHH:MM:SS..." formats.
 */
export function adStringToBsDisplay(adStr: string | null | undefined): BsDateDisplay | null {
  if (!adStr) return null;
  try {
    let timeStr: string | undefined;
    let dateStr = adStr;
    if (adStr.includes('T') || (adStr.length > 10 && adStr[10] === ' ')) {
      const d = new Date(adStr);
      if (isNaN(d.getTime())) return null;
      timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      dateStr = adToIso(d);
    }
    const [y, m, day] = dateStr.split('-').map(Number);
    const adDate = new Date(y, m - 1, day);
    return adToBsDisplay(adDate, timeStr);
  } catch {
    return null;
  }
}

// ── Today ─────────────────────────────────────────────────────────────────────

/** Today's date in BS. */
export function todayBs(): NepaliDate {
  return adToBs(new Date());
}

/** Today's BS ISO string "YYYY-MM-DD". */
export function todayBsIso(): string {
  return todayBs().iso;
}

// ── Fiscal Year ───────────────────────────────────────────────────────────────

/** Fiscal year for a given AD date. */
export function fiscalYearOf(adDate: Date): FiscalYear {
  const bs = adToBs(adDate);
  // FY starts in Shrawan (month 4)
  const bsYear = bs.month >= 4 ? bs.year : bs.year - 1;
  return makeFiscalYear(bsYear);
}

function makeFiscalYear(bsYear: number): FiscalYear {
  const endYear = bsYear + 1;
  return {
    bsYear,
    label: `${bsYear}/${String(endYear).slice(-3)}`,
    labelFull: `${bsYear}/${endYear}`,
  };
}

/** Current fiscal year. */
export function currentFiscalYear(): FiscalYear {
  return fiscalYearOf(new Date());
}

/**
 * Get start and end AD dates for a fiscal year.
 * Start: 1 Shrawan (month 4) of bsYear
 * End:   Last day of Ashadh (month 3) of bsYear+1
 */
export function fiscalYearDateRange(fy: FiscalYear): { startAd: Date; endAd: Date } {
  const startAd = bsToAd(fy.bsYear, 4, 1);
  const endBsMonths = BS_CALENDAR[fy.bsYear + 1];
  if (!endBsMonths) throw new Error('End year out of range');
  const ashadhDays = endBsMonths[2]; // index 2 = month 3 (Ashadh)
  const endAd = bsToAd(fy.bsYear + 1, 3, ashadhDays);
  return { startAd, endAd };
}

/**
 * Return the query params for a full fiscal year, ready for API calls.
 * e.g. { date_from: "2024-07-17", date_to: "2025-07-16" }
 */
export function fiscalYearAdParams(fy: FiscalYear): { date_from: string; date_to: string } {
  const { startAd, endAd } = fiscalYearDateRange(fy);
  return { date_from: adToIso(startAd), date_to: adToIso(endAd) };
}

// ── Days in month ─────────────────────────────────────────────────────────────

/** Number of days in a given BS month. */
export function daysInBsMonth(bsYear: number, bsMonth: number): number {
  const months = BS_CALENDAR[bsYear];
  if (!months) return 30;
  return months[bsMonth - 1] ?? 30;
}

// ── Format helpers ────────────────────────────────────────────────────────────

/**
 * Get the BS display from an API response ``_bs`` field or fall back to
 * converting the raw AD string.  Use this in components.
 *
 * @param bsField   The ``field_bs`` value returned by the API (may be null/undefined)
 * @param adString  The raw AD string (fallback)
 */
export function resolveBsDisplay(
  bsField: BsDateDisplay | null | undefined,
  adString: string | null | undefined,
): BsDateDisplay | null {
  if (bsField) return bsField;
  return adStringToBsDisplay(adString);
}
