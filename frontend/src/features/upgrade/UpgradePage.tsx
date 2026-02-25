/**
 * UpgradePage — shown when a user tries to access a module not included in their plan.
 * Reads ?module=<key> from the URL and renders a friendly "not in your plan" message.
 */
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useTenantStore } from '../../store/tenantStore'
import {
  Ticket,
  Users,
  Building2,
  FolderKanban,
  Package,
  Receipt,
  Lock,
  ArrowLeft,
} from 'lucide-react'

const MODULE_META: Record<string, { label: string; description: string; Icon: React.ElementType }> =
  {
    tickets: {
      label: 'Ticket System',
      description: 'Customer support tickets, SLA management, assignments and transfers.',
      Icon: Ticket,
    },
    customers: {
      label: 'Customer Management',
      description: 'Customer profiles, contacts, and interaction history.',
      Icon: Users,
    },
    departments: {
      label: 'Departments',
      description: 'Organise staff into departments and teams.',
      Icon: Building2,
    },
    projects: {
      label: 'Project Management',
      description: 'Projects, tasks, milestones and project-based invoicing.',
      Icon: FolderKanban,
    },
    inventory: {
      label: 'Inventory',
      description: 'Products, stock tracking and movements.',
      Icon: Package,
    },
    accounting: {
      label: 'Accounting',
      description: 'Invoices, ledger, coin payslips and financial reporting.',
      Icon: Receipt,
    },
  }

export default function UpgradePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const plan = useTenantStore((s) => s.plan)

  const moduleKey = params.get('module') ?? ''
  const meta = MODULE_META[moduleKey]
  const ModuleIcon = meta?.Icon ?? Lock

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-gray-900 rounded-2xl p-8 shadow-2xl text-center">
        {/* Icon */}
        <div className="mx-auto w-16 h-16 rounded-full bg-indigo-900/40 flex items-center justify-center mb-5">
          <ModuleIcon size={32} className="text-indigo-400" />
        </div>

        {/* Headline */}
        <h1 className="text-xl font-bold text-white mb-2">
          {meta ? meta.label : 'Module'} not available
        </h1>

        {/* Explanation */}
        <p className="text-gray-400 text-sm mb-1">
          {meta?.description}
        </p>
        <p className="text-gray-500 text-sm mb-6">
          This module is not included in your current plan
          {plan ? (
            <span className="text-gray-300 font-medium"> ({plan.name})</span>
          ) : null}
          . Contact your Super Admin to upgrade.
        </p>

        {/* Current plan pill */}
        {plan && (
          <div className="inline-flex items-center gap-2 bg-gray-800 text-gray-300 px-3 py-1.5 rounded-full text-xs font-medium mb-6">
            <Lock size={12} className="text-indigo-400" />
            Current plan: <span className="text-indigo-300 font-semibold">{plan.name}</span>
          </div>
        )}

        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 mx-auto text-sm text-gray-400 hover:text-white transition"
        >
          <ArrowLeft size={16} />
          Go back
        </button>
      </div>
    </div>
  )
}
