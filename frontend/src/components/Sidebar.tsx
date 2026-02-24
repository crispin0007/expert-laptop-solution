import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Ticket,
  FolderKanban,
  Users,
  UserCircle,
  Package,
  Receipt,
  Coins,
  Building2,
  LogOut,
  ShieldCheck,
  Settings,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useTenantStore } from '../store/tenantStore'

const workspaceNav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/tickets', label: 'Tickets', icon: Ticket },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/accounting', label: 'Accounting', icon: Receipt },
  { to: '/coins', label: 'Coins', icon: Coins },
  { to: '/inventory', label: 'Inventory', icon: Package },
  { to: '/settings', label: 'Settings', icon: Settings },
]

const peopleNav = [
  { to: '/staff', label: 'Staff', icon: UserCircle },
  { to: '/departments', label: 'Departments', icon: Building2 },
  { to: '/customers', label: 'Customers', icon: Users },
]

function NavItem({ to, label, icon: Icon, end }: { to: string; label: string; icon: React.ElementType; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'bg-indigo-600 text-white'
            : 'text-gray-400 hover:bg-gray-800 hover:text-white'
        }`
      }
    >
      <Icon size={18} />
      {label}
    </NavLink>
  )
}

export default function Sidebar() {
  const logout = useAuthStore((s) => s.logout)
  const tenantName = useTenantStore((s) => s.tenantName)
  const clearTenant = useTenantStore((s) => s.clearTenant)
  const user = useAuthStore((s) => s.user)
  const isSuperAdmin = user?.is_superadmin ?? false

  function handleLogout() {
    logout()
    clearTenant()
    window.location.href = '/login'
  }

  return (
    <aside className="flex flex-col w-60 min-h-screen bg-gray-900 text-white shrink-0">
      {/* Brand */}
      <div className="px-6 py-5 border-b border-gray-700">
        <p className="text-indigo-400 font-bold text-lg tracking-tight">NEXUS BMS</p>
        {tenantName && (
          <p className="text-gray-400 text-xs mt-0.5 truncate">{tenantName}</p>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {/* Workspace */}
        {workspaceNav.map(item => <NavItem key={item.to} {...item} />)}

        {/* People */}
        <div className="pt-4 pb-1 px-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">People</p>
        </div>
        {peopleNav.map(item => <NavItem key={item.to} {...item} />)}

        {/* Super Admin section */}
        {isSuperAdmin && (
          <>
            <div className="pt-4 pb-1 px-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Super Admin</p>
            </div>
            <NavLink
              to="/admin/tenants"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <ShieldCheck size={18} />
              Tenants
            </NavLink>
          </>
        )}
      </nav>

      {/* User + logout */}
      <div className="px-4 py-4 border-t border-gray-700">
        <p className="text-xs text-gray-400 truncate mb-2">
          {user?.full_name || user?.email || 'User'}
          {isSuperAdmin && (
            <span className="ml-1.5 text-indigo-400 text-xs">(Super Admin)</span>
          )}
        </p>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-red-400 transition"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </aside>
  )
}

