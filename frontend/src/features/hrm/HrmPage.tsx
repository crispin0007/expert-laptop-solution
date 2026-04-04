/**
 * HrmPage — HR Management shell.
 *
 * Tab routing uses the `?tab=` query param.
 * Default tab: "dashboard"
 * Navigation is rendered in the main app sidebar.
 */
import { useSearchParams } from 'react-router-dom'
import { usePermissions } from '../../hooks/usePermissions'
import HrmDashboard from './tabs/HrmDashboard'
import StaffDirectory from './tabs/StaffDirectory'
import LeaveTab from './tabs/LeaveTab'
import AttendanceTab from './tabs/AttendanceTab'
import LeaveSettingsPane from './tabs/LeaveSettingsPane'
import ShiftTab from './tabs/ShiftTab'
import ReportsTab from './tabs/ReportsTab'

type TabKey = 'dashboard' | 'staff' | 'attendance' | 'leaves' | 'shifts' | 'reports' | 'settings'

export default function HrmPage() {
  const [searchParams] = useSearchParams()
  const { isAdmin, isManager } = usePermissions()
  const canManage = isAdmin || isManager

  const tab = (searchParams.get('tab') as TabKey) ?? 'dashboard'

  return (
    <div>
      {tab === 'dashboard'  && <HrmDashboard />}
      {tab === 'staff'      && <StaffDirectory />}
      {tab === 'attendance' && <AttendanceTab />}
      {tab === 'leaves'     && <LeaveTab />}
      {tab === 'shifts'     && canManage && <ShiftTab />}
      {tab === 'reports'    && canManage && <ReportsTab />}
      {tab === 'settings'   && canManage && <LeaveSettingsPane />}
    </div>
  )
}
