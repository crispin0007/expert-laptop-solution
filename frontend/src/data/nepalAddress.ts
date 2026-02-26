/**
 * Nepal hierarchical address helpers.
 * Source: json/english.json + json/nepali.json (copied into src/data/).
 * Structure: Province → District → Municipality → Ward numbers
 */

import enData from './nepal_en.json'
import npData from './nepal_np.json'

// ── Province slug mapping (JSON key → backend value) ─────────────────────────
const PROVINCE_KEY_TO_SLUG: Record<string, string> = {
  'Koshi Province':           'koshi',
  'Madesh Province':          'madhesh',
  'Bagmati Province':         'bagmati',
  'Gandaki Province':         'gandaki',
  'Lumbini Province':         'lumbini',
  'Karnali Province':         'karnali',
  'Sudurpaschim Province':    'sudurpashchim',
}

// Flip: slug → English province display label (without "Province")
const SLUG_TO_LABEL: Record<string, string> = {
  koshi:          'Koshi',
  madhesh:        'Madhesh',
  bagmati:        'Bagmati',
  gandaki:        'Gandaki',
  lumbini:        'Lumbini',
  karnali:        'Karnali',
  sudurpashchim:  'Sudurpashchim',
}

// Nepali province labels by slug index (same order as PROVINCE_KEY_TO_SLUG)
const NP_PROVINCE_KEYS = Object.keys(npData)
const EN_PROVINCE_KEYS = Object.keys(PROVINCE_KEY_TO_SLUG)
const SLUG_TO_LABEL_NP: Record<string, string> = {}
EN_PROVINCE_KEYS.forEach((enKey, i) => {
  const slug = PROVINCE_KEY_TO_SLUG[enKey]
  if (slug && NP_PROVINCE_KEYS[i]) SLUG_TO_LABEL_NP[slug] = NP_PROVINCE_KEYS[i]
})

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ProvinceOption {
  value: string   // backend slug, e.g. "bagmati"
  label: string   // English, e.g. "Bagmati"
  labelNp: string // Nepali, e.g. "बागमती प्रदेश"
}

// ── Provinces list ────────────────────────────────────────────────────────────
export const PROVINCES: ProvinceOption[] = EN_PROVINCE_KEYS.map(enKey => {
  const slug = PROVINCE_KEY_TO_SLUG[enKey]
  return {
    value:   slug,
    label:   SLUG_TO_LABEL[slug] ?? slug,
    labelNp: SLUG_TO_LABEL_NP[slug] ?? slug,
  }
})

// ── Internal data indexed by slug ─────────────────────────────────────────────
type JsonShape = Record<string, Record<string, Record<string, string[]>>>
const _en = enData as unknown as JsonShape
void (npData)

// Build slug → EN district data
const BY_SLUG_EN: Record<string, Record<string, Record<string, string[]>>> = {}
EN_PROVINCE_KEYS.forEach(enKey => {
  const slug = PROVINCE_KEY_TO_SLUG[enKey]
  if (!slug) return
  BY_SLUG_EN[slug] = {}
  const districtMap = _en[enKey] ?? {}
  for (const [district, munis] of Object.entries(districtMap)) {
    BY_SLUG_EN[slug][district] = {}
    for (const [muni, wards] of Object.entries(munis)) {
      BY_SLUG_EN[slug][district][muni.trim()] = wards
    }
  }
})

// ── Public API ────────────────────────────────────────────────────────────────

/** Get the English label for a province slug. */
export function provinceLabel(slug: string): string {
  return SLUG_TO_LABEL[slug] ?? slug
}

/** List of district names for a province slug. Returns [] if not found. */
export function getDistricts(province: string): string[] {
  return Object.keys(BY_SLUG_EN[province] ?? {})
}

/** List of municipality names for a province + district. Returns [] if not found. */
export function getMunicipalities(province: string, district: string): string[] {
  return Object.keys(BY_SLUG_EN[province]?.[district] ?? {})
}

/** List of ward numbers (as strings) for a province + district + municipality. */
export function getWards(province: string, district: string, municipality: string): string[] {
  return BY_SLUG_EN[province]?.[district]?.[municipality] ?? []
}
