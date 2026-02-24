import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

/**
 * Renders children only if the logged-in user has is_superadmin=true.
 * Otherwise redirects to the dashboard.
 */
export default function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  if (!user?.is_superadmin) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}
