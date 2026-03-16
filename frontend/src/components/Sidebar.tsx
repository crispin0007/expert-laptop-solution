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
  FileQuestion,
  Percent,
  ArrowRightLeft,
  Repeat2,
  BookMarked,
  CalendarDays,
  Globe,
  Layout,
  Link2,
  Sparkles,
  ExternalLink,
  Pencil,
  FileImage,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useTenantStore } from '../store/tenantStore'
import { usePermissions } from '../hooks/usePermissions'
import { useModules } from '../hooks/useModules'
// ── Simple module nav registry ─────────────────────────────────────────────────
// Add a new entry here and it automatically appears in the sidebar whenever the
// module is active for the tenant — no other file needs to change.
// For complex modules with nested sub-navigation (tickets, projects, accounting,
// inventory), keep them as explicit JSX below.
type SimpleModuleEntry = {
  key: string
  label: string
  icon: React.ElementType
  to: string
  perm?: string
  /** 'main' = above Settings; 'people' = inside the People section */
  section: 'main' | 'people'
}

const SIMPLE_MODULE_NAV: SimpleModuleEntry[] = [
  // ── People section ──────────────────────────────────────────────────────────
  { key: 'departments', label: 'Departments', icon: Building2, to: '/departments', perm: 'can_view_departments', section: 'people' },
  { key: 'customers',   label: 'Customers',   icon: Users,     to: '/customers',   perm: 'can_view_customers',   section: 'people' },
]

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
            : 'text-gray-600 hover:bg-indigo-50 hover:text-indigo-700'
        } ${collapsed ? 'justify-center' : ''}`
      }
    >
      <Icon size={18} className="shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  )
}

function SectionLabel({ label, collapsed }: { label: string; collapsed?: boolean }) {
  if (collapsed) return <div className="mx-2 my-2 border-t border-gray-200" />
  return (
    <div className="pt-4 pb-1 px-3">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
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
          ? 'text-indigo-600 bg-indigo-50 font-semibold'
          : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
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
            ? 'text-indigo-600 bg-indigo-50'
            : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
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
        <div className="mt-0.5 ml-2 pl-2 border-l border-gray-200 space-y-0.5 pb-0.5">
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
              : 'text-gray-600 hover:bg-indigo-50 hover:text-indigo-700'
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
            ? 'text-indigo-700 bg-indigo-50'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
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
        <div className="mt-0.5 ml-3 pl-3 border-l border-gray-200 space-y-0.5 pb-1">
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
  const tenantLogo  = useTenantStore((s) => s.logo)
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
    <aside className="flex flex-col h-full bg-white text-gray-900 w-full overflow-hidden border-r border-gray-200">

      {/* Brand + collapse toggle */}
      <div
        className={`flex items-center border-b border-gray-200 shrink-0 min-h-[60px] ${
          collapsed ? 'px-3 justify-center' : 'px-4 gap-2'
        }`}
      >
        {!collapsed && (
          <div className="flex-1 min-w-0 flex items-center gap-2.5">
            {/* Logo image — shown when tenant has set a logo */}
            {tenantLogo ? (
              <img
                src={tenantLogo}
                alt={tenantName ?? 'Logo'}
                className="h-8 max-w-[120px] object-contain shrink-0"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
                <span className="text-white font-bold text-sm">
                  {(tenantName ?? 'N').charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div className="min-w-0">
              <p className="text-indigo-600 font-bold text-sm leading-tight tracking-tight truncate">
                {tenantName || 'NEXUS BMS'}
              </p>
              {tenantName && (
                <p className="text-gray-400 text-[10px] leading-tight">powered by Tech Yatra</p>
              )}
            </div>
          </div>
        )}

        {!isMobile && (
          <button
            onClick={onCollapse}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition shrink-0"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        )}

        {isMobile && (
          <button
            onClick={onMobileClose}
            className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition shrink-0"
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

                <NavSubSection label="Sales" icon={<Receipt size={11} />} matchTabs={['invoices','credit-notes','finance-review','quotations']}>
                  <SubNavItem to="/accounting?tab=invoices"      label="Invoices"       icon={<Receipt      size={13} />} />
                  <SubNavItem to="/accounting?tab=credit-notes"  label="Credit Notes"   icon={<RotateCcw    size={13} />} />
                  <SubNavItem to="/accounting?tab=finance-review" label="Finance Review" icon={<ShieldCheck  size={13} />} />
                  <SubNavItem to="/accounting?tab=quotations"    label="Quotations"     icon={<FileQuestion size={13} />} />
                </NavSubSection>

                <NavSubSection label="Purchases" icon={<ShoppingCart size={11} />} matchTabs={['bills','debit-notes','tds']}>
                  <SubNavItem to="/accounting?tab=bills"        label="Bills"        icon={<FileText size={13} />} />
                  <SubNavItem to="/accounting?tab=debit-notes"  label="Debit Notes"  icon={<FileText size={13} />} />
                  <SubNavItem to="/accounting?tab=tds"          label="TDS"          icon={<Percent  size={13} />} />
                </NavSubSection>

                <NavSubSection label="Banking" icon={<Building2 size={11} />} matchTabs={['payments','banks','bank-reconciliation']}>
                  <SubNavItem to="/accounting?tab=payments"           label="Payments"         icon={<CreditCard    size={13} />} />
                  <SubNavItem to="/accounting?tab=banks"              label="Bank Accounts"    icon={<Building2     size={13} />} />
                  <SubNavItem to="/accounting?tab=bank-reconciliation" label="Reconciliation"  icon={<ArrowRightLeft size={13} />} />
                </NavSubSection>

                <NavSubSection label="Ledger" icon={<BookOpen size={11} />} matchTabs={['journals','accounts','recurring-journals','ledger','day-book']}>
                  <SubNavItem to="/accounting?tab=journals"          label="Journal Entries"    icon={<BookOpen    size={13} />} />
                  <SubNavItem to="/accounting?tab=accounts"          label="Chart of Accounts"  icon={<Layers      size={13} />} />
                  <SubNavItem to="/accounting?tab=recurring-journals" label="Recurring Journals" icon={<Repeat2     size={13} />} />
                  <SubNavItem to="/accounting?tab=ledger"            label="Ledger"             icon={<BookMarked  size={13} />} />
                  <SubNavItem to="/accounting?tab=day-book"          label="Day Book"           icon={<CalendarDays size={13} />} />
                </NavSubSection>

                <NavSubSection label="Payroll" icon={<Coins size={11} />} matchTabs={['payslips']}>
                  <SubNavItem to="/accounting?tab=payslips" label="Payslips & Coins" icon={<Coins size={13} />} />
                </NavSubSection>

                <NavSubSection label="Reports" icon={<BarChart2 size={11} />} matchTabs={['reports']}>
                  <SubNavItem to="/accounting?tab=reports" label="Financial Reports" icon={<BarChart2 size={13} />} />
                </NavSubSection>
              </NavSection>
            )}
            {modules.has('cms') && (
              <NavSection label="Website / CMS" icon={Globe} basePath="/cms" collapsed={collapsed}>
                <SubNavItem to="/cms?tab=settings" label="Site Settings"   icon={<Globe size={13} />} />
                <SubNavItem to="/cms?tab=pages"    label="Pages"           icon={<Layout size={13} />} />
                <SubNavItem to="/cms?tab=blog"     label="Blog"            icon={<BookOpen size={13} />} />
                <SubNavItem to="/cms?tab=domain"   label="Domain"          icon={<Link2 size={13} />} />
                <SubNavItem to="/cms?tab=ai"       label="AI Generator"    icon={<Sparkles size={13} />} />
                {/* View Site opens the public renderer */}
                <a
                  href="/preview"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-colors text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                >
                  <ExternalLink size={13} className="shrink-0 opacity-75" />
                  <span className="truncate">View Live Site</span>
                </a>
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
            {/* Auto-rendered simple module nav items (main section). */}
            {/* Register new simple modules in SIMPLE_MODULE_NAV above. */}
            {SIMPLE_MODULE_NAV
              .filter(m => m.section === 'main' && modules.has(m.key) && (!m.perm || perms.can(m.perm)))
              .map(m => (
                <NavItem key={m.key} to={m.to} label={m.label} icon={m.icon} collapsed={collapsed} />
              ))
            }

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
            {/* Auto-rendered people-section module items. */}
            {SIMPLE_MODULE_NAV
              .filter(m => m.section === 'people' && modules.has(m.key) && (!m.perm || perms.can(m.perm)))
              .map(m => (
                <NavItem key={m.key} to={m.to} label={m.label} icon={m.icon} collapsed={collapsed} />
              ))
            }
          </>
        )}
      </nav>

      {/* User footer */}
      <div
        className={`border-t border-gray-200 shrink-0 ${
          collapsed ? 'px-2 py-3 flex flex-col items-center gap-2' : 'px-4 py-4'
        }`}
      >
        {!collapsed && (
          <div className="mb-2">
            <p className="text-xs text-gray-600 truncate">
              {user?.full_name || user?.email || 'User'}
            </p>
            {roleBadge && (
              <span className="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-indigo-100 text-indigo-600">
                {roleBadge}
              </span>
            )}
            {isSuperAdmin && (
              <span className="inline-block mt-0.5 ml-1 text-indigo-600 text-xs">(Super Admin)</span>
            )}
          </div>
        )}
        <button
          onClick={handleLogout}
          title={collapsed ? 'Sign out' : undefined}
          className={`flex items-center gap-2 text-sm text-gray-500 hover:text-red-500 transition ${
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


