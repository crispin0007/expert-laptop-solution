import { useState, useEffect } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
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
  ChevronDown,
  X,
  AlertTriangle,
  Layers,
  Scale,
  Truck,
  ShoppingCart,
  RotateCcw,
  BarChart2,
  ArrowLeftRight,
  CheckSquare,
  FileText,
  CreditCard,
  BookOpen,
  FilePlus,
  FileCheck,
  Banknote,
  RefreshCcw,
  Calendar,
  BookMarked,
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

// ── Sub-nav item (used inside NavSection) ─────────────────────────────────────

function SubNavItem({ to, label, icon }: { to: string; label: string; icon?: React.ReactNode }) {
  const location = useLocation()
  // Parse `to` into pathname + search so we can do exact matching on both
  const qIdx   = to.indexOf('?')
  const toPath = qIdx === -1 ? to : to.slice(0, qIdx)
  const toQs   = qIdx === -1 ? '' : to.slice(qIdx + 1)
  const toP    = new URLSearchParams(toQs)
  const curP   = new URLSearchParams(location.search)

  const isActive = location.pathname === toPath && (
    toQs === ''
      ? !location.search                                              // no query → match only bare path
      : Array.from(toP.entries()).every(([k, v]) => curP.get(k) === v) // all query params match
  )

  return (
    <Link
      to={to}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
        isActive
          ? 'text-indigo-400 bg-indigo-950/60'
          : 'text-gray-500 hover:text-gray-200 hover:bg-gray-800/70'
      }`}
    >
      {icon && <span className="shrink-0 opacity-75">{icon}</span>}
      <span className="truncate">{label}</span>
    </Link>
  )
}

// ── Collapsible sub-section (2nd level, lives inside NavSection) ───────────────

function NavSubSection({
  label,
  icon,
  matchTabs,
  children,
}: {
  label: string
  icon?: React.ReactNode
  /** Query-string tab values that count as "active" for this group */
  matchTabs?: string[]
  children: React.ReactNode
}) {
  const location = useLocation()
  const curP = new URLSearchParams(location.search)
  const currentTab = curP.get('tab') ?? ''
  const isOnGroup = matchTabs ? matchTabs.includes(currentTab) : false
  const [open, setOpen] = useState(isOnGroup)

  useEffect(() => { if (isOnGroup) setOpen(true) }, [isOnGroup])

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center justify-between w-full px-2 py-1.5 rounded-md text-xs font-semibold transition-colors ${
          isOnGroup
            ? 'text-indigo-300 bg-indigo-950/40'
            : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
        }`}
      >
        <span className="flex items-center gap-1.5">
          {icon && <span className="opacity-70">{icon}</span>}
          <span className="uppercase tracking-wide">{label}</span>
        </span>
        <ChevronDown
          size={11}
          className={`shrink-0 transition-transform duration-150 ${open ? '' : '-rotate-90'}`}
        />
      </button>

      {open && (
        <div className="mt-0.5 ml-2 pl-2 border-l border-gray-700/50 space-y-0.5 pb-0.5">
          {children}
        </div>
      )}
    </div>
  )
}

// ── Collapsible nav section ───────────────────────────────────────────────────

function NavSection({
  label,
  icon: Icon,
  basePath,
  collapsed,
  children,
}: {
  label: string
  icon: React.ElementType
  basePath: string
  collapsed?: boolean
  children: React.ReactNode
}) {
  const location  = useLocation()
  const isOnBase  = location.pathname.startsWith(basePath)
  const [open, setOpen] = useState(isOnBase)

  // Auto-expand when navigating into this section
  useEffect(() => { if (isOnBase) setOpen(true) }, [isOnBase])

  // Icon-only mode: just a NavLink to the top-level route
  if (collapsed) {
    return (
      <NavLink
        to={basePath}
        title={label}
        className={({ isActive }) =>
          `flex items-center justify-center px-3 py-2.5 rounded-lg transition-colors ${
            isActive
              ? 'bg-indigo-600 text-white'
              : 'text-gray-400 hover:bg-gray-800 hover:text-white'
          }`
        }
      >
        <Icon size={18} className="shrink-0" />
      </NavLink>
    )
  }

  return (
    <div>
      {/* Section header toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          isOnBase
            ? 'text-indigo-300 bg-indigo-900/30'
            : 'text-gray-400 hover:bg-gray-800 hover:text-white'
        }`}
      >
        <span className="flex items-center gap-3">
          <Icon size={18} className="shrink-0" />
          <span className="truncate">{label}</span>
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
        />
      </button>

      {/* Sub-items */}
      {open && (
        <div className="mt-0.5 ml-3 pl-3 border-l border-gray-700/70 space-y-0.5 pb-1">
          {children}
        </div>
      )}
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
              <p className="text-gray-500 text-xs mt-0.5">powered by NEXUS BMS</p>
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
              <NavSection label="Tickets" icon={Ticket} basePath="/tickets" collapsed={collapsed}>
                <SubNavItem to="/tickets" label="All Tickets" icon={<Ticket size={13} />} />
                <SubNavItem to="/tickets?assigned=me" label="My Tickets" icon={<UserCircle size={13} />} />
                {perms.can('can_manage_ticket_types') && (
                  <SubNavItem to="/tickets/settings" label="Settings" icon={<Settings size={13} />} />
                )}
              </NavSection>
            )}
            {modules.has('projects') && perms.can('can_view_projects') && (
              <NavSection label="Projects" icon={FolderKanban} basePath="/projects" collapsed={collapsed}>
                <SubNavItem to="/projects" label="All Projects" icon={<FolderKanban size={13} />} />
                <SubNavItem to="/projects?assigned=me" label="My Projects" icon={<CheckSquare size={13} />} />
              </NavSection>
            )}
            {modules.has('accounting') && perms.can('can_view_accounting') && (
              <NavSection label="Accounting" icon={Receipt} basePath="/accounting" collapsed={collapsed}>
                <SubNavItem to="/accounting" label="Dashboard" icon={<LayoutDashboard size={13} />} />

                <NavSubSection label="Sales" icon={<Receipt size={11} />} matchTabs={['quotations','invoices','credit-notes']}>
                  <SubNavItem to="/accounting?tab=quotations"   label="Quotations"    icon={<FilePlus  size={13} />} />
                  <SubNavItem to="/accounting?tab=invoices"     label="Invoices"      icon={<Receipt   size={13} />} />
                  <SubNavItem to="/accounting?tab=credit-notes" label="Credit Notes"  icon={<RotateCcw size={13} />} />
                </NavSubSection>

                <NavSubSection label="Purchases" icon={<ShoppingCart size={11} />} matchTabs={['bills','debit-notes','tds']}>
                  <SubNavItem to="/accounting?tab=bills"        label="Bills"         icon={<FileText  size={13} />} />
                  <SubNavItem to="/accounting?tab=debit-notes"  label="Debit Notes"   icon={<FileCheck size={13} />} />
                  <SubNavItem to="/accounting?tab=tds"          label="TDS"           icon={<Banknote  size={13} />} />
                </NavSubSection>

                <NavSubSection label="Banking" icon={<Building2 size={11} />} matchTabs={['payments','banks','bank-reconciliation']}>
                  <SubNavItem to="/accounting?tab=payments"            label="Payments"            icon={<CreditCard  size={13} />} />
                  <SubNavItem to="/accounting?tab=banks"               label="Bank Accounts"       icon={<Building2   size={13} />} />
                  <SubNavItem to="/accounting?tab=bank-reconciliation" label="Reconciliation"      icon={<CheckSquare size={13} />} />
                </NavSubSection>

                <NavSubSection label="Ledger" icon={<BookOpen size={11} />} matchTabs={['journals','recurring-journals','accounts']}>
                  <SubNavItem to="/accounting?tab=journals"           label="Journal Entries"    icon={<BookOpen   size={13} />} />
                  <SubNavItem to="/accounting?tab=recurring-journals" label="Recurring"          icon={<RefreshCcw size={13} />} />
                  <SubNavItem to="/accounting?tab=accounts"           label="Chart of Accounts"  icon={<Layers     size={13} />} />
                </NavSubSection>

                <NavSubSection label="Payroll" icon={<Coins size={11} />} matchTabs={['payslips']}>
                  <SubNavItem to="/accounting?tab=payslips" label="Payslips & Coins" icon={<Coins size={13} />} />
                </NavSubSection>

                <NavSubSection label="Reports" icon={<BarChart2 size={11} />} matchTabs={['reports','ledger','day-book']}>
                  <SubNavItem to="/accounting?tab=reports"   label="Financial Reports" icon={<BarChart2   size={13} />} />
                  <SubNavItem to="/accounting?tab=ledger"    label="Ledger"            icon={<BookMarked  size={13} />} />
                  <SubNavItem to="/accounting?tab=day-book"  label="Day Book"          icon={<Calendar    size={13} />} />
                </NavSubSection>
              </NavSection>
            )}
            {modules.has('inventory') && perms.can('can_view_inventory') && (
              <NavSection label="Inventory" icon={Package} basePath="/inventory" collapsed={collapsed}>
                <NavSubSection label="Products" icon={<Package size={11} />} matchTabs={['products','categories','uom','variants']}>
                  <SubNavItem to="/inventory?tab=products"   label="Products"          icon={<Package size={13} />} />
                  <SubNavItem to="/inventory?tab=categories" label="Categories"        icon={<Layers  size={13} />} />
                  <SubNavItem to="/inventory?tab=uom"        label="Units of Measure"  icon={<Scale   size={13} />} />
                  <SubNavItem to="/inventory?tab=variants"   label="Variants"          icon={<Layers  size={13} />} />
                </NavSubSection>

                <NavSubSection label="Stock" icon={<ArrowLeftRight size={11} />} matchTabs={['movements','low-stock','stock-counts']}>
                  <SubNavItem to="/inventory?tab=movements"    label="Movements"      icon={<ArrowLeftRight size={13} />} />
                  <SubNavItem to="/inventory?tab=low-stock"    label="Low Stock"      icon={<AlertTriangle  size={13} />} />
                  <SubNavItem to="/inventory?tab=stock-counts" label="Stock Counts"   icon={<ClipboardList  size={13} />} />
                </NavSubSection>

                <NavSubSection label="Suppliers" icon={<Truck size={11} />} matchTabs={['suppliers','supplier-catalog','purchase-orders','returns']}>
                  <SubNavItem to="/inventory?tab=suppliers"        label="Suppliers"         icon={<Truck        size={13} />} />
                  <SubNavItem to="/inventory?tab=supplier-catalog" label="Supplier Catalog"  icon={<Truck        size={13} />} />
                  <SubNavItem to="/inventory?tab=purchase-orders"  label="Purchase Orders"   icon={<ShoppingCart size={13} />} />
                  <SubNavItem to="/inventory?tab=returns"          label="Returns"           icon={<RotateCcw    size={13} />} />
                </NavSubSection>

                <NavSubSection label="Reports" icon={<BarChart2 size={11} />} matchTabs={['reports']}>
                  <SubNavItem to="/inventory?tab=reports" label="Reports" icon={<BarChart2 size={13} />} />
                </NavSubSection>
              </NavSection>
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


