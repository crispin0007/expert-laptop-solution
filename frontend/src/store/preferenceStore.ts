/**
 * preferenceStore
 * ===============
 * Per-user, per-browser preferences stored in localStorage.
 * These are NOT synced to the server — they are purely local UI preferences.
 *
 * dateMode:
 *   'bs' — Bikram Sambat (Nepali) calendar as primary display (default)
 *   'ad' — Anno Domini (Gregorian / English) calendar as primary display
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type DateMode = 'bs' | 'ad'

interface PreferenceState {
  /** Which calendar system to show as the primary date display throughout the UI. */
  dateMode: DateMode
  setDateMode: (mode: DateMode) => void

  /** Compact date display — hides the secondary calendar line in list views. */
  compactDates: boolean
  setCompactDates: (v: boolean) => void
}

export const usePreferenceStore = create<PreferenceState>()(
  persist(
    (set) => ({
      dateMode: 'bs',
      setDateMode: (mode) => set({ dateMode: mode }),

      compactDates: false,
      setCompactDates: (v) => set({ compactDates: v }),
    }),
    {
      name: 'nexus-preferences',
    }
  )
)
