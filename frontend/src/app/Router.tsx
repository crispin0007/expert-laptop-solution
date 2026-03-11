import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import Layout from './Layout'
import ProtectedRoute from '../features/auth/ProtectedRoute'
import SuperAdminRoute from '../features/admin/SuperAdminRoute'
import RoleGuard from '../features/auth/RoleGuard'
import ModuleGuard from '../features/auth/ModuleGuard'
import LoginPage from '../features/auth/LoginPage'
import DashboardPage from '../features/dashboard/DashboardPage'
import PlatformDashboard from '../features/admin/PlatformDashboard'
import TenantDetailPage from '../features/admin/TenantDetailPage'
import UpgradePage from '../features/upgrade/UpgradePage'
import { useAuthStore } from '../store/authStore'
import { useTenantStore } from '../store/tenantStore'

function SmartIndex() {
  const user = useAuthStore((s) => s.user)
  const subdomain = useTenantStore((s) => s.subdomain)
  const isSuperAdmin = (user?.is_superadmin ?? false) && !subdomain
  return isSuperAdmin ? <PlatformDashboard /> : <DashboardPage />
}
import TicketListPage from '../features/tickets/TicketListPage'
import TicketDetailPage from '../features/tickets/TicketDetailPage'
import TicketTypeManagementPage from '../features/tickets/TicketTypeManagementPage'
import ProjectListPage from '../features/projects/ProjectListPage'
import ProjectDetailPage from '../features/projects/ProjectDetailPage'
import CustomerListPage from '../features/customers/CustomerListPage'
import CustomerDetailPage from '../features/customers/CustomerDetailPage'
import AccountingPage from '../features/accounting/AccountingPage'
import InventoryPage from '../features/inventory/InventoryPage'
import DepartmentListPage from '../features/departments/DepartmentListPage'
import StaffListPage from '../features/staff/StaffListPage'
import RolesListPage from '../features/roles/RolesListPage'
import TenantManagementPage from '../features/admin/TenantManagementPage'
import PlanManagementPage from '../features/admin/PlanManagementPage'
import SettingsPage from '../features/settings/SettingsPage'
import CMSSitePage from '../features/cms/CMSSitePage'
import PageEditor from '../features/cms/PageEditor'
import PageBlockManager from '../features/cms/PageBlockManager'
import PublicSite from '../features/cms/public/PublicSite'

// Force TicketDetailPage to fully remount when navigating between tickets
function KeyedTicketDetail() {
  const { id } = useParams()
  return <TicketDetailPage key={id} />
}

export default function Router() {
  return (
    <BrowserRouter>
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
                <TicketListPage />
              </ModuleGuard>
            }
          />
          <Route
            path="tickets/:id"
            element={
              <ModuleGuard module="tickets">
                <KeyedTicketDetail />
              </ModuleGuard>
            }
          />

          {/* Projects module */}
          <Route
            path="projects"
            element={
              <ModuleGuard module="projects">
                <ProjectListPage />
              </ModuleGuard>
            }
          />
          <Route
            path="projects/:id"
            element={
              <ModuleGuard module="projects">
                <ProjectDetailPage />
              </ModuleGuard>
            }
          />

          {/* Customers module */}
          <Route
            path="customers"
            element={
              <ModuleGuard module="customers">
                <CustomerListPage />
              </ModuleGuard>
            }
          />
          <Route
            path="customers/:id"
            element={
              <ModuleGuard module="customers">
                <CustomerDetailPage />
              </ModuleGuard>
            }
          />

          {/* Inventory module */}
          <Route
            path="inventory"
            element={
              <ModuleGuard module="inventory">
                <InventoryPage />
              </ModuleGuard>
            }
          />

          {/* Departments module */}
          <Route
            path="departments"
            element={
              <ModuleGuard module="departments">
                <DepartmentListPage />
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

          {/* CMS / Website Builder module */}
          <Route
            path="cms"
            element={
              <ModuleGuard module="cms">
                <CMSSitePage />
              </ModuleGuard>
            }
          />
          {/* CMS Phase 2: GrapeJS visual page editor (full-screen, no Layout chrome) */}
          <Route
            path="cms/pages/:pageId/edit"
            element={
              <ModuleGuard module="cms">
                <PageEditor />
              </ModuleGuard>
            }
          />
          {/* CMS: Section / block manager for a page */}
          <Route
            path="cms/pages/:pageId/blocks"
            element={
              <ModuleGuard module="cms">
                <PageBlockManager />
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
    </BrowserRouter>
  )
}

