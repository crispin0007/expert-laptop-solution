import { useQuery } from '@tanstack/react-query'
import apiClient from '../../api/client'
import { DEPARTMENTS } from '../../api/endpoints'

interface Department { id: number; name: string; head: number | null }

export default function DepartmentsPage() {
  const { data: departments = [], isLoading } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: () => apiClient.get(DEPARTMENTS.LIST).then(r =>
      Array.isArray(r.data) ? r.data : r.data.results ?? []
    ),
  })

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Departments</h1>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : departments.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No departments yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3 text-left">Name</th>
                <th className="px-5 py-3 text-left">Head (User ID)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {departments.map(d => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-800">{d.name}</td>
                  <td className="px-5 py-3 text-gray-500">{d.head ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
