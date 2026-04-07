import { useLocation } from 'react-router-dom'

export function useAccountingRoute() {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const queryTab = params.get('tab') ?? ''
  const rawPath = location.pathname.startsWith('/') ? location.pathname.slice(1) : location.pathname
  const cleanPath = rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath
  const pathSegments = cleanPath.split('/')
  const pathTab = pathSegments[0] === 'accounting' ? pathSegments[1] ?? '' : ''
  const activeTab = queryTab || pathTab

  return { activeTab, pathTab, location }
}
