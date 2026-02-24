import { useQuery } from '@tanstack/react-query'
import apiClient from '../../api/client'
import { TICKETS, PROJECTS, ACCOUNTING } from '../../api/endpoints'
import { Ticket, FolderKanban, Coins, TrendingUp } from 'lucide-react'

interface StatCardProps {
  label: string
  value: number | string
  icon: React.ElementType
  color: string
}

function StatCard({ label, value, icon: Icon, color }: StatCardProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex items-center gap-4">
      <div className={`p-3 rounded-xl ${color}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-800">{value}</p>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { data: tickets } = useQuery({
    queryKey: ['tickets', 'open'],
    queryFn: () => apiClient.get(TICKETS.LIST, { params: { status: 'open' } }).then(r => r.data),
  })

  const { data: projects } = useQuery({
    queryKey: ['projects', 'active'],
    queryFn: () => apiClient.get(PROJECTS.LIST, { params: { status: 'active' } }).then(r => r.data),
  })

  const { data: coins } = useQuery({
    queryKey: ['coins', 'pending'],
    queryFn: () => apiClient.get(ACCOUNTING.COINS, { params: { status: 'pending' } }).then(r => r.data),
  })

  const openTickets = Array.isArray(tickets) ? tickets.length : (tickets?.count ?? '—')
  const activeProjects = Array.isArray(projects) ? projects.length : (projects?.count ?? '—')
  const pendingCoins = Array.isArray(coins) ? coins.length : (coins?.count ?? '—')

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Open Tickets" value={openTickets} icon={Ticket} color="bg-indigo-500" />
        <StatCard label="Active Projects" value={activeProjects} icon={FolderKanban} color="bg-emerald-500" />
        <StatCard label="Pending Coins" value={pendingCoins} icon={Coins} color="bg-amber-500" />
        <StatCard label="Today" value={new Date().toLocaleDateString()} icon={TrendingUp} color="bg-rose-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Tickets */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-700 mb-4">Recent Tickets</h2>
          {Array.isArray(tickets) && tickets.length > 0 ? (
            <ul className="divide-y divide-gray-100">
              {tickets.slice(0, 5).map((t: { id: number; ticket_number: string; title: string; status: string; priority: string }) => (
                <li key={t.id} className="py-2 flex justify-between text-sm">
                  <span className="text-gray-700 truncate max-w-xs">
                    <span className="text-indigo-500 font-mono mr-2">{t.ticket_number}</span>
                    {t.title}
                  </span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    t.priority === 'critical' ? 'bg-red-100 text-red-700' :
                    t.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{t.priority}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">No open tickets</p>
          )}
        </div>

        {/* Recent Projects */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-700 mb-4">Active Projects</h2>
          {Array.isArray(projects) && projects.length > 0 ? (
            <ul className="divide-y divide-gray-100">
              {projects.slice(0, 5).map((p: { id: number; name: string; status: string }) => (
                <li key={p.id} className="py-2 flex justify-between text-sm">
                  <span className="text-gray-700 truncate max-w-xs">{p.name}</span>
                  <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                    {p.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">No active projects</p>
          )}
        </div>
      </div>
    </div>
  )
}
