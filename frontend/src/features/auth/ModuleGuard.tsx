/**
 * ModuleGuard — redirect to /upgrade if the requested module is not active.
 *
 * Usage:
 *   <ModuleGuard module="tickets">
 *     <TicketListPage />
 *   </ModuleGuard>
 */
import { Navigate } from 'react-router-dom'
import { useModules } from '../../hooks/useModules'

interface ModuleGuardProps {
  module: string
  children: React.ReactNode
}

export default function ModuleGuard({ module: moduleKey, children }: ModuleGuardProps) {
  const { has } = useModules()

  if (!has(moduleKey)) {
    return <Navigate to={`/upgrade?module=${moduleKey}`} replace />
  }

  return <>{children}</>
}
