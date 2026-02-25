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
  Shield,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useTenantStore } from '../store/tenantStore'
import { usePermissions } from '../hooks/usePermissions'
import { useModules } from '../hooks/useModules'

function NavItem({
  to,
  label,
  icon: Icon,
  end,
  collapsed,
}: {
  to: string
  label: string
  icon: React.ElementType
  end?: boolean
  collapsed?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'bg-indigo-600 text-white'
            : 'text-gray-400 hover:bg-gray-800 hover:text-white'
        } ${collapsed ? 'justify-center' : ''}`
      }
    >
      <Icon size={18} className="shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  )
}

function SectionLabel({ label, collapsed }: { label: string; collapsed?: boolean }) {
  if (collapsed) return <div className="mx-2 my-2 border-t border-gray-700" />
  return (
    <div className="pt-4 pb-1 px-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
    </div>
  )
}

// ── Inner sidebar content (shared between desktop and mobile) ─────────────────

function SidebarContent({
  collapsed,
  isMobile,
  onCollapse,
  onMobileClose,
}: {
  collapsed: boolean
  isMobile?: boolean
  onCollapse: () => void
  onMobileClose: () => void
}) {
  const logout      = useAuthStore((s) => s.logout)
  const tenantName  = useTenantStore((s) => s.tenantName)
  const clearTenant = useTenantStore((s) => s.clearTenant)
  const user        = useAuthStore((s) => s.user)
  const subdomain   = useTenantStore((s) => s.subdomain)
  const perms       = usePermissions()
  const modules     = useModules()

  const isRootDomain = !subdomain
  const isSuperAdmin = (user?.is_superadmin ?? false) && isRootDomain
  const roleBadge    = user?.membership?.role_display ?? null

  function handleLogout() {
    logout()
    clearTenant()
    window.location.href = '/login'
  }

  return (
    <aside className="flex flex-col h-full bg-gray-900 text-white w-full overflow-hidden">

      {/* Brand + collapse toggle */}
      <div
        className={`flex items-center border-b border-gray-700 shrink-0 min-h-[60px] ${
          collapsed ? 'px-3 justify-center' : 'px-4 gap-2'
        }`}
      >
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p className="text-indigo-400 font-bold text-lg tracking-tight truncate">
              {tenantName || 'NEXUS BMS'}
            </p>
            {tenantName && (
              <p className="text-gray-500 text-xs mt-0.5">powered by TechYatra</p>
            )}
          </div>
        )}

        {!isMobile && (
          <button
            onClick={onCollapse}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition shrink-0"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        )}

        {isMobile && (
          <button
            onClick={onMobileClose}
            className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition shrink-0"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">

        {/* ── Super Admin workspace ─────────────────────────────── */}
        {isSuperAdmin && (
          <>
            <NavItem to="/" label="Dashboard" icon={LayoutDashboard} end collapsed={collapsed} />
            <SectionLabel label="Super Admin" collapsed={collapsed} />
            <NavItem to="/admin/tenants" label="Tenants"  icon={ShieldCheck}   collapsed={collapsed} />
            <NavItem to="/admin/plans"   label="Plans"    icon={ClipboardList} collapsed={collapsed} />
          </>
        )}

        {/* ── Tenant workspace ──────────────────────────────────── */}
        {!isSuperAdmin && (
          <>
            <NavItem to="/" label="Dashboard" icon={LayoutDashboard} end collapsed={collapsed} />

            {/* Module-gated: hidden when module not in tenant's active plan */}
            {modules.has('tickets') && perms.can('can_view_tickets') && (
              <NavItem to="/tickets"    label="Tickets"    icon={Ticket}       collapsed={collapsed} />
            )}
            {modules.has('projects') && perms.can('can_view_projects') && (
              <NavItem to="/projects"   label="Projects"   icon={FolderKanban} collapsed={collapsed} />
            )}
            {modules.has('accounting') && perms.can('can_view_accounting') && (
              <NavItem to="/accounting" label="Accounting" icon={Receipt}      collapsed={collapsed} />
            )}
            {modules.has('accounting') && perms.can('can_view_coins') && (
              <NavItem to="/coins"      label="Coins"      icon={Coins}        collapsed={collapsed} />
            )}
            {modules.has('inventory') && perms.can('can_view_inventory') && (
              <NavItem to="/inventory"  label="Inventory"  icon={Package}      collapsed={collapsed} />
            )}
            {perms.can('can_manage_settings') && (
              <NavItem to="/settings"   label="Settings"   icon={Settings}     collapsed={collapsed} />
            )}

            <SectionLabel label="People" collapsed={collapsed} />

            {perms.can('can_view_staff') && (
              <NavItem to="/staff"       label="Staff"       icon={UserCircle} collapsed={collapsed} />
            )}
            {perms.can('can_manage_roles') && (
              <NavItem to="/roles"       label="Roles"       icon={Shield}     collapsed={collapsed} />
            )}
            {modules.has('departments') && perms.can('can_view_departments') && (
              <NavItem to="/departments" label="Departments" icon={Building2}  collapsed={collapsed} />
            )}
            {modules.has('customers') && perms.can('can_view_customers') && (
              <NavItem to="/customers"   label="Customers"   icon={Users}      collapsed={collapsed} />
            )}
          </>
        )}
      </nav>

      {/* User footer */}
      <div
        className={`border-t border-gray-700 shrink-0 ${
          collapsed ? 'px-2 py-3 flex flex-col items-center gap-2' : 'px-4 py-4'
        }`}
      >
        {!collapsed && (
          <div className="mb-2">
            <p className="text-xs text-gray-400 truncate">
              {user?.full_name || user?.email || 'User'}
            </p>
            {roleBadge && (
              <span className="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-indigo-900 text-indigo-300">
                {roleBadge}
              </span>
            )}
            {isSuperAdmin && (
              <span className="inline-block mt-0.5 ml-1 text-indigo-400 text-xs">(Super Admin)</span>
            )}
          </div>
        )}
        <button
          onClick={handleLogout}
          title={collapsed ? 'Sign out' : undefined}
          className={`flex items-center gap-2 text-sm text-gray-400 hover:text-red-400 transition ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <LogOut size={16} />
          {!collapsed && 'Sign out'}
        </button>
      </div>
    </aside>
  )
}

// ── Public component ──────────────────────────────────────────────────────────

export interface SidebarProps {
  collapsed: boolean
  mobileOpen: boolean
  onCollapse: () => void
  onMobileClose: () => void
}

export default function Sidebar({
  collapsed,
  mobileOpen,
  onCollapse,
  onMobileClose,
}: SidebarProps) {
  return (
    <>
      {/* ── Desktop: sticky, animates width between 64px (icon-only) and 240px ── */}
      <div
        className="hidden md:flex h-screen sticky top-0 shrink-0 transition-[width] duration-300 ease-in-out overflow-hidden"
        style={{ width: collapsed ? 64 : 240 }}
      >
        <SidebarContent
          collapsed={collapsed}
          onCollapse={onCollapse}
          onMobileClose={onMobileClose}
        />
      </div>

      {/* ── Mobile: full-screen overlay drawer, always expanded ── */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onMobileClose}
          />
          <div className="relative z-10 w-64 h-full shadow-2xl">
            <SidebarContent
              collapsed={false}
              isMobile
              onCollapse={onCollapse}
              onMobileClose={onMobileClose}
            />
          </div>
        </div>
      )}
    </>
  )
}


