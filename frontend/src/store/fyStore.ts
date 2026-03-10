import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { currentFiscalYear } from '../utils/nepaliDate'

interface FyState {
  /** BS start-year of the selected fiscal year, or null for "All Time" */
  fyYear: number | null
  setFyYear: (v: number | null) => void
}

export const useFyStore = create<FyState>()(
  persist(
    (set) => ({
      fyYear: currentFiscalYear().bsYear,
      setFyYear: (fyYear) => set({ fyYear }),
    }),
    { name: 'nexus-fy' },
  ),
)
