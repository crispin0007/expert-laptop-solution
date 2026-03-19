/**
 * DashboardPage — role-based router.
 * Renders AdminDashboard for owner/admin, ManagerDashboard for manager,
 * and StaffDashboard for all other roles (staff / viewer / custom).
 */
import { useAuthStore, isAdmin } from '../../store/authStore'
import AdminDashboard from './AdminDashboard'
import ManagerDashboard from './ManagerDashboard'
import StaffDashboard from './StaffDashboard'

export default function DashboardPage() {
  const user = useAuthStore(s => s.user)
  const role = user?.membership?.role

  if (isAdmin(user)) return <AdminDashboard />
  if (role === 'manager') return <ManagerDashboard />
  return <StaffDashboard />
}
