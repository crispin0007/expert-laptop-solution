import { useLocation } from 'react-router-dom'

export function useAccountingRoute() {
  const location = useLocation()
  const pathSegments = location.pathname.replace(/^\/|\/+$/g, '').split('/')
  const pathTab = pathSegments[0] === 'accounting' ? pathSegments[1] ?? '' : ''
  const activeTab = pathTab

  return { activeTab, pathTab, location }
}
