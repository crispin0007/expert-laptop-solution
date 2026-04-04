import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import Layout from './Layout'
import ProtectedRoute from '../features/auth/ProtectedRoute'
import SuperAdminRoute from '../features/admin/SuperAdminRoute'
import RoleGuard from '../features/auth/RoleGuard'
import ModuleGuard from '../features/auth/ModuleGuard'
// Keep auth + dashboard eager — they are on the critical path for every load
import LoginPage from '../features/auth/LoginPage'
import DashboardPage from '../features/dashboard/DashboardPage'
import PlatformDashboard from '../features/admin/PlatformDashboard'
import TenantDetailPage from '../features/admin/TenantDetailPage'
import UpgradePage from '../features/upgrade/UpgradePage'
import { useAuthStore } from '../store/authStore'
import { useTenantStore } from '../store/tenantStore'

// ── Lazy-loaded page chunks ────────────────────────────────────────────────────
// Each import() becomes a separate JS chunk loaded only when the route is visited.
// GrapeJS (1.1 MB) is isolated to the cms/pages/:id/edit route.
const TicketListPage           = lazy(() => import('../features/tickets/TicketListPage'))
const TicketDetailPage         = lazy(() => import('../features/tickets/TicketDetailPage'))
const TicketTypeManagementPage = lazy(() => import('../features/tickets/TicketTypeManagementPage'))
const ProjectListPage          = lazy(() => import('../features/projects/ProjectListPage'))
const ProjectDetailPage        = lazy(() => import('../features/projects/ProjectDetailPage'))
const CustomerListPage         = lazy(() => import('../features/customers/CustomerListPage'))
const CustomerDetailPage       = lazy(() => import('../features/customers/CustomerDetailPage'))
const AccountingPage           = lazy(() => import('../features/accounting/AccountingPage'))
const ReportsPage              = lazy(() => import('../features/reports/ReportsPage'))
const InventoryPage            = lazy(() => import('../features/inventory/InventoryPage'))
const DepartmentListPage       = lazy(() => import('../features/departments/DepartmentListPage'))
const HrmPage                  = lazy(() => import('../features/hrm/HrmPage'))
const StaffListPage            = lazy(() => import('../features/staff/StaffListPage'))
const RolesListPage            = lazy(() => import('../features/roles/RolesListPage'))
const TenantManagementPage     = lazy(() => import('../features/admin/TenantManagementPage'))
const PlanManagementPage       = lazy(() => import('../features/admin/PlanManagementPage'))
const SettingsPage             = lazy(() => import('../features/settings/SettingsPage'))
const CMSSitePage              = lazy(() => import('../features/cms/CMSSitePage'))
const PageEditor               = lazy(() => import('../features/cms/PageEditor'))
const PageBlockManager         = lazy(() => import('../features/cms/PageBlockManager'))
const PublicSite               = lazy(() => import('../features/cms/public/PublicSite'))

function SmartIndex() {
  const user = useAuthStore((s) => s.user)
  const subdomain = useTenantStore((s) => s.subdomain)
  const isSuperAdmin = (user?.is_superadmin ?? false) && !subdomain
  return isSuperAdmin ? <PlatformDashboard /> : <DashboardPage />
}

// Force TicketDetailPage to fully remount when navigating between tickets
function KeyedTicketDetail() {
  const { id } = useParams()
  return <TicketDetailPage key={id} />
}

// Minimal full-screen spinner shown while a lazy chunk is downloading
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function Router() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/upgrade" element={<UpgradePage />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            {/* All authenticated members */}
            <Route index element={<SmartIndex />} />

            {/* Tickets module */}
            <Route
              path="tickets"
              element={
                <ModuleGuard module="tickets">
                  <RoleGuard require="can_view_tickets">
                    <TicketListPage />
                  </RoleGuard>
                </ModuleGuard>
              }
            />
            <Route
              path="tickets/:id"
              element={
                <ModuleGuard module="tickets">
                  <RoleGuard require="can_view_tickets">
                    <KeyedTicketDetail />
                  </RoleGuard>
                </ModuleGuard>
              }
            />

            {/* Projects module */}
            <Route
              path="projects"
              element={
                <ModuleGuard module="projects">
                  <RoleGuard require="can_view_projects">
                    <ProjectListPage />
                  </RoleGuard>
                </ModuleGuard>
              }
            />
            <Route
              path="projects/:id"
              element={
                <ModuleGuard module="projects">
                  <RoleGuard require="can_view_projects">
                    <ProjectDetailPage />
                  </RoleGuard>
                </ModuleGuard>
              }
            />

            {/* Customers module */}
            <Route
              path="customers"
              element={
                <ModuleGuard module="customers">
                  <RoleGuard require="can_view_customers">
                    <CustomerListPage />
                  </RoleGuard>
                </ModuleGuard>
              }
            />
            <Route
              path="customers/:id"
              element={
                <ModuleGuard module="customers">
                  <RoleGuard require="can_view_customers">
                    <CustomerDetailPage />
                  </RoleGuard>
                </ModuleGuard>
              }
            />

            {/* Inventory module */}
            <Route
              path="inventory"
              element={
                <ModuleGuard module="inventory">
                  <RoleGuard require="can_view_inventory">
                    <InventoryPage />
                  </RoleGuard>
                </ModuleGuard>
              }
            />

            {/* Departments module */}
            <Route
              path="departments"
              element={
                <ModuleGuard module="departments">
                  <RoleGuard require="can_view_departments">
                    <DepartmentListPage />
                  </RoleGuard>
                </ModuleGuard>
              }
            />

            {/* HRM module */}
            <Route
              path="hrm"
              element={
                <ModuleGuard module="hrm">
                  <RoleGuard require="can_view_hrm">
                    <HrmPage />
                  </RoleGuard>
                </ModuleGuard>
              }
            />

            {/* Accounting module — /coins redirects to the Payslips & Coins tab */}
            <Route
              path="coins"
              element={<Navigate to="/accounting?tab=payslips" replace />}
            />

            {/* Ticket type admin — admin+ */}
            <Route
              path="tickets/settings"
              element={
                <ModuleGuard module="tickets">
                  <RoleGuard require="can_manage_ticket_types">
                    <TicketTypeManagementPage />
                  </RoleGuard>
                </ModuleGuard>
              }
            />

            {/* Staff list — manager+ */}
            <Route
              path="staff"
              element={
                <RoleGuard require="can_view_staff">
                  <StaffListPage />
                </RoleGuard>
              }
            />

            {/* Roles & permissions — admin+ */}
            <Route
              path="roles"
              element={
                <RoleGuard require="can_manage_roles">
                  <RolesListPage />
                </RoleGuard>
              }
            />

            {/* CMS / Website Builder module — manager+ only */}
            <Route
              path="cms"
              element={
                <ModuleGuard module="cms">
                  <RoleGuard require="isManager">
                    <CMSSitePage />
                  </RoleGuard>
                </ModuleGuard>
              }
            />
            {/* CMS Phase 2: GrapeJS visual page editor (full-screen, no Layout chrome) */}
            <Route
              path="cms/pages/:pageId/edit"
              element={
                <ModuleGuard module="cms">
                  <RoleGuard require="isManager">
                    <PageEditor />
                  </RoleGuard>
                </ModuleGuard>
              }
            />
            {/* CMS: Section / block manager for a page */}
            <Route
              path="cms/pages/:pageId/blocks"
              element={
                <ModuleGuard module="cms">
                  <RoleGuard require="isManager">
                    <PageBlockManager />
                  </RoleGuard>
                </ModuleGuard>
              }
            />

            {/* Accounting — manager+ */}
            <Route
              path="accounting"
              element={
                <ModuleGuard module="accounting">
                  <RoleGuard require="can_view_accounting">
                    <AccountingPage />
                  </RoleGuard>
                </ModuleGuard>
              }
            />

            {/* Reports hub — accounting + inventory reports in one place */}
            <Route
              path="reports"
              element={
                <ModuleGuard module="accounting">
                  <RoleGuard require="can_view_accounting">
                    <ReportsPage />
                  </RoleGuard>
                </ModuleGuard>
              }
            />

            {/* Settings — admin+ */}
            <Route
              path="settings"
              element={
                <RoleGuard require="can_manage_settings">
                  <SettingsPage />
                </RoleGuard>
              }
            />

            {/* Super Admin only */}
            <Route
              path="admin/tenants"
              element={
                <SuperAdminRoute>
                  <TenantManagementPage />
                </SuperAdminRoute>
              }
            />
            <Route
              path="admin/tenants/:id"
              element={
                <SuperAdminRoute>
                  <TenantDetailPage />
                </SuperAdminRoute>
              }
            />
            <Route
              path="admin/plans"
              element={
                <SuperAdminRoute>
                  <PlanManagementPage />
                </SuperAdminRoute>
              }
            />
          </Route>
          {/* Public website preview — no auth required */}
          <Route path="/preview/*" element={<PublicSite />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}


