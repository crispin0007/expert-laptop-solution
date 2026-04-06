import { Fragment, useMemo, useRef, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../../api/client'
import { ACCOUNTING } from '../../../api/endpoints'
import toast from 'react-hot-toast'
import { useConfirm } from '../../../components/ConfirmDialog'
import {
  BookOpen,
  Search,
  Plus,
  Download,
  ChevronRight,
  ChevronDown,
  Eye,
  EyeOff,
  Info,
  Pencil,
  Trash2,
  CheckCircle,
  X,
  Loader2,
  ChevronsUpDown,
  ChevronsDownUp,
} from 'lucide-react'
import { Spinner } from '../components/accountingShared'
import { buildAccountingUrl, downloadCsv, csvFromRows, formatNpr } from '../utils'
import { currentFiscalYear, fiscalYearAdParams } from '../../../utils/nepaliDate'
import type { Account, AccountGroup, InlineAddState } from '../types/accounting'

const npr = formatNpr
const buildAccountingTabUrl = buildAccountingUrl

function nextChildCode(parentId: number | null, parentCode: string, allAccts: Account[]): string {
  const siblings = allAccts.filter(a => (a.parent ?? null) === parentId)
  const nums = siblings.map(s => parseInt(s.code, 10)).filter(n => !isNaN(n))
  if (!nums.length) return parentCode + '1'
  return String(Math.max(...nums) + 1)
}

function nextRootCode(type: string, allAccts: Account[]): string {
  const roots = allAccts.filter(a => !a.parent && a.type === type)
  const nums = roots.map(s => parseInt(s.code, 10)).filter(n => !isNaN(n))
  if (!nums.length) return { asset: '1900', liability: '2900', equity: '3900', revenue: '4900', expense: '5900' }[type] ?? '9000'
  return String(Math.max(...nums) + 1)
}

function buildAccountTree(accounts: Account[], maxDepth = 5): { account: Account; depth: number }[] {
  const ids = new Set(accounts.map(a => a.id))
  const byParent = new Map<number | null, Account[]>()
  accounts.forEach(a => {
    const key = (a.parent != null && ids.has(a.parent)) ? a.parent : null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(a)
  })
  byParent.forEach(arr => arr.sort((a, b) => a.code.localeCompare(b.code)))
  const result: { account: Account; depth: number }[] = []
  function walk(parentId: number | null, depth: number) {
    if (depth > maxDepth) return
    ;(byParent.get(parentId) ?? []).forEach(a => { result.push({ account: a, depth }); walk(a.id, depth + 1) })
  }
  walk(null, 0)
  return result
}

function InlineEditRow({
  account,
  onSave,
  onCancel,
}: {
  account: Account
  onSave: () => void
  onCancel: () => void
}) {
  const qc  = useQueryClient()
  const [name,        setName]        = useState(account.name)
  const [code,        setCode]        = useState(account.code)
  const [description, setDescription] = useState(account.description ?? '')
  const [openingBal,  setOpeningBal]  = useState(account.opening_balance ?? '0')
  const [isActive,    setIsActive]    = useState(account.is_active)
  const nameRef = useRef<HTMLInputElement>(null)
  useEffect(() => { nameRef.current?.focus() }, [])

  const mutation = useMutation({
    mutationFn: (payload: unknown) =>
      apiClient.patch(`${ACCOUNTING.ACCOUNTS}${account.id}/`, payload),
    onSuccess: () => {
      toast.success('Account updated')
      qc.invalidateQueries({ queryKey: ['accounts'] })
      onSave()
    },
    onError: (e: { response?: { data?: { detail?: string; code?: string[] } } }) =>
      toast.error(e?.response?.data?.detail ?? e?.response?.data?.code?.[0] ?? 'Update failed'),
  })

  function submit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!name.trim()) { nameRef.current?.focus(); return }
    mutation.mutate({
      code: code.trim(),
      name: name.trim(),
      description: description.trim(),
      opening_balance: openingBal || '0',
      is_active: isActive,
    })
  }

  return (
    <tr className="bg-amber-50/50 border-y border-amber-100">
      <td className="py-2 pl-3 align-top">
        <input data-lpignore="true"
          value={code} onChange={e => setCode(e.target.value)}
          className="w-24 font-mono text-xs border border-amber-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
        />
      </td>
      <td className="py-2 pr-2 align-top" colSpan={2}>
        <form onSubmit={submit} className="space-y-1">
          <input data-lpignore="true"
            ref={nameRef}
            value={name} onChange={e => setName(e.target.value)}
            className="w-full text-sm border border-amber-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
            onKeyDown={e => { if (e.key === 'Escape') onCancel() }}
            placeholder="Account name"
          />
          <input data-lpignore="true"
            value={description} onChange={e => setDescription(e.target.value)}
            className="w-full text-xs border border-amber-100 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-amber-300 text-gray-500"
            placeholder="Description / notes (optional)"
          />
          <div className="flex items-center gap-3 mt-1">
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
              <span>Opening Bal:</span>
              <input data-lpignore="true"
                type="number" value={openingBal} onChange={e => setOpeningBal(e.target.value)}
                className="w-24 font-mono text-xs border border-amber-200 rounded px-2 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
            </label>
            <button
              type="button"
              onClick={() => setIsActive(v => !v)}
              className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded border font-medium transition-colors ${
                isActive
                  ? 'border-green-300 text-green-700 bg-green-50 hover:bg-green-100'
                  : 'border-gray-300 text-gray-400 bg-gray-50 hover:bg-gray-100'
              }`}
            >
              {isActive ? <Eye size={11} /> : <EyeOff size={11} />}
              {isActive ? 'Active' : 'Inactive'}
            </button>
          </div>
        </form>
      </td>
      <td className="py-2 align-top" colSpan={2}>
        <div className="flex items-center gap-1">
          <button onClick={submit} disabled={mutation.isPending}
            className="p-1 rounded bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50" title="Save">
            {mutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={13} />}
          </button>
          <button onClick={onCancel} className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100" title="Cancel (Esc)">
            <X size={13} />
          </button>
        </div>
      </td>
    </tr>
  )
}

function InlineAddRow({
  state, allAccounts: _allAccounts, onSave, onCancel,
}: {
  state: InlineAddState
  allAccounts: Account[]
  onSave: () => void
  onCancel: () => void
}) {
  const qc = useQueryClient()
  const [name,        setName]        = useState('')
  const [code,        setCode]        = useState(state.suggestedCode)
  const [description, setDescription] = useState('')
  const [openingBal,  setOpeningBal]  = useState('0')
  const [groupId,     setGroupId]     = useState<number | ''>('')
  const [showGroupSelector, setShowGroupSelector] = useState(false)
  const parentAccount = useMemo(
    () => (state.resolvedParentId ? _allAccounts.find(a => a.id === state.resolvedParentId) ?? null : null),
    [state.resolvedParentId, _allAccounts],
  )
  const isControlParent = Boolean(
    parentAccount && parentAccount.is_system && parentAccount.parent === null &&
    ['1000', '2000', '3000', '4000', '5000'].includes(parentAccount.code)
  )
  const shouldInheritParentGroup = Boolean(parentAccount?.group) && !isControlParent
  const nameRef = useRef<HTMLInputElement>(null)
  useEffect(() => { nameRef.current?.focus() }, [])

  const { data: groups = [] } = useQuery<AccountGroup[]>({
    queryKey: ['account-groups', state.type],
    queryFn: () => apiClient.get(ACCOUNTING.ACCOUNT_GROUPS + `?type=${state.type}`).then(r =>
      Array.isArray(r.data) ? r.data : (r.data?.data ?? r.data?.results ?? [])
    ),
  })

  const typeColors: Record<string, string> = {
    asset: 'text-blue-600 bg-blue-50', liability: 'text-orange-600 bg-orange-50',
    equity: 'text-purple-600 bg-purple-50', revenue: 'text-green-600 bg-green-50',
    expense: 'text-red-600 bg-red-50',
  }

  const mutation = useMutation({
    mutationFn: (payload: unknown) => apiClient.post(ACCOUNTING.ACCOUNTS, payload),
    onSuccess: () => {
      toast.success('Account created')
      qc.invalidateQueries({ queryKey: ['accounts'] })
      onSave()
    },
    onError: (e: { response?: { data?: { detail?: string; code?: string[]; group?: string[] } } }) =>
      toast.error(e?.response?.data?.detail ?? e?.response?.data?.group?.[0] ?? e?.response?.data?.code?.[0] ?? 'Failed to create account'),
  })

  const autoGroupId = useMemo<number | ''>(() => {
    if (shouldInheritParentGroup && parentAccount?.group) {
      return parentAccount.group
    }
    return groups[0]?.id ?? ''
  }, [groups, parentAccount, shouldInheritParentGroup])

  useEffect(() => {
    if (groupId) return
    if (autoGroupId) {
      setGroupId(autoGroupId)
    }
  }, [autoGroupId, groupId])

  function submit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!name.trim()) { nameRef.current?.focus(); return }
    const resolvedGroup = groupId || autoGroupId || ''
    if (!resolvedGroup) { toast.error('Please select an account group.'); return }
    mutation.mutate({
      code: code.trim(), name: name.trim(), type: state.type, parent: state.resolvedParentId,
      description: description.trim(),
      opening_balance: openingBal || '0',
      group: resolvedGroup,
    })
  }

  const indent = state.depth * 20

  return (
    <tr className="bg-indigo-50/40 border-y border-indigo-100">
      <td className="py-2 align-top" style={{ paddingLeft: `${16 + indent + 20}px` }}>
        <input data-lpignore="true"
          value={code} onChange={e => setCode(e.target.value)}
          className="w-24 font-mono text-xs border border-indigo-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
          placeholder="Code"
        />
      </td>
      <td className="py-2 pr-2 align-top" colSpan={2}>
        <form onSubmit={submit} className="space-y-1">
          <div className="flex items-center gap-2">
            <input data-lpignore="true"
              ref={nameRef}
              value={name} onChange={e => setName(e.target.value)}
              className="flex-1 text-sm border border-indigo-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
              placeholder="Account name…"
              onKeyDown={e => { if (e.key === 'Escape') onCancel() }}
            />
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${typeColors[state.type] ?? ''}`}>
              {state.type}
            </span>
          </div>
          {showGroupSelector ? (
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-gray-500">Account Group</label>
              <select
                value={groupId}
                onChange={e => setGroupId(e.target.value ? Number(e.target.value) : '')}
                className={`w-full text-xs border rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 ${
                  !groupId ? 'border-indigo-300 text-gray-400' : 'border-indigo-200 text-gray-700'
                }`}
              >
                <option value="">Select account group</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  setGroupId(autoGroupId)
                  setShowGroupSelector(false)
                }}
                className="text-[11px] text-gray-500 hover:text-gray-700"
              >
                Use default group
              </button>
            </div>
          ) : (
            <div className="pt-0.5">
              <button
                type="button"
                onClick={() => setShowGroupSelector(true)}
                className="text-[11px] text-indigo-600 hover:text-indigo-800"
              >
                Assign different group
              </button>
            </div>
          )}
          <input data-lpignore="true"
            value={description} onChange={e => setDescription(e.target.value)}
            className="w-full text-xs border border-indigo-100 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 text-gray-500"
            placeholder="Description / notes (optional)"
          />
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            <span>Opening Bal:</span>
            <input data-lpignore="true"
              type="number" value={openingBal} onChange={e => setOpeningBal(e.target.value)}
              className="w-24 font-mono text-xs border border-indigo-200 rounded px-2 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </label>
        </form>
      </td>
      <td className="py-2 align-top" colSpan={2}>
        <div className="flex items-center gap-1">
          <button onClick={submit} disabled={mutation.isPending}
            className="p-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50" title="Save (Enter)">
            {mutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={13} />}
          </button>
          <button onClick={onCancel} className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100" title="Cancel (Esc)">
            <X size={13} />
          </button>
        </div>
      </td>
    </tr>
  )
}

export default function AccountsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const { data, isLoading } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => apiClient.get(ACCOUNTING.ACCOUNTS + '?no_page=1').then(r =>
      Array.isArray(r.data) ? r.data : (r.data?.data ?? r.data?.results ?? [])),
  })

  const [inlineAdd,    setInlineAdd]    = useState<InlineAddState | null>(null)
  const [editingId,    setEditingId]    = useState<number | null>(null)
  const [search,       setSearch]       = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('active')
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const [expandedAccounts, setExpandedAccounts] = useState<Set<number>>(new Set())

  const allAccounts = data ?? []

  const defaultParentIdByType = useMemo(() => {
    const byCode = new Map(allAccounts.map(a => [a.code, a.id]))
    return {
      asset: byCode.get('1000') ?? null,
      liability: byCode.get('2000') ?? null,
      equity: byCode.get('3000') ?? null,
      revenue: byCode.get('4000') ?? null,
      expense: byCode.get('5000') ?? null,
    } as const
  }, [allAccounts])

  const controlHeaderCodes = new Set(['1000', '2000', '3000', '4000', '5000'])
  const isControlHeaderAccount = (a: Account) =>
    a.is_system && a.parent === null && controlHeaderCodes.has(a.code)

  const listAccounts = allAccounts.filter(a => !isControlHeaderAccount(a))

  const expandableAccountIds = useMemo(() => {
    const parentIds = new Set<number>()
    for (const a of listAccounts) {
      if (a.parent !== null) parentIds.add(a.parent)
    }
    return Array.from(parentIds)
  }, [listAccounts])

  const visibleAccounts = listAccounts.filter(a => {
    if (activeFilter === 'active'   && !a.is_active) return false
    if (activeFilter === 'inactive' &&  a.is_active) return false
    if (search) {
      const q = search.toLowerCase()
      return a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) ||
             (a.description ?? '').toLowerCase().includes(q)
    }
    return true
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`${ACCOUNTING.ACCOUNTS}${id}/`),
    onSuccess: () => {
      toast.success('Account deleted')
      qc.invalidateQueries({ queryKey: ['accounts'] })
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Cannot delete this account'),
  })

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      apiClient.patch(`${ACCOUNTING.ACCOUNTS}${id}/`, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
    onError: () => toast.error('Failed to update account status'),
  })

  function confirmDelete(a: Account) {
    if (a.is_system) { toast.error('System accounts cannot be deleted.'); return }
    confirm({
      title: 'Delete Account',
      message: `Delete "${a.code} – ${a.name}"? This cannot be undone.`,
      variant: 'danger',
      confirmLabel: 'Delete',
    }).then(ok => { if (ok) deleteMutation.mutate(a.id) })
  }

  function openChild(a: Account, depth: number) {
    setInlineAdd({
      parentId: a.id,
      resolvedParentId: a.id,
      type: a.type,
      depth,
      suggestedCode: nextChildCode(a.id, a.code, allAccounts),
    })
  }

  function openRoot(type: string) {
    const resolvedParentId = defaultParentIdByType[type as keyof typeof defaultParentIdByType] ?? null
    const parentCode = resolvedParentId ? (allAccounts.find(a => a.id === resolvedParentId)?.code ?? '') : ''
    setInlineAdd({
      parentId: null,
      resolvedParentId,
      type,
      depth: 0,
      suggestedCode: resolvedParentId && parentCode
        ? nextChildCode(resolvedParentId, parentCode, allAccounts)
        : nextRootCode(type, allAccounts),
    })
  }

  function exportCSV() {
    const header = ['Code', 'Account Name', 'Type', 'Parent Code', 'Description', 'Opening Balance', 'Current Balance', 'Active']
    const rows = allAccounts.map(a => {
      const parent = allAccounts.find(p => p.id === a.parent)
      return [
        a.code,
        a.name,
        a.type,
        parent?.code ?? '',
        a.description ?? '',
        a.opening_balance ?? '0',
        a.balance ?? '0',
        a.is_active ? 'Yes' : 'No',
      ]
    })
    const csv = csvFromRows([header, ...rows])
    downloadCsv('chart-of-accounts.csv', csv)
  }

  const typeOrder: Array<[string, string, string]> = [
    ['asset',     'Asset',     'text-blue-700   bg-blue-50   border-blue-100'],
    ['liability', 'Liability', 'text-orange-700 bg-orange-50 border-orange-100'],
    ['equity',    'Equity',    'text-purple-700 bg-purple-50 border-purple-100'],
    ['revenue',   'Revenue',   'text-green-700  bg-green-50  border-green-100'],
    ['expense',   'Expense',   'text-red-700    bg-red-50    border-red-100'],
  ]

  const protectedCoreCodes = new Set([
    '1000', '1100', '1150', '1200', '1300',
    '2000', '2100', '2200', '2300',
    '3000', '3100',
    '4000', '4100', '4200',
    '5000', '5100', '5200', '5300',
  ])

  const allExpanded =
    expandableAccountIds.length > 0 &&
    expandableAccountIds.every(id => expandedAccounts.has(id))

  function renderSection(type: string, label: string, sectionCls: string) {
    const sectionAll     = listAccounts.filter(a => a.type === type)
    const sectionVisible = visibleAccounts.filter(a => a.type === type)
    const childParentIds = new Set(sectionAll.filter(a => a.parent !== null).map(a => a.parent as number))

    const isHiddenByAncestor = (acct: Account, depth: number) => {
      if (depth < 1) return false
      const parentId = acct.parent
      if (!parentId) return false
      return !expandedAccounts.has(parentId)
    }

    const treeItems      = search
      ? sectionVisible.map(a => ({ account: a, depth: 0 }))
      : buildAccountTree(sectionAll).filter(({ account: a }) =>
          activeFilter === 'active'   ? a.is_active :
          activeFilter === 'inactive' ? !a.is_active : true)

    const isRootInline = inlineAdd?.parentId === null && inlineAdd?.type === type
    if (!treeItems.length && !isRootInline) return null

    return (
      <div key={type} className={`bg-white rounded-xl border overflow-hidden ${sectionCls}`}>
        <div className={`px-5 py-2.5 border-b flex items-center justify-between ${sectionCls}`}>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCollapsedSections(prev => {
                const next = new Set(prev)
                if (next.has(type)) next.delete(type)
                else next.add(type)
                return next
              })}
              className="text-gray-500 hover:text-gray-700 transition-colors"
              title={collapsedSections.has(type) ? 'Expand section' : 'Collapse section'}
            >
              <ChevronDown size={14} className={`transition-transform ${collapsedSections.has(type) ? '-rotate-90' : ''}`} />
            </button>
            <span className="font-semibold text-sm">{label} Accounts</span>
            <span className="text-xs text-gray-400 font-normal tabular-nums">
              ({treeItems.length} {activeFilter !== 'all' ? activeFilter : ''})
            </span>
          </div>
          <button
            onClick={() => isRootInline ? setInlineAdd(null) : openRoot(type)}
            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1 rounded hover:bg-indigo-50"
          >
            <Plus size={12} /> Add {label}
          </button>
        </div>

        {collapsedSections.has(type) ? null : (

        <table className="w-full text-sm">
          <thead className="border-b border-gray-50">
            <tr>
              {['Code', 'Account Name', 'Parent', 'Balance', ''].map((h, i) => (
                <th key={i} className="px-4 py-2 text-left text-xs text-gray-400 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isRootInline && (
              <InlineAddRow
                state={inlineAdd!}
                allAccounts={allAccounts}
                onSave={() => setInlineAdd(null)}
                onCancel={() => setInlineAdd(null)}
              />
            )}

            {treeItems.map(({ account: a, depth }) => {
              if (!search && isHiddenByAncestor(a, depth)) return null
              const isChildInline = inlineAdd?.parentId === a.id
              const isEditing     = editingId === a.id
              const canAddChild   = depth < 5
              const isProtectedCore = a.is_system && protectedCoreCodes.has(a.code)
              const parentAcc     = listAccounts.find(p => p.id === a.parent)
              const hasChildren   = childParentIds.has(a.id)
              const isExpanded    = expandedAccounts.has(a.id)
              return (
                <Fragment key={a.id}>
                  {isEditing ? (
                    <InlineEditRow
                      account={a}
                      onSave={() => setEditingId(null)}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <tr className={`group ${a.is_active ? 'hover:bg-gray-50/60' : 'bg-gray-50/40 opacity-60 hover:opacity-80'}`}>
                      <td className="py-2 font-mono text-xs text-indigo-600"
                        style={{ paddingLeft: `${16 + depth * 20}px` }}>
                        <button
                          type="button"
                          disabled={!hasChildren}
                          onClick={() => {
                            if (!hasChildren) return
                            setExpandedAccounts(prev => {
                              const next = new Set(prev)
                              if (next.has(a.id)) next.delete(a.id)
                              else next.add(a.id)
                              return next
                            })
                          }}
                          className={`mr-1 inline-flex items-center justify-center ${hasChildren ? 'text-gray-400 hover:text-indigo-600' : 'text-transparent cursor-default'}`}
                          title={hasChildren ? (isExpanded ? 'Collapse sub-accounts' : 'Expand sub-accounts') : undefined}
                        >
                          <ChevronRight size={12} className={`transition-transform ${hasChildren && isExpanded ? 'rotate-90' : ''}`} />
                        </button>
                        {a.code}
                      </td>
                      <td className="px-3 py-2" style={{ paddingLeft: `${8 + depth * 4}px` }}>
                        <div className="flex items-center gap-1.5">
                          <span className={a.is_active ? 'text-gray-700' : 'text-gray-400 line-through'}>{a.name}</span>
                          {!a.is_active && (
                            <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">inactive</span>
                          )}
                        </div>
                        {a.description && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs" title={a.description}>{a.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-400">
                        {parentAcc ? parentAcc.code : ''}
                      </td>
                      <td className="px-4 py-2 text-gray-800 font-medium text-xs tabular-nums">
                        {npr(a.balance)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            title={isProtectedCore ? 'Core system account status is locked' : (a.is_active ? 'Deactivate account' : 'Activate account')}
                            onClick={() => {
                              if (isProtectedCore) {
                                toast.error('Core system account status is locked.')
                                return
                              }
                              toggleActiveMutation.mutate({ id: a.id, is_active: !a.is_active })
                            }}
                            disabled={isProtectedCore}
                            className={`rounded p-1 transition-colors ${
                              isProtectedCore
                                ? 'text-gray-300 cursor-not-allowed'
                                : a.is_active
                                ? 'text-green-500 hover:text-green-700 hover:bg-green-50'
                                : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
                            }`}>
                            {a.is_active ? <Eye size={13} /> : <EyeOff size={13} />}
                          </button>
                          {canAddChild && (
                            <button
                              title={`Add sub-account under ${a.code}`}
                              onClick={() => isChildInline ? setInlineAdd(null) : openChild(a, depth + 1)}
                              className="text-indigo-400 hover:text-indigo-700 hover:bg-indigo-50 rounded p-1"
                            >
                              <Plus size={13} />
                            </button>
                          )}
                          <button
                            title="Open ledger drill"
                            onClick={() => {
                              const fy = fiscalYearAdParams(currentFiscalYear())
                              navigate(buildAccountingTabUrl('ledger', {
                                account_code: a.code,
                                date_from: fy.date_from,
                                date_to: new Date().toISOString().slice(0, 10),
                                auto_run: 1,
                              }))
                            }}
                            className="text-gray-400 hover:text-indigo-700 hover:bg-indigo-50 rounded p-1"
                          >
                            <BookOpen size={12} />
                          </button>
                          <button
                            title={isProtectedCore ? 'Core system account is locked' : 'Edit account'}
                            onClick={() => {
                              if (isProtectedCore) {
                                toast.error('Core system account is locked.')
                                return
                              }
                              setInlineAdd(null)
                              setEditingId(a.id)
                            }}
                            disabled={isProtectedCore}
                            className={`rounded p-1 ${isProtectedCore ? 'text-gray-300 cursor-not-allowed' : 'text-gray-400 hover:text-amber-600 hover:bg-amber-50'}`}>
                            <Pencil size={12} />
                          </button>
                          {!a.is_system && (
                            <button
                              title="Delete account"
                              onClick={() => confirmDelete(a)}
                              disabled={deleteMutation.isPending}
                              className="text-gray-400 hover:text-red-600 hover:bg-red-50 rounded p-1 disabled:opacity-40">
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}

                  {isChildInline && (
                    <InlineAddRow
                      state={inlineAdd!}
                      allAccounts={allAccounts}
                      onSave={() => setInlineAdd(null)}
                      onCancel={() => setInlineAdd(null)}
                    />
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
        )}
      </div>
    )
  }

  const totalAccounts  = listAccounts.length
  const activeCount    = listAccounts.filter(a =>  a.is_active).length
  const inactiveCount  = listAccounts.filter(a => !a.is_active).length

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap shadow-sm">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input data-lpignore="true"
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search code, name, or description…"
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>

        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {([['all', `All (${totalAccounts})`], ['active', `Active (${activeCount})`], ['inactive', `Inactive (${inactiveCount})`]] as const).map(([val, lbl]) => (
            <button key={val}
              onClick={() => setActiveFilter(val)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                activeFilter === val ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {lbl}
            </button>
          ))}
        </div>

        <button
          onClick={exportCSV}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors"
        >
          <Download size={13} /> Export CSV
        </button>

        <button
          onClick={() => setExpandedAccounts(allExpanded ? new Set() : new Set(expandableAccountIds))}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors"
          title={allExpanded ? 'Collapse all account rows' : 'Expand all account rows'}
        >
          {allExpanded ? <ChevronsDownUp size={13} /> : <ChevronsUpDown size={13} />}
          {allExpanded ? 'Collapse All' : 'Expand All'}
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {typeOrder.map(([type, label, cls]) => {
          const col = listAccounts.filter(a => a.type === type)
          return (
            <div key={type} className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium ${cls}`}>
              <span>{label}</span>
              <span className="opacity-60">({col.length})</span>
            </div>
          )
        })}
        <div className="ml-auto flex items-center gap-1 text-xs text-gray-400">
          <Info size={12} />
          <span>Click <BookOpen size={11} className="inline" /> to drill ledger · <Eye size={11} className="inline" /> to deactivate · <Pencil size={11} className="inline" /> to edit · <Plus size={11} className="inline" /> to add sub-account</span>
        </div>
      </div>

      {isLoading ? <Spinner /> : (
        <div className="space-y-4">
          {typeOrder.map(([type, label, cls]) => renderSection(type, label, cls))}
          {!visibleAccounts.length && !isLoading && (
            <div className="bg-white border border-gray-200 rounded-xl py-12 text-center text-sm text-gray-400">
              No accounts match the current filter.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
