import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './Layout'
import ProtectedRoute from '../features/auth/ProtectedRoute'
import SuperAdminRoute from '../features/admin/SuperAdminRoute'
import LoginPage from '../features/auth/LoginPage'
import DashboardPage from '../features/dashboard/DashboardPage'
import TicketListPage from '../features/tickets/TicketListPage'
import TicketDetailPage from '../features/tickets/TicketDetailPage'
import TicketTypeManagementPage from '../features/tickets/TicketTypeManagementPage'
import ProjectListPage from '../features/projects/ProjectListPage'
import ProjectDetailPage from '../features/projects/ProjectDetailPage'
import CustomerListPage from '../features/customers/CustomerListPage'
import CustomerDetailPage from '../features/customers/CustomerDetailPage'
import AccountingPage from '../features/accounting/AccountingPage'
import CoinsPage from '../features/accounting/CoinsPage'
import InventoryPage from '../features/inventory/InventoryPage'
import DepartmentListPage from '../features/departments/DepartmentListPage'
import StaffListPage from '../features/staff/StaffListPage'
import TenantManagementPage from '../features/admin/TenantManagementPage'
import SettingsPage from '../features/settings/SettingsPage'

export default function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="tickets" element={<TicketListPage />} />
          <Route path="tickets/settings" element={<TicketTypeManagementPage />} />
          <Route path="tickets/:id" element={<TicketDetailPage />} />
          <Route path="projects" element={<ProjectListPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="customers" element={<CustomerListPage />} />
          <Route path="customers/:id" element={<CustomerDetailPage />} />
          <Route path="accounting" element={<AccountingPage />} />
          <Route path="coins" element={<CoinsPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="departments" element={<DepartmentListPage />} />
          <Route path="staff" element={<StaffListPage />} />
          <Route path="settings" element={<SettingsPage />} />

          {/* Super Admin only */}
          <Route
            path="admin/tenants"
            element={
              <SuperAdminRoute>
                <TenantManagementPage />
              </SuperAdminRoute>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
