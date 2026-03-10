import { create } from 'zustand'

export interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info' | 'warning'
}

interface UiState {
  isOffline: boolean
  toasts: Toast[]
  setOffline: (v: boolean) => void
  showToast: (message: string, type?: Toast['type']) => void
  dismissToast: (id: string) => void
}

export const useUiStore = create<UiState>((set, get) => ({
  isOffline: false,
  toasts: [],

  setOffline: (v) => set({ isOffline: v }),

  showToast: (message, type = 'info') => {
    const id = String(Date.now())
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
    // Auto-dismiss after 3.5 s
    setTimeout(() => get().dismissToast(id), 3500)
  },

  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
