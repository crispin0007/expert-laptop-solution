import { useState, useRef, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import NotificationBell from '../components/NotificationBell'
import FiscalYearSwitcher from '../components/FiscalYearSwitcher'
import { useAuthStore } from '../store/authStore'
import { Menu } from 'lucide-react'

export default function Layout() {
  const user = useAuthStore(s => s.user)
  const [collapsed, setCollapsed]     = useState(false)
  const [mobileOpen, setMobileOpen]   = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  const location = useLocation()

  // Reset scroll to top on every route change
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [location.pathname])

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCollapse={() => setCollapsed(c => !c)}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className="flex flex-col flex-1 min-w-0">
        {/* Top header bar */}
        <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 shrink-0">
          {/* Hamburger — mobile only */}
          <button
            onClick={() => setMobileOpen(o => !o)}
            className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:bg-gray-100 transition"
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          <FiscalYearSwitcher />
          <NotificationBell />
          {user && (
            <span className="text-sm text-gray-500 font-medium hidden sm:block">
              {user.full_name}
            </span>
          )}
        </header>

        <main ref={mainRef} className="flex-1 overflow-auto p-6 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
