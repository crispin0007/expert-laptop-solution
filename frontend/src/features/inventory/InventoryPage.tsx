import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../api/client'
import { INVENTORY } from '../../api/endpoints'
import Modal from '../../components/Modal'
import toast from 'react-hot-toast'
import {
  Plus, Pencil, Loader2, PackageX, Package, Tag, BarChart2,
  DollarSign, Info, CheckCircle2, XCircle, Globe,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Category {
  id: number
  name: string
}

interface Product {
  id: number
  category: number | null
  name: string
  sku: string
  barcode?: string
  description: string
  unit_price: string
  cost_price?: string
  is_service: boolean
  is_active: boolean
  track_stock?: boolean
  reorder_level?: number
  is_published?: boolean
}

interface StockLevel {
  id: number
  product: number
  product_name: string
  quantity_on_hand: number
  quantity_reserved?: number
}

interface ProductFormData {
  name: string
  sku: string
  barcode: string
  description: string
  unit_price: string
  cost_price: string
  category: number | ''
  is_service: boolean
  is_active: boolean
  track_stock: boolean
  reorder_level: number | ''
  is_published: boolean
}

const DEFAULT_FORM: ProductFormData = {
  name: '', sku: '', barcode: '', description: '', unit_price: '', cost_price: '',
  category: '', is_service: false, is_active: true, track_stock: true, reorder_level: '', is_published: false,
}

// ── Product Detail Modal ──────────────────────────────────────────────────────

function ProductDetailModal({
  product, stockQty, stockReserved, categoryName, onClose, onEdit,
}: {
  product: Product
  stockQty: number
  stockReserved: number
  categoryName: string
  onClose: () => void
  onEdit: () => void
}) {
  const price     = parseFloat(product.unit_price || '0')
  const costPrice = parseFloat(product.cost_price || '0')
  const margin    = costPrice > 0 ? ((price - costPrice) / price * 100).toFixed(1) : null
  const isLowStock = !product.is_service && (stockQty <= (product.reorder_level ?? 0))

  return (
    <Modal open onClose={onClose} title="" width="max-w-2xl">
      {/* Header */}
      <div className="flex items-start gap-4 mb-5 -mt-1">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${product.is_service ? 'bg-purple-100' : 'bg-indigo-100'}`}>
          {product.is_service
            ? <Tag size={22} className="text-purple-600" />
            : <Package size={22} className="text-indigo-600" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-bold text-gray-900">{product.name}</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${product.is_service ? 'bg-purple-100 text-purple-700' : 'bg-indigo-100 text-indigo-700'}`}>
              {product.is_service ? 'Service' : 'Physical Product'}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${product.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
              {product.is_active ? 'Active' : 'Inactive'}
            </span>
            {product.is_published && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-sky-100 text-sky-700">
                Published
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-3 flex-wrap">
            {product.sku && <span>SKU: <span className="font-mono text-gray-600">{product.sku}</span></span>}
            {product.barcode && <span>Barcode: <span className="font-mono text-gray-600">{product.barcode}</span></span>}
            {categoryName && <span>Category: <span className="text-gray-600">{categoryName}</span></span>}
          </p>
        </div>
      </div>

      {/* Description */}
      {product.description && (
        <div className="bg-gray-50 rounded-xl p-3 mb-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 flex items-center gap-1">
            <Info size={11} /> Description
          </p>
          <p className="text-sm text-gray-700 leading-relaxed">{product.description}</p>
        </div>
      )}

      {/* Pricing */}
      <div className={`grid gap-3 mb-4 ${product.is_service ? 'grid-cols-1' : 'grid-cols-3'}`}>
        <div className="bg-indigo-50 rounded-xl p-3">
          <p className="text-xs font-medium text-indigo-400 mb-1 flex items-center gap-1"><DollarSign size={11} /> Selling Price</p>
          <p className="text-xl font-bold text-indigo-700">Rs. {price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
        </div>
        {!product.is_service && (
          <>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs font-medium text-gray-400 mb-1 flex items-center gap-1"><DollarSign size={11} /> Cost Price</p>
              <p className="text-xl font-bold text-gray-700">
                {costPrice > 0 ? `Rs. ${costPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
              </p>
            </div>
            <div className={`rounded-xl p-3 ${margin ? 'bg-green-50' : 'bg-gray-50'}`}>
              <p className="text-xs font-medium text-gray-400 mb-1 flex items-center gap-1"><BarChart2 size={11} /> Margin</p>
              <p className={`text-xl font-bold ${margin ? 'text-green-700' : 'text-gray-400'}`}>
                {margin ? `${margin}%` : '—'}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Stock — physical only */}
      {!product.is_service && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className={`rounded-xl p-3 ${isLowStock ? 'bg-red-50' : 'bg-emerald-50'}`}>
            <p className={`text-xs font-medium mb-1 flex items-center gap-1 ${isLowStock ? 'text-red-400' : 'text-emerald-400'}`}>
              <Package size={11} /> On Hand
            </p>
            <p className={`text-2xl font-bold ${isLowStock ? 'text-red-600' : 'text-emerald-700'}`}>{stockQty}</p>
            {isLowStock && <p className="text-xs text-red-400 mt-0.5">Low stock</p>}
          </div>
          <div className="bg-amber-50 rounded-xl p-3">
            <p className="text-xs font-medium text-amber-400 mb-1 flex items-center gap-1"><Package size={11} /> Reserved</p>
            <p className="text-2xl font-bold text-amber-700">{stockReserved}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs font-medium text-gray-400 mb-1 flex items-center gap-1"><Package size={11} /> Available</p>
            <p className="text-2xl font-bold text-gray-700">{stockQty - stockReserved}</p>
          </div>
        </div>
      )}

      {/* Settings */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        {([
          !product.is_service && { label: 'Track Stock',      isBool: true,  value: product.track_stock !== false },
          !product.is_service && { label: 'Reorder Level',    isBool: false, value: product.reorder_level != null ? `${product.reorder_level} units` : '—' },
          { label: 'Published', isBool: true,  value: product.is_published ?? false },
          { label: 'Active',    isBool: true,  value: product.is_active },
        ] as (false | { label: string; isBool: boolean; value: boolean | string })[])
          .filter(Boolean)
          .map(row => row && (
            <div key={row.label} className="bg-gray-50 rounded-lg p-2.5">
              <p className="text-xs text-gray-400 mb-1">{row.label}</p>
              {row.isBool ? (
                <div className={`flex items-center gap-1 text-sm font-medium ${row.value ? 'text-green-600' : 'text-gray-400'}`}>
                  {row.value ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                  {row.value ? 'Yes' : 'No'}
                </div>
              ) : (
                <p className="text-sm font-medium text-gray-700">{String(row.value)}</p>
              )}
            </div>
          ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={onEdit}
          className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition">
          <Pencil size={13} /> Edit Product
        </button>
        <button onClick={onClose}
          className="flex-1 border border-gray-300 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
          Close
        </button>
      </div>
    </Modal>
  )
}

// ── Product Form Modal ────────────────────────────────────────────────────────

function ProductModal({
  open, onClose, onSaved, initial, categories,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  initial?: Product | null
  categories: Category[]
}) {
  const [form, setForm] = useState<ProductFormData>(
    initial
      ? {
          name: initial.name, sku: initial.sku, barcode: initial.barcode || '',
          description: initial.description, unit_price: initial.unit_price,
          cost_price: initial.cost_price || '', category: initial.category ?? '',
          is_service: initial.is_service, is_active: initial.is_active,
          track_stock: initial.track_stock !== false,
          reorder_level: initial.reorder_level ?? '', is_published: initial.is_published ?? false,
        }
      : DEFAULT_FORM
  )

  const mutation = useMutation({
    mutationFn: () =>
      initial
        ? apiClient.patch(INVENTORY.PRODUCT_DETAIL(initial.id), form)
        : apiClient.post(INVENTORY.PRODUCTS, form),
    onSuccess: () => { toast.success(initial ? 'Product updated' : 'Product created'); onSaved() },
    onError: () => toast.error('Failed to save product'),
  })

  const set = (k: keyof ProductFormData, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit Product' : 'Add Product'} width="max-w-lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Product name"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">SKU</label>
            <input value={form.sku} onChange={e => set('sku', e.target.value)} placeholder="SKU-001"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Barcode / EAN</label>
            <input value={form.barcode} onChange={e => set('barcode', e.target.value)} placeholder="Barcode"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
            <select value={form.category} onChange={e => set('category', e.target.value ? Number(e.target.value) : '')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">— Uncategorized —</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Selling Price (Rs.) *</label>
            <input type="number" min="0" step="0.01" value={form.unit_price}
              onChange={e => set('unit_price', e.target.value)} placeholder="0.00"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Cost Price (Rs.)</label>
            <input type="number" min="0" step="0.01" value={form.cost_price}
              onChange={e => set('cost_price', e.target.value)} placeholder="0.00"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>

        {!form.is_service && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Reorder Level (units)</label>
            <input type="number" min="0" value={form.reorder_level}
              onChange={e => set('reorder_level', e.target.value ? Number(e.target.value) : '')}
              placeholder="Minimum stock before alert"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
          <textarea value={form.description} onChange={e => set('description', e.target.value)}
            rows={2} placeholder="Optional description"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={form.is_service} onChange={e => set('is_service', e.target.checked)} className="rounded text-indigo-600" />
            Service (no stock tracking)
          </label>
          {!form.is_service && (
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={form.track_stock} onChange={e => set('track_stock', e.target.checked)} className="rounded text-indigo-600" />
              Track stock
            </label>
          )}
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={form.is_published} onChange={e => set('is_published', e.target.checked)} className="rounded text-indigo-600" />
            Publish on website
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} className="rounded text-indigo-600" />
            Active
          </label>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => mutation.mutate()}
            disabled={!form.name || !form.unit_price || mutation.isPending}
            className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
          >
            {mutation.isPending && <Loader2 size={13} className="animate-spin" />}
            {initial ? 'Save Changes' : 'Add Product'}
          </button>
          <button onClick={onClose} className="flex-1 border border-gray-300 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd]               = useState(false)
  const [editProduct, setEditProduct]       = useState<Product | null>(null)
  const [detailProduct, setDetailProduct]   = useState<Product | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<number | ''>('')
  const [search, setSearch]                 = useState('')

  const { data: products = [], isLoading: loadingProducts } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => apiClient.get(INVENTORY.PRODUCTS).then(r =>
      Array.isArray(r.data) ? r.data : r.data.results ?? []
    ),
  })

  const { data: stockLevels = [] } = useQuery<StockLevel[]>({
    queryKey: ['stock-levels'],
    queryFn: () => apiClient.get(INVENTORY.STOCK_LEVELS).then(r =>
      Array.isArray(r.data) ? r.data : r.data.results ?? []
    ),
  })

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['inventory-categories'],
    queryFn: () => apiClient.get(INVENTORY.CATEGORIES).then(r =>
      Array.isArray(r.data) ? r.data : r.data.results ?? []
    ),
  })

  const stockMap = Object.fromEntries(
    stockLevels.map(s => [s.product, { qty: s.quantity_on_hand, reserved: s.quantity_reserved ?? 0 }])
  )

  const filtered = products.filter(p => {
    const matchesCat    = categoryFilter === '' || p.category === categoryFilter
    const matchesSearch = !search
      || p.name.toLowerCase().includes(search.toLowerCase())
      || (p.sku || '').toLowerCase().includes(search.toLowerCase())
      || (p.barcode || '').toLowerCase().includes(search.toLowerCase())
    return matchesCat && matchesSearch
  })

  const handleSaved = () => {
    setShowAdd(false)
    setEditProduct(null)
    setDetailProduct(null)
    qc.invalidateQueries({ queryKey: ['products'] })
    qc.invalidateQueries({ queryKey: ['inventory-products'] })
    qc.invalidateQueries({ queryKey: ['stock-levels'] })
  }

  const categoryMap = Object.fromEntries(categories.map(c => [c.id, c.name]))

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Package size={22} className="text-indigo-400" /> Inventory
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">Products and stock levels</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
        >
          <Plus size={15} /> Add Product
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Total Products',     value: products.filter(p => !p.is_service).length, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Services',           value: products.filter(p => p.is_service).length,  color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Active',             value: products.filter(p => p.is_active).length,   color: 'text-green-600',  bg: 'bg-green-50' },
          { label: 'Low / Out of Stock',
            value: products.filter(p => !p.is_service && (stockMap[p.id]?.qty ?? 0) <= (p.reorder_level ?? 0)).length,
            color: 'text-red-600', bg: 'bg-red-50' },
        ].map(c => (
          <div key={c.label} className={`${c.bg} rounded-xl p-3`}>
            <p className="text-xs text-gray-500 mb-0.5">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, SKU, barcode…"
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64"
        />
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value ? Number(e.target.value) : '')}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <p className="text-xs text-gray-400 ml-auto">Click any row to view details</p>
      </div>

      {/* Product table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loadingProducts ? (
          <div className="p-8 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <PackageX size={32} className="text-gray-300 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">No products found</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3 text-left">Name</th>
                <th className="px-5 py-3 text-left">SKU / Barcode</th>
                <th className="px-5 py-3 text-left">Category</th>
                <th className="px-5 py-3 text-right">Sell Price</th>
                <th className="px-5 py-3 text-right">Cost</th>
                <th className="px-5 py-3 text-left">Type</th>
                <th className="px-5 py-3 text-center">On Hand</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-center">Web</th>
                <th className="px-5 py-3 text-right">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(p => {
                const stock  = stockMap[p.id] ?? { qty: 0, reserved: 0 }
                const isLow  = !p.is_service && stock.qty <= (p.reorder_level ?? 0)
                return (
                  <tr
                    key={p.id}
                    onClick={() => setDetailProduct(p)}
                    className="hover:bg-indigo-50 transition cursor-pointer"
                  >
                    <td className="px-5 py-3 font-medium text-gray-800">{p.name}</td>
                    <td className="px-5 py-3 text-gray-400 text-xs font-mono">
                      {p.sku || '—'}
                      {p.barcode && <span className="block text-gray-300 text-xs">{p.barcode}</span>}
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs">
                      {p.category ? categoryMap[p.category] || '—' : '—'}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-700 font-medium">
                      Rs. {parseFloat(p.unit_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-400 text-xs">
                      {p.cost_price && parseFloat(p.cost_price) > 0
                        ? `Rs. ${parseFloat(p.cost_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                        : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${p.is_service ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {p.is_service ? 'Service' : 'Product'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      {p.is_service ? (
                        <span className="text-gray-300 text-xs">N/A</span>
                      ) : (
                        <span className={`font-semibold text-sm ${isLow ? 'text-red-600' : 'text-gray-700'}`}>
                          {stock.qty}
                          {isLow && <span className="text-red-400 text-xs"> ↓</span>}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                        {p.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      {p.is_published
                        ? <Globe size={13} className="text-sky-500 mx-auto" />
                        : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={e => { e.stopPropagation(); setEditProduct(p) }}
                        className="text-indigo-400 hover:text-indigo-700 transition p-1"
                        title="Edit"
                      >
                        <Pencil size={13} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Product Detail */}
      {detailProduct && (
        <ProductDetailModal
          product={detailProduct}
          stockQty={stockMap[detailProduct.id]?.qty ?? 0}
          stockReserved={stockMap[detailProduct.id]?.reserved ?? 0}
          categoryName={detailProduct.category ? categoryMap[detailProduct.category] || '' : ''}
          onClose={() => setDetailProduct(null)}
          onEdit={() => { setEditProduct(detailProduct); setDetailProduct(null) }}
        />
      )}

      {/* Add Product */}
      {showAdd && (
        <ProductModal open onClose={() => setShowAdd(false)} onSaved={handleSaved} categories={categories} />
      )}

      {/* Edit Product */}
      {editProduct && (
        <ProductModal open onClose={() => setEditProduct(null)} onSaved={handleSaved} initial={editProduct} categories={categories} />
      )}
    </div>
  )
}
