import { StrictMode, Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import './index.css'
import App from './App.tsx'
import { ConfirmProvider } from './components/ConfirmDialog'

// ── Global error boundary ─────────────────────────────────────────────────────
// Catches unhandled React render errors so the whole app doesn't white-screen.
// react-error-boundary is not installed; use a native class component instead.
interface ErrorBoundaryState { hasError: boolean; error: Error | null }

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // Replace with a real error-reporting service (Sentry, etc.) in production.
    console.error('[ErrorBoundary] Unhandled render error:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 p-8 text-center">
          <h1 className="text-2xl font-semibold text-red-600">Something went wrong</h1>
          <p className="max-w-md text-gray-600">
            An unexpected error occurred. Please refresh the page or contact support if the problem persists.
          </p>
          <button
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
// ─────────────────────────────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ConfirmProvider>
          <App />
          <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
        </ConfirmProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
