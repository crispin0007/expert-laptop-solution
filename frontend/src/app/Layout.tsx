import { Outlet } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import NotificationBell from '../components/NotificationBell'
import { useAuthStore } from '../store/authStore'

export default function Layout() {
  const user = useAuthStore(s => s.user)

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top header bar */}
        <header className="bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-end gap-3 shrink-0">
          <NotificationBell />
          {user && (
            <span className="text-sm text-gray-500 font-medium">{user.full_name}</span>
          )}
        </header>
        <main className="flex-1 overflow-auto p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
