import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../api/client'
import { INVENTORY } from '../../api/endpoints'
import Modal from '../../components/Modal'
import { useConfirm } from '../../components/ConfirmDialog'
import toast from 'react-hot-toast'
import {
  Plus, Pencil, Loader2, PackageX, Package, Tag, BarChart2,
  DollarSign, Info, CheckCircle2, XCircle, Globe, ArrowDownCircle,
  ArrowUpCircle, RefreshCw, AlertTriangle, Layers, Clock, Trash2,
  TrendingDown, Truck, ShoppingCart, Send, Ban, Download,
  Building2, ReceiptText, Scale, RotateCcw, FileBarChart2, Upload,
  FileDown, TrendingUp, Archive, ClipboardList, ShieldCheck, ShieldOff, ShieldAlert,
} from 'lucide-react'
import { usePermissions } from '../../hooks/usePermissions'
import DateDisplay from '../../components/DateDisplay'
import NepaliDatePicker from '../../components/NepaliDatePicker'
import { useFyStore } from '../../store/fyStore'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Category {
  id: number
  name: string
  slug?: string
  description?: string
  parent?: number | null
}

interface Product {
  id: number
  category: number | null
  name: string
  sku: string
  barcode?: string
  brand?: string
  description: string
  unit_price: string
  cost_price?: string
  weight?: string
  is_service: boolean
  is_bundle: boolean
  is_active: boolean
  track_stock?: boolean
  reorder_level?: number
  is_published?: boolean
  stock_on_hand?: number
  has_warranty?: boolean
  warranty_months?: number | null
  warranty_description?: string
}

interface SerialNumber {
  id: number
  product: number
  product_name: string
  product_sku: string
  serial_number: string
  status: 'available' | 'used' | 'damaged' | 'returned'
  reference_type: string
  reference_id: number | null
  notes: string
  used_at: string | null
  warranty_expires: string | null
  created_at: string
  updated_at: string
}

interface StockLevel {
  id: number
  product: number
  product_name: string
  quantity_on_hand: number
  quantity_reserved?: number
}

interface StockMovement {
  id: number
  product: number
  product_name: string
  movement_type: 'in' | 'out' | 'adjustment' | 'return'
  quantity: number
  reference_type?: string
  reference_id?: string
  notes?: string
  created_by_name?: string
  created_at: string
}

interface Supplier {
  id: number
  name: string
  contact_person?: string
  email?: string
  phone?: string
  address?: string
  city?: string
  country?: string
  website?: string
  payment_terms?: string
  notes?: string
  is_active: boolean
  po_count?: number
}

interface POItem {
  id: number
  product: number
  product_name: string
  product_sku: string
  quantity_ordered: number
  quantity_received: number
  unit_cost: string
  line_total: string
  pending_quantity: number
}

interface PurchaseOrder {
  id: number
  po_number: string
  supplier: number
  supplier_name: string
  status: 'draft' | 'sent' | 'partial' | 'received' | 'cancelled'
  expected_delivery?: string
  notes?: string
  items: POItem[]
  total_amount: string
  total_ordered: number
  total_received: number
  received_by_name?: string
  received_at?: string
  created_by_name?: string
  created_at: string
}

interface SupplierFormData {
  name: string
  contact_person: string
  email: string
  phone: string
  address: string
  city: string
  country: string
  website: string
  payment_terms: string
  notes: string
  is_active: boolean
}

const DEFAULT_SUPPLIER_FORM: SupplierFormData = {
  name: '', contact_person: '', email: '', phone: '', address: '',
  city: '', country: 'Nepal', website: '', payment_terms: '', notes: '', is_active: true,
}

// ── New Types: UoM, Variants, Returns ─────────────────────────────────────────

interface UnitOfMeasure {
  id: number
  name: string
  abbreviation: string
  unit_type: 'unit' | 'weight' | 'volume' | 'length'
  product_count?: number
}

interface ProductVariant {
  id: number
  product: number
  sku: string
  barcode?: string
  attributes: Record<string, string>
  price_adjustment: string
  cost_price?: string
  reorder_level: number
  is_active: boolean
  stock_on_hand: number
  effective_price: string
}

interface ReturnOrderItem {
  id: number
  product: number
  product_name: string
  product_sku: string
  quantity: number
  unit_cost: string
  line_total: string
}

interface ReturnOrder {
  id: number
  return_number: string
  supplier: number
  supplier_name: string
  purchase_order?: number | null
  po_number?: string | null
  status: 'draft' | 'sent' | 'accepted' | 'cancelled'
  reason: 'defective' | 'wrong_item' | 'overstock' | 'expired' | 'other'
  notes?: string
  sent_at?: string
  items: ReturnOrderItem[]
  total_items: number
  total_value: string
  created_by_name?: string
  created_at: string
}


interface POLineItem { product: number | ''; quantity_ordered: number | ''; unit_cost: string }

interface CategoryFormData {
  name: string
  slug: string
  description: string
  parent: number | ''
}

interface ProductFormData {
  name: string
  sku: string
  barcode: string
  brand: string
  description: string
  unit_price: string
  cost_price: string
  weight: string
  category: number | ''
  is_service: boolean
  is_active: boolean
  track_stock: boolean
  has_warranty: boolean
  warranty_months: number | ''
  warranty_description: string
  reorder_level: number | ''
  is_published: boolean
}

const DEFAULT_FORM: ProductFormData = {
  name: '', sku: '', barcode: '', brand: '', description: '', unit_price: '', cost_price: '',
  weight: '', category: '', is_service: false, is_active: true, track_stock: true, has_warranty: false,
  warranty_months: '', warranty_description: '', reorder_level: '', is_published: false,
}

const DEFAULT_CATEGORY_FORM: CategoryFormData = { name: '', slug: '', description: '', parent: '' }

// ── helpers ───────────────────────────────────────────────────────────────────

const MOVEMENT_META: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  in:         { label: 'Stock In',    icon: <ArrowDownCircle size={13} />, color: 'text-green-700',  bg: 'bg-green-100'  },
  out:        { label: 'Stock Out',   icon: <ArrowUpCircle   size={13} />, color: 'text-red-700',    bg: 'bg-red-100'    },
  adjustment: { label: 'Adjustment',  icon: <RefreshCw       size={13} />, color: 'text-amber-700',  bg: 'bg-amber-100'  },
  return:     { label: 'Return',      icon: <RefreshCw       size={13} />, color: 'text-blue-700',   bg: 'bg-blue-100'   },
}

// ── Product Detail Modal ──────────────────────────────────────────────────────

function ProductDetailModal({
  product, stockQty, stockReserved, categoryName, onClose, onEdit, onAdjust,
}: {
  product: Product
  stockQty: number
  stockReserved: number
  categoryName: string
  onClose: () => void
  onEdit: () => void
  onAdjust?: () => void
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
            {product.brand && <span>Brand: <span className="text-gray-600">{product.brand}</span></span>}
            {product.weight && <span>Weight: <span className="text-gray-600">{product.weight} kg</span></span>}
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
        {onAdjust && !product.is_service && (
          <button onClick={onAdjust}
            className="flex items-center justify-center gap-1.5 px-4 border border-indigo-300 text-indigo-600 py-2 rounded-lg text-sm font-medium hover:bg-indigo-50 transition">
            <RefreshCw size={13} /> Adjust Stock
          </button>
        )}
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
          brand: initial.brand || '', description: initial.description, unit_price: initial.unit_price,
          cost_price: initial.cost_price || '', weight: initial.weight || '',
          category: initial.category ?? '',
          is_service: initial.is_service, is_active: initial.is_active,
          track_stock: initial.track_stock !== false,
          has_warranty: (initial as any).has_warranty ?? false,
          warranty_months: (initial as any).warranty_months ?? '',
          warranty_description: (initial as any).warranty_description ?? '',
          reorder_level: initial.reorder_level ?? '', is_published: initial.is_published ?? false,
        }
      : DEFAULT_FORM
  )
  const [openingStock, setOpeningStock] = useState<number | ''>('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [newSerial, setNewSerial] = useState('')
  const [newSerialExpiry, setNewSerialExpiry] = useState('')
  const qcModal = useQueryClient()

  // Fetch existing serial numbers when editing a warranty product
  const { data: modalSerials = [], isLoading: serialsLoading } = useQuery<SerialNumber[]>({
    queryKey: ['modal-serials', initial?.id],
    queryFn: () =>
      apiClient
        .get(INVENTORY.SERIAL_NUMBERS, { params: { product: initial!.id } })
        .then(r => Array.isArray(r.data) ? r.data : r.data.data ?? r.data.results ?? []),
    enabled: !!(initial?.id && (initial as any).has_warranty),
    staleTime: 30_000,
  })

  const addSerialMutation = useMutation({
    mutationFn: () =>
      apiClient.post(INVENTORY.SERIAL_NUMBERS, {
        product: initial!.id,
        serial_number: newSerial.trim(),
        warranty_expires: newSerialExpiry || null,
      }),
    onSuccess: () => {
      toast.success('Serial number added')
      setNewSerial('')
      setNewSerialExpiry('')
      qcModal.invalidateQueries({ queryKey: ['modal-serials', initial?.id] })
      qcModal.invalidateQueries({ queryKey: ['serial-numbers'] })
    },
    onError: () => toast.error('Failed to add serial number'),
  })

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        category:      form.category      === '' ? null : form.category,
        reorder_level: form.reorder_level === '' ? 0    : form.reorder_level,
        cost_price:    form.cost_price    === '' ? '0'  : form.cost_price,
        weight:               form.weight               === '' ? null : form.weight,
        warranty_months:      form.warranty_months       === '' ? null : form.warranty_months,
        warranty_description: form.has_warranty ? form.warranty_description : '',
      }
      let productId = initial?.id
      if (initial) {
        await apiClient.patch(INVENTORY.PRODUCT_DETAIL(initial.id), payload)
      } else {
        const res = await apiClient.post(INVENTORY.PRODUCTS, payload)
        productId = res.data?.id
        if (productId && !form.is_service && form.track_stock && openingStock && Number(openingStock) > 0) {
          await apiClient.post(INVENTORY.MOVEMENTS, {
            product: productId,
            movement_type: 'in',
            quantity: Number(openingStock),
            notes: 'Opening stock',
          })
        }
      }
      // Upload image if provided
      if (imageFile && productId) {
        const formData = new FormData()
        formData.append('product', String(productId))
        formData.append('image', imageFile)
        formData.append('is_primary', 'true')
        await apiClient.post('/api/v1/inventory/product-images/', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }
      return { success: true }
    },
    onSuccess: () => { toast.success(initial ? 'Product updated' : 'Product created'); onSaved() },
    onError: () => toast.error('Failed to save product'),
  })

  const set = (k: keyof ProductFormData, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit Product' : 'Add Product'} width="max-w-xl">
      <div className="space-y-3">

        {/* Row 1: Name + SKU */}
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

        {/* Row 2: Brand + Barcode */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Brand</label>
            <input value={form.brand} onChange={e => set('brand', e.target.value)} placeholder="e.g. Samsung"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Barcode / EAN</label>
            <input value={form.barcode} onChange={e => set('barcode', e.target.value)} placeholder="Barcode"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>

        {/* Row 3: Category + Weight */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
            <select value={form.category} onChange={e => set('category', e.target.value ? Number(e.target.value) : '')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">— Uncategorized —</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {!form.is_service && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Weight (kg)</label>
              <input type="number" min="0" step="0.001" value={form.weight}
                onChange={e => set('weight', e.target.value)} placeholder="0.000"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          )}
        </div>

        {/* Row 4: Selling Price + Cost Price */}
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

        {/* Row 5: Reorder Level + Opening Stock (physical only, new product only) */}
        {!form.is_service && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Reorder Level (units)</label>
              <input type="number" min="0" value={form.reorder_level}
                onChange={e => set('reorder_level', e.target.value ? Number(e.target.value) : '')}
                placeholder="Alert when stock falls below this"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            {!initial && form.track_stock && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Opening Stock (units)
                  <span className="ml-1 text-gray-400 font-normal">— sets On Hand</span>
                </label>
                <input type="number" min="0" value={openingStock}
                  onChange={e => setOpeningStock(e.target.value ? Number(e.target.value) : '')}
                  placeholder="0"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            )}
          </div>
        )}

        {/* Row 6: Description */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
          <textarea value={form.description} onChange={e => set('description', e.target.value)}
            rows={2} placeholder="Optional description"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>

        {/* Row 7: Image Upload */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Product Image</label>
          <input
            type="file"
            accept="image/*"
            onChange={e => setImageFile(e.target.files?.[0] || null)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
          />
          {imageFile && (
            <p className="mt-1 text-xs text-gray-500">Selected: {imageFile.name}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={form.is_service} onChange={e => set('is_service', e.target.checked)} className="rounded text-indigo-600" />
            Service (no stock tracking)
          </label>
          {!form.is_service && (
            <>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" checked={form.track_stock} onChange={e => set('track_stock', e.target.checked)} className="rounded text-indigo-600" />
                Track stock
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" checked={form.has_warranty} onChange={e => set('has_warranty', e.target.checked)} className="rounded text-indigo-600" />
                Has Warranty (requires serial number)
              </label>
            </>
          )}
          {/* Warranty detail fields — only when has_warranty is true */}
          {form.has_warranty && !form.is_service && (
            <div className="border border-indigo-100 bg-indigo-50 rounded-lg p-3 space-y-3">
              <p className="text-xs font-semibold text-indigo-700 flex items-center gap-1.5">
                <ShieldCheck size={13} /> Warranty Details
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Warranty Period (months)</label>
                  <input
                    type="number" min="1" max="999"
                    value={form.warranty_months}
                    onChange={e => set('warranty_months', e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                    placeholder="e.g. 12"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-xs text-gray-400 mt-0.5">Used to auto-calculate warranty expiry when sold</p>
                </div>
                <div className="flex flex-col justify-center text-sm text-indigo-600 font-medium">
                  {form.warranty_months !== '' && Number(form.warranty_months) > 0
                    ? `= ${Math.floor(Number(form.warranty_months) / 12) > 0 ? `${Math.floor(Number(form.warranty_months) / 12)}y ` : ''}${Number(form.warranty_months) % 12 > 0 ? `${Number(form.warranty_months) % 12}m` : ''}`
                    : <span className="text-gray-400 text-xs">Enter months above</span>
                  }
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Warranty Terms / Coverage</label>
                <textarea
                  value={form.warranty_description}
                  onChange={e => set('warranty_description', e.target.value)}
                  placeholder="e.g. Covers manufacturing defects. Does not cover physical damage or water damage."
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              {/* Serial Numbers — edit mode only */}
              {initial?.id && (
                <div className="border-t border-indigo-200 pt-3">
                  <p className="text-xs font-semibold text-indigo-700 mb-2">Serial Numbers ({modalSerials.length})</p>
                  {serialsLoading ? (
                    <div className="flex items-center gap-1.5 text-xs text-gray-400"><Loader2 size={12} className="animate-spin" /> Loading…</div>
                  ) : modalSerials.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No serial numbers yet.</p>
                  ) : (
                    <div className="max-h-32 overflow-y-auto rounded border border-indigo-100 divide-y divide-indigo-100 mb-2">
                      {modalSerials.map(s => (
                        <div key={s.id} className="flex items-center justify-between px-2 py-1.5 text-xs">
                          <span className="font-mono text-gray-800">{s.serial_number}</span>
                          <div className="flex items-center gap-2 text-gray-400">
                            {s.warranty_expires && <span>{new Date(s.warranty_expires).toLocaleDateString()}</span>}
                            <span className={`px-1.5 py-0.5 rounded-full font-medium ${
                              s.status === 'available'  ? 'bg-blue-100 text-blue-700' :
                              s.status === 'used'       ? 'bg-purple-100 text-purple-700' :
                              s.status === 'damaged'    ? 'bg-red-100 text-red-700' :
                                                          'bg-gray-100 text-gray-600'
                            }`}>{s.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Add new serial number inline */}
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1">New Serial / IMEI</label>
                      <input
                        value={newSerial}
                        onChange={e => setNewSerial(e.target.value)}
                        placeholder="e.g. SN-2026001"
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="w-32">
                      <label className="block text-xs text-gray-500 mb-1">Expiry Date</label>
                      <input
                        type="date"
                        value={newSerialExpiry}
                        onChange={e => setNewSerialExpiry(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <button
                      onClick={() => addSerialMutation.mutate()}
                      disabled={!newSerial.trim() || addSerialMutation.isPending}
                      className="flex items-center gap-1 px-2 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {addSerialMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                      Add
                    </button>
                  </div>
                  {form.warranty_months && Number(form.warranty_months) > 0 && (
                    <button
                      onClick={() => {
                        const d = new Date()
                        d.setMonth(d.getMonth() + Number(form.warranty_months))
                        setNewSerialExpiry(d.toISOString().split('T')[0])
                      }}
                      className="text-xs text-indigo-500 hover:underline mt-1"
                    >
                      Auto-fill expiry from warranty period ({form.warranty_months}m)
                    </button>
                  )}
                </div>
              )}
            </div>
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

// ── Stock Adjustment Modal ────────────────────────────────────────────────────

function StockAdjustModal({
  open, onClose, onSaved, products, preProductId,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  products: Product[]
  preProductId?: number
}) {
  const [productId, setProductId] = useState<number | ''>(preProductId ?? '')
  const [type, setType] = useState<'in' | 'adjustment' | 'return'>('in')
  const [quantity, setQuantity] = useState('')
  const [notes, setNotes] = useState('')

  const mutation = useMutation({
    mutationFn: () => apiClient.post(INVENTORY.MOVEMENTS, {
      product: productId,
      movement_type: type,
      quantity: Number(quantity),
      notes,
    }),
    onSuccess: () => { toast.success('Stock updated'); setQuantity(''); setNotes(''); onSaved() },
    onError: () => toast.error('Failed to record movement'),
  })

  const physicals = products.filter(p => !p.is_service)

  return (
    <Modal open={open} onClose={onClose} title="Adjust Stock" width="max-w-md">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Product *</label>
          <select value={productId} onChange={e => setProductId(e.target.value ? Number(e.target.value) : '')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">Select product…</option>
            {physicals.map(p => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Movement Type *</label>
          <div className="grid grid-cols-3 gap-2">
            {([
              { value: 'in',         label: 'Stock In',   icon: <ArrowDownCircle size={14} />, active: 'border-green-400 bg-green-50 text-green-700' },
              { value: 'adjustment', label: 'Adjustment', icon: <RefreshCw       size={14} />, active: 'border-amber-400 bg-amber-50 text-amber-700' },
              { value: 'return',     label: 'Return',     icon: <RefreshCw       size={14} />, active: 'border-blue-400 bg-blue-50 text-blue-700'   },
            ] as const).map(opt => (
              <button key={opt.value} onClick={() => setType(opt.value)}
                className={`flex flex-col items-center gap-1 py-2.5 rounded-lg border-2 text-xs font-medium transition ${type === opt.value ? opt.active : 'border-gray-200 text-gray-400 hover:border-gray-300'}`}>
                {opt.icon}{opt.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Quantity *</label>
          <input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="Enter units"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Notes / Reference</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            placeholder="e.g. Purchase order #123, damaged goods, supplier return"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div className="flex gap-3">
          <button onClick={() => mutation.mutate()}
            disabled={!productId || !quantity || Number(quantity) < 1 || mutation.isPending}
            className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60">
            {mutation.isPending && <Loader2 size={13} className="animate-spin" />}
            Record Movement
          </button>
          <button onClick={onClose} className="flex-1 border border-gray-300 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Category Modal ────────────────────────────────────────────────────────────

function CategoryModal({
  open, onClose, onSaved, initial, categories,
}: {
  open: boolean; onClose: () => void; onSaved: () => void
  initial?: Category | null; categories: Category[]
}) {
  const [form, setForm] = useState<CategoryFormData>(
    initial
      ? { name: initial.name, slug: initial.slug || '', description: initial.description || '', parent: initial.parent ?? '' }
      : DEFAULT_CATEGORY_FORM
  )
  const mutation = useMutation({
    mutationFn: () => {
      const payload = { ...form, parent: form.parent === '' ? null : form.parent }
      return initial
        ? apiClient.patch(INVENTORY.CATEGORY_DETAIL(initial.id), payload)
        : apiClient.post(INVENTORY.CATEGORIES, payload)
    },
    onSuccess: () => { toast.success(initial ? 'Category updated' : 'Category created'); onSaved() },
    onError: () => toast.error('Failed to save category'),
  })
  const set = (k: keyof CategoryFormData, v: string | number | '') => setForm(f => ({ ...f, [k]: v }))

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit Category' : 'Add Category'} width="max-w-md">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
          <input value={form.name}
            onChange={e => { set('name', e.target.value); if (!initial) set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')) }}
            placeholder="Category name"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Slug</label>
          <input value={form.slug} onChange={e => set('slug', e.target.value)} placeholder="auto-generated"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Parent Category</label>
          <select value={form.parent} onChange={e => set('parent', e.target.value ? Number(e.target.value) : '')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">— None (top-level) —</option>
            {categories.filter(c => !initial || c.id !== initial.id).map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
          <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div className="flex gap-3">
          <button onClick={() => mutation.mutate()} disabled={!form.name || mutation.isPending}
            className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60">
            {mutation.isPending && <Loader2 size={13} className="animate-spin" />}
            {initial ? 'Save Changes' : 'Add Category'}
          </button>
          <button onClick={onClose} className="flex-1 border border-gray-300 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
        </div>
      </div>
    </Modal>
  )
}

// ── Products Tab ──────────────────────────────────────────────────────────────

function ProductsTab({
  products, stockLevels, categories, loadingProducts, canManage,
}: {
  products: Product[]; stockLevels: StockLevel[]; categories: Category[]
  loadingProducts: boolean; canManage: boolean
}) {
  const qc = useQueryClient()
  const [showAdd, setShowAdd]           = useState(false)
  const [editProduct, setEditProduct]   = useState<Product | null>(null)
  const [detailProduct, setDetail]      = useState<Product | null>(null)
  const [adjustProduct, setAdjust]      = useState<Product | null>(null)
  const [categoryFilter, setCatFilter]  = useState<number | ''>('')
  const [search, setSearch]             = useState('')
  const [importResult, setImportResult] = useState<{ created: number; updated: number; errors: number; error_rows: {row: number; error: string}[] } | null>(null)

  const stockMap = Object.fromEntries(stockLevels.map(s => [s.product, { qty: s.quantity_on_hand, reserved: s.quantity_reserved ?? 0 }]))
  const categoryMap = Object.fromEntries(categories.map(c => [c.id, c.name]))

  const filtered = products.filter(p => {
    const matchesCat    = categoryFilter === '' || p.category === categoryFilter
    const matchesSearch = !search
      || p.name.toLowerCase().includes(search.toLowerCase())
      || (p.sku || '').toLowerCase().includes(search.toLowerCase())
      || (p.barcode || '').toLowerCase().includes(search.toLowerCase())
    return matchesCat && matchesSearch
  })

  const refresh = () => {
    setShowAdd(false); setEditProduct(null); setDetail(null); setAdjust(null)
    qc.invalidateQueries({ queryKey: ['products'] })
    qc.invalidateQueries({ queryKey: ['stock-levels'] })
    qc.invalidateQueries({ queryKey: ['low-stock'] })
    qc.invalidateQueries({ queryKey: ['movements'] })
  }

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await apiClient.post(INVENTORY.PRODUCT_IMPORT_CSV, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setImportResult(res.data)
      qc.invalidateQueries({ queryKey: ['products'] })
      toast.success(`Import done: ${res.data.created} created, ${res.data.updated} updated, ${res.data.errors} errors`)
    } catch {
      toast.error('CSV import failed')
    }
  }

  return (
    <div>
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Physical Products', value: products.filter(p => !p.is_service).length, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Services',          value: products.filter(p => p.is_service).length,  color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Active',            value: products.filter(p => p.is_active).length,   color: 'text-green-600',  bg: 'bg-green-50'  },
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
      {/* Filters + actions */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, SKU, barcode…"
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-60" />
        <select value={categoryFilter} onChange={e => setCatFilter(e.target.value ? Number(e.target.value) : '')}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {canManage && (
          <div className="ml-auto flex gap-2">
            <a
              href="/samples/products_import_sample.csv"
              download="products_import_sample.csv"
              className="flex items-center gap-1.5 px-4 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
            >
              <Download size={14} /> Sample CSV
            </a>
            <label className="flex items-center gap-1.5 px-4 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition cursor-pointer">
              <Upload size={14} /> Import CSV
              <input type="file" accept=".csv" className="hidden" onChange={handleCsvImport} />
            </label>
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition">
              <Plus size={14} /> Add Product
            </button>
            <button onClick={() => setAdjust({} as Product)}
              className="flex items-center gap-1.5 px-4 py-1.5 border border-indigo-300 text-indigo-600 rounded-lg text-sm font-medium hover:bg-indigo-50 transition">
              <RefreshCw size={14} /> Adjust Stock
            </button>
          </div>
        )}
      </div>

      {/* Import result banner */}
      {importResult && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between">
          <span className="text-sm text-blue-700">
            Import complete: <strong>{importResult.created}</strong> created · <strong>{importResult.updated}</strong> updated
            {importResult.errors > 0 && <> · <strong className="text-red-600">{importResult.errors} errors</strong></>}
          </span>
          <button onClick={() => setImportResult(null)} className="text-blue-400 hover:text-blue-600"><XCircle size={16} /></button>
        </div>
      )}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loadingProducts ? (
          <div className="p-8 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center"><PackageX size={32} className="text-gray-300 mx-auto mb-2" /><p className="text-gray-400 text-sm">No products found</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3 text-left">Name</th>
                <th className="px-5 py-3 text-left">SKU</th>
                <th className="px-5 py-3 text-left">Category</th>
                <th className="px-5 py-3 text-right">Price</th>
                <th className="px-5 py-3 text-right">Cost</th>
                <th className="px-5 py-3 text-left">Type</th>
                <th className="px-5 py-3 text-center">On Hand</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-center">Web</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(p => {
                const stock = stockMap[p.id] ?? { qty: 0, reserved: 0 }
                const isLow = !p.is_service && stock.qty <= (p.reorder_level ?? 0)
                return (
                  <tr key={p.id} onClick={() => setDetail(p)} className="hover:bg-indigo-50 transition cursor-pointer">
                    <td className="px-5 py-3 font-medium text-gray-800">{p.name}</td>
                    <td className="px-5 py-3 text-gray-400 text-xs font-mono">{p.sku || '—'}</td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{p.category ? categoryMap[p.category] || '—' : '—'}</td>
                    <td className="px-5 py-3 text-right text-gray-700 font-medium">Rs. {parseFloat(p.unit_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="px-5 py-3 text-right text-gray-400 text-xs">
                      {p.cost_price && parseFloat(p.cost_price) > 0 ? `Rs. ${parseFloat(p.cost_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${p.is_service ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {p.is_service ? 'Service' : 'Product'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      {p.is_service ? <span className="text-gray-300 text-xs">N/A</span> : (
                        <span className={`font-semibold text-sm ${isLow ? 'text-red-600' : 'text-gray-700'}`}>
                          {stock.qty}{isLow && <span className="text-red-400 text-xs"> ↓</span>}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                        {p.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      {p.is_published ? <Globe size={13} className="text-sky-500 mx-auto" /> : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canManage && !p.is_service && (
                          <button onClick={e => { e.stopPropagation(); setAdjust(p) }}
                            className="text-amber-400 hover:text-amber-600 transition p-1" title="Adjust stock">
                            <RefreshCw size={13} />
                          </button>
                        )}
                        {canManage && (
                          <button onClick={e => { e.stopPropagation(); setEditProduct(p) }}
                            className="text-indigo-400 hover:text-indigo-700 transition p-1" title="Edit">
                            <Pencil size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      {detailProduct && (
        <ProductDetailModal
          product={detailProduct}
          stockQty={stockMap[detailProduct.id]?.qty ?? 0}
          stockReserved={stockMap[detailProduct.id]?.reserved ?? 0}
          categoryName={detailProduct.category ? categoryMap[detailProduct.category] || '' : ''}
          onClose={() => setDetail(null)}
          onEdit={() => { setEditProduct(detailProduct); setDetail(null) }}
          onAdjust={() => { setAdjust(detailProduct); setDetail(null) }}
        />
      )}
      {showAdd && <ProductModal open onClose={() => setShowAdd(false)} onSaved={refresh} categories={categories} />}
      {editProduct && <ProductModal open onClose={() => setEditProduct(null)} onSaved={refresh} initial={editProduct} categories={categories} />}
      {adjustProduct !== null && (
        <StockAdjustModal open onClose={() => setAdjust(null)} onSaved={refresh} products={products} preProductId={adjustProduct?.id} />
      )}
    </div>
  )
}

// ── Movements Tab ─────────────────────────────────────────────────────────────

function MovementsTab({ products, canManage }: { products: Product[]; canManage: boolean }) {
  const qc = useQueryClient()
  const { fyYear } = useFyStore()
  const [productFilter, setProductFilter] = useState<number | ''>('')
  const [typeFilter, setTypeFilter]       = useState('')
  const [showAdjust, setShowAdjust]       = useState(false)

  const { data: movements = [], isLoading } = useQuery<StockMovement[]>({
    queryKey: ['movements', productFilter, typeFilter, fyYear],
    queryFn: () => {
      const p = new URLSearchParams()
      if (productFilter) p.set('product', String(productFilter))
      if (typeFilter)    p.set('movement_type', typeFilter)
      if (fyYear) p.set('fiscal_year', String(fyYear))
      return apiClient.get(`${INVENTORY.MOVEMENTS}?${p}`).then(r => Array.isArray(r.data) ? r.data : r.data.data ?? r.data.results ?? [])
    },
  })

  const refresh = () => {
    setShowAdjust(false)
    qc.invalidateQueries({ queryKey: ['movements'] })
    qc.invalidateQueries({ queryKey: ['stock-levels'] })
    qc.invalidateQueries({ queryKey: ['products'] })
    qc.invalidateQueries({ queryKey: ['low-stock'] })
  }

  return (
    <div>
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <select value={productFilter} onChange={e => setProductFilter(e.target.value ? Number(e.target.value) : '')}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">All Products</option>
          {products.filter(p => !p.is_service).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">All Types</option>
          <option value="in">Stock In</option>
          <option value="out">Stock Out</option>
          <option value="adjustment">Adjustment</option>
          <option value="return">Return</option>
        </select>
        {canManage && (
          <button onClick={() => setShowAdjust(true)}
            className="ml-auto flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition">
            <Plus size={14} /> Record Movement
          </button>
        )}
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin" /> Loading movements…
          </div>
        ) : movements.length === 0 ? (
          <div className="p-10 text-center">
            <Clock size={32} className="text-gray-300 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">No movements recorded</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3 text-left">Product</th>
                <th className="px-5 py-3 text-left">Type</th>
                <th className="px-5 py-3 text-right">Qty</th>
                <th className="px-5 py-3 text-left">Reference</th>
                <th className="px-5 py-3 text-left">Notes</th>
                <th className="px-5 py-3 text-left">By</th>
                <th className="px-5 py-3 text-left">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {movements.map(m => {
                const meta = MOVEMENT_META[m.movement_type] ?? MOVEMENT_META.in
                return (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-800">{m.product_name}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${meta.bg} ${meta.color}`}>
                        {meta.icon}{meta.label}
                      </span>
                    </td>
                    <td className={`px-5 py-3 text-right font-bold ${m.movement_type === 'out' ? 'text-red-600' : 'text-green-600'}`}>
                      {m.movement_type === 'out' ? '−' : '+'}{m.quantity}
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-xs font-mono">
                      {m.reference_type ? `${m.reference_type}${m.reference_id ? ` #${m.reference_id}` : ''}` : '—'}
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs max-w-48 truncate">{m.notes || '—'}</td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{m.created_by_name || '—'}</td>
                    <td className="px-5 py-3 text-gray-400 text-xs whitespace-nowrap"><DateDisplay adDate={m.created_at} showTime compact /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      {showAdjust && <StockAdjustModal open onClose={() => setShowAdjust(false)} onSaved={refresh} products={products} />}
    </div>
  )
}

// ── Low Stock Tab ─────────────────────────────────────────────────────────────

function LowStockTab({ products, canManage }: { products: Product[]; canManage: boolean }) {
  const qc = useQueryClient()
  const [adjustProduct, setAdjust] = useState<Product | null>(null)
  const [reorderResult, setReorderResult] = useState<{ pos_created: number; purchase_orders: { po_number: string; supplier: string; line_count: number }[]; skipped_no_supplier: { id: number; name: string }[] } | null>(null)

  const { data: lowStock = [], isLoading } = useQuery<Product[]>({
    queryKey: ['low-stock'],
    queryFn: () => apiClient.get(INVENTORY.LOW_STOCK).then(r => Array.isArray(r.data) ? r.data : r.data.data ?? r.data.results ?? []),
  })

  const autoReorderMut = useMutation({
    mutationFn: () => apiClient.post(INVENTORY.REPORT_AUTO_REORDER),
    onSuccess: (res) => {
      const data = res.data
      setReorderResult(data)
      qc.invalidateQueries({ queryKey: ['purchase-orders'] })
      if (data.pos_created === 0) toast.success('No preferred suppliers set for low-stock items.')
      else toast.success(`${data.pos_created} draft Purchase Order${data.pos_created !== 1 ? 's' : ''} created!`)
    },
    onError: () => toast.error('Auto-reorder failed'),
  })

  const refresh = () => {
    setAdjust(null)
    qc.invalidateQueries({ queryKey: ['low-stock'] })
    qc.invalidateQueries({ queryKey: ['stock-levels'] })
    qc.invalidateQueries({ queryKey: ['products'] })
    qc.invalidateQueries({ queryKey: ['movements'] })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-red-600 font-semibold text-sm">
          <AlertTriangle size={16} />
          {isLoading ? '…' : lowStock.length} product{lowStock.length !== 1 ? 's' : ''} at or below reorder level
        </div>
        {canManage && (
          <button
            onClick={() => autoReorderMut.mutate()}
            disabled={autoReorderMut.isPending || lowStock.length === 0}
            className="flex items-center gap-1.5 text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            {autoReorderMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <ShoppingCart size={13} />}
            Auto-Reorder All
          </button>
        )}
      </div>

      {/* Auto-reorder result summary */}
      {reorderResult && reorderResult.pos_created > 0 && (
        <div className="mb-4 p-4 bg-indigo-50 border border-indigo-200 rounded-xl text-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-indigo-800">{reorderResult.pos_created} Purchase Order{reorderResult.pos_created !== 1 ? 's' : ''} created (draft)</span>
            <button onClick={() => setReorderResult(null)} className="text-indigo-400 hover:text-indigo-600 text-xs">Dismiss</button>
          </div>
          <div className="space-y-1">
            {reorderResult.purchase_orders.map(po => (
              <div key={po.po_number} className="text-indigo-700 text-xs">
                <span className="font-mono font-medium">{po.po_number}</span> — {po.supplier} ({po.line_count} line{po.line_count !== 1 ? 's' : ''})
              </div>
            ))}
          </div>
          {reorderResult.skipped_no_supplier.length > 0 && (
            <div className="mt-2 text-orange-600 text-xs">
              {reorderResult.skipped_no_supplier.length} product{reorderResult.skipped_no_supplier.length !== 1 ? 's' : ''} skipped — no preferred supplier set.
            </div>
          )}
        </div>
      )}
      {isLoading ? (
        <div className="p-8 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
          <Loader2 size={16} className="animate-spin" /> Loading…
        </div>
      ) : lowStock.length === 0 ? (
        <div className="bg-green-50 rounded-2xl p-10 text-center border border-green-100">
          <CheckCircle2 size={36} className="text-green-400 mx-auto mb-2" />
          <p className="text-green-700 font-medium">All stock levels are healthy!</p>
          <p className="text-green-400 text-sm mt-1">No products are at or below their reorder level.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-red-50 text-red-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3 text-left">Product</th>
                <th className="px-5 py-3 text-left">SKU</th>
                <th className="px-5 py-3 text-center">On Hand</th>
                <th className="px-5 py-3 text-center">Reorder At</th>
                <th className="px-5 py-3 text-right">Sell Price</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lowStock.map(p => {
                const qty = p.stock_on_hand ?? 0
                return (
                  <tr key={p.id} className="hover:bg-red-50 transition">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <TrendingDown size={14} className="text-red-400 flex-shrink-0" />
                        <span className="font-medium text-gray-800">{p.name}</span>
                        {qty <= 0 && <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">Out of stock</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-xs font-mono">{p.sku || '—'}</td>
                    <td className="px-5 py-3 text-center">
                      <span className={`text-lg font-bold ${qty <= 0 ? 'text-red-600' : 'text-orange-500'}`}>{qty}</span>
                    </td>
                    <td className="px-5 py-3 text-center text-gray-500 font-medium">{p.reorder_level ?? 0}</td>
                    <td className="px-5 py-3 text-right text-gray-700 font-medium">Rs. {parseFloat(p.unit_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="px-5 py-3 text-right">
                      {canManage && (
                        <button onClick={() => setAdjust(p)}
                          className="flex items-center gap-1 text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition ml-auto">
                          <ArrowDownCircle size={12} /> Restock
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {adjustProduct && <StockAdjustModal open onClose={() => setAdjust(null)} onSaved={refresh} products={products} preProductId={adjustProduct.id} />}
    </div>
  )
}

// ── Categories Tab ────────────────────────────────────────────────────────────

function CategoriesTab({ categories, canManage }: { categories: Category[]; canManage: boolean }) {
  const qc = useQueryClient()
  const [showAdd, setShowAdd]       = useState(false)
  const [editCat, setEditCat]       = useState<Category | null>(null)
  const [confirmDel, setConfirmDel] = useState<Category | null>(null)

  const categoryMap = Object.fromEntries(categories.map(c => [c.id, c.name]))

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(INVENTORY.CATEGORY_DETAIL(id)),
    onSuccess: () => { toast.success('Category deleted'); setConfirmDel(null); qc.invalidateQueries({ queryKey: ['inventory-categories'] }) },
    onError: () => toast.error('Failed to delete — category may be in use'),
  })

  const refresh = () => {
    setShowAdd(false); setEditCat(null)
    qc.invalidateQueries({ queryKey: ['inventory-categories'] })
  }

  return (
    <div>
      {canManage && (
        <div className="flex justify-end mb-4">
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition">
            <Plus size={14} /> Add Category
          </button>
        </div>
      )}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {categories.length === 0 ? (
          <div className="p-10 text-center">
            <Layers size={32} className="text-gray-300 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">No categories yet</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3 text-left">Name</th>
                <th className="px-5 py-3 text-left">Slug</th>
                <th className="px-5 py-3 text-left">Parent</th>
                <th className="px-5 py-3 text-left">Description</th>
                <th className="px-5 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {categories.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-800">{c.name}</td>
                  <td className="px-5 py-3 text-gray-400 text-xs font-mono">{c.slug || '—'}</td>
                  <td className="px-5 py-3 text-gray-500 text-xs">{c.parent ? categoryMap[c.parent] || '—' : <span className="text-gray-300">Top-level</span>}</td>
                  <td className="px-5 py-3 text-gray-500 text-xs max-w-60 truncate">{c.description || '—'}</td>
                  <td className="px-5 py-3 text-right">
                    {canManage && (
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setEditCat(c)} className="text-indigo-400 hover:text-indigo-700 p-1" title="Edit"><Pencil size={13} /></button>
                        <button onClick={() => setConfirmDel(c)} className="text-red-400 hover:text-red-700 p-1" title="Delete"><Trash2 size={13} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showAdd && <CategoryModal open onClose={() => setShowAdd(false)} onSaved={refresh} categories={categories} />}
      {editCat && <CategoryModal open onClose={() => setEditCat(null)} onSaved={refresh} initial={editCat} categories={categories} />}
      {confirmDel && (
        <Modal open onClose={() => setConfirmDel(null)} title="Delete Category?" width="max-w-sm">
          <p className="text-sm text-gray-600 mb-5">Delete <strong>{confirmDel.name}</strong>? Products in this category will become uncategorized.</p>
          <div className="flex gap-3">
            <button onClick={() => deleteMutation.mutate(confirmDel.id)} disabled={deleteMutation.isPending}
              className="flex-1 flex items-center justify-center gap-1.5 bg-red-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60">
              {deleteMutation.isPending && <Loader2 size={13} className="animate-spin" />} Delete
            </button>
            <button onClick={() => setConfirmDel(null)} className="flex-1 border border-gray-300 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Suppliers Tab ─────────────────────────────────────────────────────────────

const PO_STATUS_META: Record<string, { label: string; color: string }> = {
  draft:     { label: 'Draft',     color: 'bg-gray-100 text-gray-600'    },
  sent:      { label: 'Sent',      color: 'bg-blue-100 text-blue-700'    },
  partial:   { label: 'Partial',   color: 'bg-amber-100 text-amber-700'  },
  received:  { label: 'Received',  color: 'bg-green-100 text-green-700'  },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-600'      },
}

function SuppliersTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient()
  const [modal, setModal] = useState<null | 'add' | 'edit'>(null)
  const [selected, setSelected] = useState<Supplier | null>(null)
  const [form, setForm] = useState<SupplierFormData>(DEFAULT_SUPPLIER_FORM)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const { data: suppliers = [], isLoading } = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: () => apiClient.get(INVENTORY.SUPPLIERS).then(r => Array.isArray(r.data) ? r.data : r.data.data ?? r.data.results ?? []),
  })

  const createMut = useMutation({
    mutationFn: (d: SupplierFormData) => apiClient.post(INVENTORY.SUPPLIERS, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); setModal(null); toast.success('Supplier added') },
    onError: () => toast.error('Failed to create supplier'),
  })
  const updateMut = useMutation({
    mutationFn: (d: SupplierFormData) => apiClient.patch(INVENTORY.SUPPLIER_DETAIL(selected!.id), d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); setModal(null); toast.success('Supplier updated') },
    onError: () => toast.error('Failed to update supplier'),
  })
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiClient.delete(INVENTORY.SUPPLIER_DETAIL(id)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); setDeleteId(null); toast.success('Supplier deleted') },
    onError: () => toast.error('Cannot delete — supplier may have purchase orders'),
  })

  function openAdd() { setForm(DEFAULT_SUPPLIER_FORM); setModal('add') }
  function openEdit(s: Supplier) { setSelected(s); setForm({ name: s.name, contact_person: s.contact_person ?? '', email: s.email ?? '', phone: s.phone ?? '', address: s.address ?? '', city: s.city ?? '', country: s.country ?? 'Nepal', website: s.website ?? '', payment_terms: s.payment_terms ?? '', notes: s.notes ?? '', is_active: s.is_active }); setModal('edit') }
  function handleSubmit() { modal === 'add' ? createMut.mutate(form) : updateMut.mutate(form) }
  const busy = createMut.isPending || updateMut.isPending

  const inp = 'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400'

  return (
    <div>
      {canManage && (
        <div className="flex justify-end mb-4">
          <button onClick={openAdd} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">
            <Plus size={15} /> Add Supplier
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-indigo-400" size={28} /></div>
      ) : suppliers.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Truck size={36} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">No suppliers yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs tracking-wide">
              <tr>
                {['Name', 'Contact', 'Email', 'Phone', 'City', 'POs', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {suppliers.map(s => (
                <tr key={s.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3 font-medium text-gray-800">{s.name}</td>
                  <td className="px-4 py-3 text-gray-500">{s.contact_person || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{s.email || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{s.phone || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{s.city || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{s.po_count ?? 0}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {s.is_active ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                      {s.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canManage && (
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openEdit(s)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition"><Pencil size={14} /></button>
                        <button onClick={() => setDeleteId(s.id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition"><Trash2 size={14} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Modal */}
      {modal && (
        <Modal open title={modal === 'add' ? 'Add Supplier' : 'Edit Supplier'} onClose={() => setModal(null)}>
          <div className="space-y-3 p-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">Supplier Name *</label>
                <input className={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. TechParts Nepal" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Contact Person</label>
                <input className={inp} value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Phone</label>
                <input className={inp} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Email</label>
                <input className={inp} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Website</label>
                <input className={inp} value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">City</label>
                <input className={inp} value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Country</label>
                <input className={inp} value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">Address</label>
                <input className={inp} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">Payment Terms</label>
                <input className={inp} value={form.payment_terms} onChange={e => setForm(f => ({ ...f, payment_terms: e.target.value }))} placeholder="e.g. Net 30" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">Notes</label>
                <textarea className={inp} rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input type="checkbox" id="sup-active" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="rounded" />
                <label htmlFor="sup-active" className="text-sm text-gray-700">Active</label>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleSubmit} disabled={!form.name || busy} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1">
                {busy && <Loader2 className="animate-spin" size={13} />}
                {modal === 'add' ? 'Add Supplier' : 'Save Changes'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <Modal open title="Delete Supplier" onClose={() => setDeleteId(null)}>
          <div className="p-1 space-y-4">
            <p className="text-sm text-gray-600">This will permanently delete the supplier. This action cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={() => deleteMut.mutate(deleteId)} disabled={deleteMut.isPending} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">Delete</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Purchase Orders Tab ───────────────────────────────────────────────────────

function PurchaseOrdersTab({ products, canManage }: { products: Product[]; canManage: boolean }) {
  const qc = useQueryClient()
  const { fyYear } = useFyStore()
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [receiveModal, setReceiveModal] = useState<PurchaseOrder | null>(null)
  const [viewModal, setViewModal] = useState<PurchaseOrder | null>(null)

  // Create PO form state
  const [poSupplier, setPOSupplier] = useState<number | ''>('')
  const [poDelivery, setPODelivery] = useState('')
  const [poNotes, setPONotes] = useState('')
  const [poLines, setPOLines] = useState<POLineItem[]>([{ product: '', quantity_ordered: '', unit_cost: '' }])

  // Receive form state
  const [receiveLines, setReceiveLines] = useState<{ item_id: number; quantity_received: number }[]>([])
  const [receiveNotes, setReceiveNotes] = useState('')

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: () => apiClient.get(INVENTORY.SUPPLIERS).then(r => Array.isArray(r.data) ? r.data : r.data.data ?? r.data.results ?? []),
  })

  const { data: allPOs = [], isLoading } = useQuery<PurchaseOrder[]>({
    queryKey: ['purchase-orders', fyYear],
    queryFn: () =>
      apiClient.get(INVENTORY.PURCHASE_ORDERS, { params: fyYear ? { fiscal_year: fyYear } : {} }).then(r => Array.isArray(r.data) ? r.data : r.data.data ?? r.data.results ?? []),
  })

  const pos = statusFilter ? allPOs.filter(p => p.status === statusFilter) : allPOs

  const createMut = useMutation({
    mutationFn: (d: object) => apiClient.post(INVENTORY.PURCHASE_ORDERS, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-orders'] }); setShowCreate(false); toast.success('Purchase order created') },
    onError: () => toast.error('Failed to create purchase order'),
  })
  const sendMut = useMutation({
    mutationFn: (id: number) => apiClient.post(INVENTORY.PURCHASE_ORDER_SEND(id)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-orders'] }); toast.success('PO marked as sent') },
    onError: () => toast.error('Failed to send PO'),
  })
  const cancelMut = useMutation({
    mutationFn: (id: number) => apiClient.post(INVENTORY.PURCHASE_ORDER_CANCEL(id)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-orders'] }); toast.success('PO cancelled') },
    onError: () => toast.error('Cannot cancel this PO'),
  })
  const receiveMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => apiClient.post(INVENTORY.PURCHASE_ORDER_RECEIVE(id), data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-orders'] }); qc.invalidateQueries({ queryKey: ['stock-levels'] }); setReceiveModal(null); toast.success('Items received & stock updated') },
    onError: () => toast.error('Failed to receive items'),
  })

  function openReceive(po: PurchaseOrder) {
    setReceiveModal(po)
    setReceiveLines(po.items.filter(i => i.pending_quantity > 0).map(i => ({ item_id: i.id, quantity_received: i.pending_quantity })))
    setReceiveNotes('')
  }

  function submitCreate() {
    const items = poLines.filter(l => l.product !== '' && l.quantity_ordered !== '').map(l => ({
      product: l.product, quantity_ordered: Number(l.quantity_ordered), unit_cost: l.unit_cost || '0',
    }))
    createMut.mutate({ supplier: poSupplier, expected_delivery: poDelivery || null, notes: poNotes, items })
  }

  function submitReceive() {
    if (!receiveModal) return
    receiveMut.mutate({ id: receiveModal.id, data: { lines: receiveLines, notes: receiveNotes } })
  }

  function addLine() { setPOLines(l => [...l, { product: '', quantity_ordered: '', unit_cost: '' }]) }
  function removeLine(i: number) { setPOLines(l => l.filter((_, idx) => idx !== i)) }
  function updateLine(i: number, field: keyof POLineItem, value: string | number) {
    setPOLines(l => l.map((line, idx) => idx === i ? { ...line, [field]: value } : line))
  }

  const inp = 'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400'
  const busy = createMut.isPending

  const poRunningTotal = poLines.reduce((sum, l) => {
    const qty = Number(l.quantity_ordered) || 0
    const cost = parseFloat(l.unit_cost || '0') || 0
    return sum + qty * cost
  }, 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        {/* Status filter pills */}
        <div className="flex gap-1 flex-wrap">
          {(['', 'draft', 'sent', 'partial', 'received', 'cancelled'] as const).map(s => (
            <button key={s || 'all'} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition ${statusFilter === s ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
              {s ? PO_STATUS_META[s].label : 'All'}
            </button>
          ))}
        </div>
        {canManage && (
          <button onClick={() => { setPOSupplier(''); setPODelivery(''); setPONotes(''); setPOLines([{ product: '', quantity_ordered: '', unit_cost: '' }]); setShowCreate(true) }}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">
            <Plus size={15} /> New PO
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-indigo-400" size={28} /></div>
      ) : pos.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <ReceiptText size={36} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">No purchase orders{statusFilter ? ` with status "${statusFilter}"` : ''}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs tracking-wide">
              <tr>
                {['PO #', 'Supplier', 'Status', 'Items', 'Total', 'Expected', 'Created', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {pos.map(po => {
                const meta = PO_STATUS_META[po.status]
                return (
                  <tr key={po.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3">
                      <button onClick={() => setViewModal(po)} className="font-mono font-medium text-indigo-600 hover:underline">{po.po_number}</button>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{po.supplier_name}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${meta.color}`}>{meta.label}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{po.items.length}</td>
                    <td className="px-4 py-3 text-gray-700 font-medium">Rs {parseFloat(po.total_amount).toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-400">{po.expected_delivery ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-400"><DateDisplay adDate={po.created_at} compact /></td>
                    <td className="px-4 py-3">
                      {canManage && (
                        <div className="flex gap-1 justify-end">
                          {po.status === 'draft' && (
                            <button onClick={() => sendMut.mutate(po.id)} title="Mark as Sent" className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition"><Send size={14} /></button>
                          )}
                          {(po.status === 'sent' || po.status === 'partial') && (
                            <button onClick={() => openReceive(po)} title="Receive Items" className="p-1.5 rounded hover:bg-green-50 text-gray-400 hover:text-green-600 transition"><Download size={14} /></button>
                          )}
                          {(po.status === 'draft' || po.status === 'sent') && (
                            <button onClick={() => cancelMut.mutate(po.id)} title="Cancel PO" className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition"><Ban size={14} /></button>
                          )}
                          <a href={`/api/v1${INVENTORY.PO_PDF(po.id)}`} target="_blank" rel="noopener noreferrer" title="Download PDF"
                            className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition inline-flex">
                            <FileDown size={14} />
                          </a>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create PO Modal */}
      {showCreate && (
        <Modal open title="New Purchase Order" onClose={() => setShowCreate(false)}>
          <div className="space-y-4 p-1" style={{ minWidth: '560px' }}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Supplier *</label>
                <select className={inp} value={poSupplier} onChange={e => setPOSupplier(Number(e.target.value) || '')}>
                  <option value="">Select supplier…</option>
                  {suppliers.filter(s => s.is_active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Expected Delivery</label>
                <NepaliDatePicker value={poDelivery} onChange={v => setPODelivery(v)} />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">Notes</label>
                <textarea className={inp} rows={2} value={poNotes} onChange={e => setPONotes(e.target.value)} />
              </div>
            </div>

            {/* Line items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Line Items</p>
                <button onClick={addLine} className="text-xs text-indigo-600 hover:underline flex items-center gap-1"><Plus size={12} /> Add line</button>
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 text-xs text-gray-400 font-medium px-1">
                  <div className="col-span-5">Product</div>
                  <div className="col-span-3">Qty</div>
                  <div className="col-span-3">Unit Cost</div>
                  <div className="col-span-1"></div>
                </div>
                {poLines.map((line, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5">
                      <select className={inp + ' py-1.5'} value={line.product} onChange={e => updateLine(i, 'product', Number(e.target.value) || '')}>
                        <option value="">Select…</option>
                        {products.filter(p => !p.is_service && p.is_active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div className="col-span-3">
                      <input type="number" min={1} className={inp + ' py-1.5'} placeholder="Qty" value={line.quantity_ordered} onChange={e => updateLine(i, 'quantity_ordered', e.target.value)} />
                    </div>
                    <div className="col-span-3">
                      <input type="number" min={0} step="0.01" className={inp + ' py-1.5'} placeholder="0.00" value={line.unit_cost} onChange={e => updateLine(i, 'unit_cost', e.target.value)} />
                    </div>
                    <div className="col-span-1 flex justify-center">
                      {poLines.length > 1 && <button onClick={() => removeLine(i)} className="text-gray-300 hover:text-red-400"><XCircle size={15} /></button>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end mt-2">
                <span className="text-sm font-semibold text-gray-700">Total: Rs {poRunningTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={submitCreate} disabled={!poSupplier || busy} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1">
                {busy && <Loader2 className="animate-spin" size={13} />}
                Create PO
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Receive Items Modal */}
      {receiveModal && (
        <Modal open title={`Receive Items — ${receiveModal.po_number}`} onClose={() => setReceiveModal(null)}>
          <div className="space-y-4 p-1" style={{ minWidth: '480px' }}>
            <div className="space-y-2">
              <div className="grid grid-cols-12 text-xs text-gray-400 font-medium px-1 gap-2">
                <div className="col-span-5">Product</div>
                <div className="col-span-2 text-center">Ordered</div>
                <div className="col-span-2 text-center">Received</div>
                <div className="col-span-3">Receiving Now</div>
              </div>
              {receiveModal.items.filter(i => i.pending_quantity > 0).map(item => {
                const line = receiveLines.find(l => l.item_id === item.id)
                return (
                  <div key={item.id} className="grid grid-cols-12 items-center gap-2">
                    <div className="col-span-5 text-sm text-gray-700 truncate">{item.product_name}</div>
                    <div className="col-span-2 text-center text-sm text-gray-400">{item.quantity_ordered}</div>
                    <div className="col-span-2 text-center text-sm text-gray-400">{item.quantity_received}</div>
                    <div className="col-span-3">
                      <input type="number" min={0} max={item.pending_quantity}
                        className="w-full border rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        value={line?.quantity_received ?? item.pending_quantity}
                        onChange={e => setReceiveLines(l => l.map(x => x.item_id === item.id ? { ...x, quantity_received: Number(e.target.value) } : x))}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Notes</label>
              <textarea className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" rows={2}
                value={receiveNotes} onChange={e => setReceiveNotes(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setReceiveModal(null)} className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={submitReceive} disabled={receiveMut.isPending}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-1">
                {receiveMut.isPending && <Loader2 className="animate-spin" size={13} />}
                Confirm Receipt
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* View PO Detail Modal */}
      {viewModal && (
        <Modal open title={viewModal.po_number} onClose={() => setViewModal(null)}>
          <div className="space-y-4 p-1" style={{ minWidth: '520px' }}>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div className="flex items-center gap-2 text-gray-500"><Building2 size={13} /> <span className="font-medium text-gray-700">{viewModal.supplier_name}</span></div>
              <div className="flex items-center gap-2 text-gray-500">Status: <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-medium ${PO_STATUS_META[viewModal.status].color}`}>{PO_STATUS_META[viewModal.status].label}</span></div>
              {viewModal.expected_delivery && <div className="flex items-center gap-2 text-gray-400"><Clock size={13} /> Expected: {viewModal.expected_delivery}</div>}
              {viewModal.received_at && <div className="flex items-center gap-2 text-gray-400"><CheckCircle2 size={13} /> Received: <DateDisplay adDate={viewModal.received_at} compact /></div>}
              {viewModal.notes && <div className="col-span-2 text-gray-400 text-xs">{viewModal.notes}</div>}
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-100">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-400 text-xs uppercase">
                  <tr>
                    {['Product', 'SKU', 'Ordered', 'Received', 'Unit Cost', 'Total'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {viewModal.items.map(item => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 text-gray-700">{item.product_name}</td>
                      <td className="px-3 py-2 text-gray-400 font-mono text-xs">{item.product_sku}</td>
                      <td className="px-3 py-2 text-gray-500">{item.quantity_ordered}</td>
                      <td className="px-3 py-2 text-gray-500">{item.quantity_received}</td>
                      <td className="px-3 py-2 text-gray-500">Rs {parseFloat(item.unit_cost).toLocaleString()}</td>
                      <td className="px-3 py-2 font-medium text-gray-700">Rs {parseFloat(item.line_total).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end text-sm font-semibold text-gray-700">
              Total: Rs {parseFloat(viewModal.total_amount).toLocaleString()}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Units of Measure Tab ─────────────────────────────────────────────────────

function UoMTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<UnitOfMeasure | null>(null)
  const [form, setForm] = useState({ name: '', abbreviation: '', unit_type: 'unit' as UnitOfMeasure['unit_type'] })

  const { data: uoms = [], isLoading } = useQuery<UnitOfMeasure[]>({
    queryKey: ['uom'],
    queryFn: () => apiClient.get(INVENTORY.UOM).then(r => Array.isArray(r.data) ? r.data : r.data.data ?? r.data.results ?? []),
  })

  const openAdd = () => { setForm({ name: '', abbreviation: '', unit_type: 'unit' }); setEditing(null); setShowAdd(true) }
  const openEdit = (u: UnitOfMeasure) => { setForm({ name: u.name, abbreviation: u.abbreviation, unit_type: u.unit_type }); setEditing(u); setShowAdd(true) }

  const saveMut = useMutation({
    mutationFn: (data: typeof form) =>
      editing
        ? apiClient.patch(INVENTORY.UOM_DETAIL(editing.id), data)
        : apiClient.post(INVENTORY.UOM, data),
    onSuccess: () => { toast.success(editing ? 'UoM updated' : 'UoM created'); setShowAdd(false); qc.invalidateQueries({ queryKey: ['uom'] }) },
    onError: () => toast.error('Failed to save'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiClient.delete(INVENTORY.UOM_DETAIL(id)),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['uom'] }) },
    onError: () => toast.error('Cannot delete — unit may be in use'),
  })

  const TYPE_LABELS: Record<string, string> = { unit: 'Unit', weight: 'Weight', volume: 'Volume', length: 'Length' }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-700 flex items-center gap-2"><Scale size={16} className="text-indigo-400" /> Units of Measure</h2>
        {canManage && (
          <button onClick={openAdd} className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition">
            <Plus size={14} /> Add UoM
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading…</div>
        ) : uoms.length === 0 ? (
          <div className="p-10 text-center"><Scale size={32} className="text-gray-300 mx-auto mb-2" /><p className="text-gray-400 text-sm">No units of measure yet</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3 text-left">Name</th>
                <th className="px-5 py-3 text-left">Abbreviation</th>
                <th className="px-5 py-3 text-left">Type</th>
                <th className="px-5 py-3 text-center">Products</th>
                {canManage && <th className="px-5 py-3"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {uoms.map(u => (
                <tr key={u.id} className="hover:bg-gray-50 transition">
                  <td className="px-5 py-3 font-medium text-gray-800">{u.name}</td>
                  <td className="px-5 py-3 font-mono text-gray-500 text-xs">{u.abbreviation}</td>
                  <td className="px-5 py-3"><span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium">{TYPE_LABELS[u.unit_type] ?? u.unit_type}</span></td>
                  <td className="px-5 py-3 text-center text-gray-500">{u.product_count ?? 0}</td>
                  {canManage && (
                    <td className="px-5 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => openEdit(u)} className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-400 hover:text-indigo-600 transition"><Pencil size={13} /></button>
                        <button onClick={() => { confirm({ title: 'Delete UoM', message: 'Delete this UoM?', variant: 'danger', confirmLabel: 'Delete' }).then(ok => { if (ok) deleteMut.mutate(u.id) }) }} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <Modal open onClose={() => setShowAdd(false)} title={editing ? 'Edit Unit of Measure' : 'Add Unit of Measure'}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="e.g. Kilogram" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Abbreviation *</label>
              <input value={form.abbreviation} onChange={e => setForm(f => ({ ...f, abbreviation: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="e.g. kg" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select value={form.unit_type} onChange={e => setForm(f => ({ ...f, unit_type: e.target.value as UnitOfMeasure['unit_type'] }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="unit">Unit (pieces, boxes, etc.)</option>
                <option value="weight">Weight (kg, g, lb)</option>
                <option value="volume">Volume (L, ml, gal)</option>
                <option value="length">Length (m, cm, ft)</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending || !form.name || !form.abbreviation}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {saveMut.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Product Variants Tab ──────────────────────────────────────────────────────

function VariantsTab({ products, canManage }: { products: Product[]; canManage: boolean }) {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [selectedProduct, setSelectedProduct] = useState<number | ''>('')
  const [showAdd, setShowAdd]   = useState(false)
  const [editing, setEditing]   = useState<ProductVariant | null>(null)
  const [attrRows, setAttrRows] = useState<{ key: string; value: string }[]>([{ key: '', value: '' }])
  const [form, setForm] = useState({
    sku: '', barcode: '', price_adjustment: '0', cost_price: '',
    reorder_level: 0, is_active: true,
  })

  const physicalProducts = products.filter(p => !p.is_service)

  const { data: variants = [], isLoading } = useQuery<ProductVariant[]>({
    queryKey: ['variants', selectedProduct],
    queryFn: () => {
      const url = selectedProduct
        ? `${INVENTORY.VARIANTS}?product=${selectedProduct}`
        : INVENTORY.VARIANTS
      return apiClient.get(url).then(r => Array.isArray(r.data) ? r.data : r.data.data ?? r.data.results ?? [])
    },
  })

  const openAdd = () => {
    setForm({ sku: '', barcode: '', price_adjustment: '0', cost_price: '', reorder_level: 0, is_active: true })
    setAttrRows([{ key: '', value: '' }])
    setEditing(null)
    setShowAdd(true)
  }
  const openEdit = (v: ProductVariant) => {
    setForm({
      sku: v.sku, barcode: v.barcode ?? '', price_adjustment: v.price_adjustment,
      cost_price: v.cost_price ?? '', reorder_level: v.reorder_level, is_active: v.is_active,
    })
    setAttrRows(
      Object.entries(v.attributes).length
        ? Object.entries(v.attributes).map(([key, value]) => ({ key, value }))
        : [{ key: '', value: '' }]
    )
    setEditing(v)
    setShowAdd(true)
  }

  const buildAttributes = () =>
    Object.fromEntries(attrRows.filter(r => r.key.trim()).map(r => [r.key.trim(), r.value.trim()]))

  const saveMut = useMutation({
    mutationFn: (data: typeof form) => {
      const payload = { ...data, attributes: buildAttributes(), product: selectedProduct || undefined }
      return editing
        ? apiClient.patch(INVENTORY.VARIANT_DETAIL(editing.id), payload)
        : apiClient.post(INVENTORY.VARIANTS, payload)
    },
    onSuccess: () => {
      toast.success(editing ? 'Variant updated' : 'Variant created')
      setShowAdd(false)
      qc.invalidateQueries({ queryKey: ['variants', selectedProduct] })
    },
    onError: () => toast.error('Failed to save variant'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiClient.delete(INVENTORY.VARIANT_DETAIL(id)),
    onSuccess: () => { toast.success('Variant deleted'); qc.invalidateQueries({ queryKey: ['variants', selectedProduct] }) },
    onError: () => toast.error('Delete failed'),
  })

  const addAttrRow    = () => setAttrRows(r => [...r, { key: '', value: '' }])
  const removeAttrRow = (i: number) => setAttrRows(r => r.filter((_, idx) => idx !== i))
  const updateAttrRow = (i: number, field: 'key' | 'value', val: string) =>
    setAttrRows(r => r.map((row, idx) => idx === i ? { ...row, [field]: val } : row))

  const productName = (id: number) => physicalProducts.find(p => p.id === id)?.name ?? `Product #${id}`

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-700 flex items-center gap-2">
          <Layers size={16} className="text-indigo-400" /> Product Variants
        </h2>
        {canManage && selectedProduct && (
          <button onClick={openAdd}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition">
            <Plus size={14} /> Add Variant
          </button>
        )}
      </div>

      {/* Product filter */}
      <div className="flex gap-3 mb-4 items-center">
        <select value={selectedProduct}
          onChange={e => setSelectedProduct(e.target.value ? Number(e.target.value) : '')}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-72">
          <option value="">All products</option>
          {physicalProducts.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
        </select>
        {!selectedProduct && (
          <p className="text-xs text-gray-400">Select a product to manage its variants or add a new one.</p>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        ) : variants.length === 0 ? (
          <div className="p-10 text-center">
            <Layers size={32} className="text-gray-300 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">
              {selectedProduct ? 'No variants for this product yet' : 'No variants found'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                {!selectedProduct && <th className="px-5 py-3 text-left">Product</th>}
                <th className="px-5 py-3 text-left">Attributes</th>
                <th className="px-5 py-3 text-left">SKU</th>
                <th className="px-5 py-3 text-right">Price Adj.</th>
                <th className="px-5 py-3 text-right">Effective Price</th>
                <th className="px-5 py-3 text-center">Stock</th>
                <th className="px-5 py-3 text-center">Active</th>
                {canManage && <th className="px-5 py-3"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {variants.map(v => (
                <tr key={v.id} className="hover:bg-gray-50 transition">
                  {!selectedProduct && (
                    <td className="px-5 py-3 text-gray-600 text-xs">{productName(v.product)}</td>
                  )}
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(v.attributes).map(([k, val]) => (
                        <span key={k} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs font-medium">
                          {k}: {val}
                        </span>
                      ))}
                      {Object.keys(v.attributes).length === 0 && <span className="text-gray-300 text-xs">—</span>}
                    </div>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-gray-400">{v.sku || '—'}</td>
                  <td className="px-5 py-3 text-right text-xs text-gray-500">
                    {parseFloat(v.price_adjustment) >= 0
                      ? <span className="text-green-600">+Rs. {parseFloat(v.price_adjustment).toFixed(2)}</span>
                      : <span className="text-red-500">Rs. {parseFloat(v.price_adjustment).toFixed(2)}</span>
                    }
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-gray-800">
                    Rs. {parseFloat(v.effective_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className={`font-medium ${v.stock_on_hand <= v.reorder_level ? 'text-red-500' : 'text-gray-700'}`}>
                      {v.stock_on_hand}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-center">
                    {v.is_active
                      ? <CheckCircle2 size={15} className="text-green-500 mx-auto" />
                      : <XCircle      size={15} className="text-gray-300 mx-auto" />}
                  </td>
                  {canManage && (
                    <td className="px-5 py-3">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => openEdit(v)}
                          className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-400 hover:text-indigo-600 transition">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => { confirm({ title: 'Delete Variant', message: 'Delete this variant?', variant: 'danger', confirmLabel: 'Delete' }).then(ok => { if (ok) deleteMut.mutate(v.id) }) }}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add / Edit Modal */}
      {showAdd && (
        <Modal open onClose={() => setShowAdd(false)}
          title={editing ? 'Edit Variant' : 'Add Variant'}
          width="max-w-xl">
          <div className="space-y-4">
            {/* Product selector (only when not filtered) */}
            {!selectedProduct && !editing && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Product *</label>
                <select
                  onChange={e => setSelectedProduct(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">Select product…</option>
                  {physicalProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}

            {/* Attributes */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-600">Attributes (e.g. Color: Red)</label>
                <button onClick={addAttrRow} className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium">
                  <Plus size={11} /> Add Row
                </button>
              </div>
              <div className="space-y-2">
                {attrRows.map((row, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input value={row.key} onChange={e => updateAttrRow(i, 'key', e.target.value)}
                      placeholder="Attribute (e.g. Color)"
                      className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    <input value={row.value} onChange={e => updateAttrRow(i, 'value', e.target.value)}
                      placeholder="Value (e.g. Red)"
                      className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    {attrRows.length > 1 && (
                      <button onClick={() => removeAttrRow(i)} className="text-red-400 hover:text-red-600">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* SKU + Barcode */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Variant SKU</label>
                <input value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                  placeholder="Leave blank to auto-generate"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Barcode</label>
                <input value={form.barcode} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>

            {/* Pricing */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Price Adjustment</label>
                <input type="number" step="0.01" value={form.price_adjustment}
                  onChange={e => setForm(f => ({ ...f, price_adjustment: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <p className="text-xs text-gray-400 mt-0.5">Added to base product price (can be negative)</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Cost Price</label>
                <input type="number" step="0.01" min="0" value={form.cost_price}
                  onChange={e => setForm(f => ({ ...f, cost_price: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>

            {/* Reorder level + Active */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Reorder Level</label>
                <input type="number" min="0" value={form.reorder_level}
                  onChange={e => setForm(f => ({ ...f, reorder_level: Number(e.target.value) }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={form.is_active}
                    onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                    className="w-4 h-4 rounded border-gray-300 text-indigo-600" />
                  <span className="text-sm text-gray-700">Active variant</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowAdd(false)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={() => saveMut.mutate(form)}
                disabled={saveMut.isPending || (!selectedProduct && !editing)}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {saveMut.isPending ? 'Saving…' : 'Save Variant'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Returns Tab ───────────────────────────────────────────────────────────────

function ReturnsTab({ products, canManage }: { products: Product[]; canManage: boolean }) {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { fyYear } = useFyStore()
  const [showAdd, setShowAdd] = useState(false)
  const [detail, setDetail]   = useState<ReturnOrder | null>(null)

  const [form, setForm] = useState({
    supplier: '' as number | '',
    purchase_order: '' as number | '',
    reason: 'defective' as ReturnOrder['reason'],
    notes: '',
    items: [{ product: '' as number | '', quantity: 1, unit_cost: '' }],
  })

  const { data: returns = [], isLoading } = useQuery<ReturnOrder[]>({
    queryKey: ['return-orders', fyYear],
    queryFn: () =>
      apiClient.get(INVENTORY.RETURN_ORDERS, { params: fyYear ? { fiscal_year: fyYear } : {} }).then(r => Array.isArray(r.data) ? r.data : r.data.data ?? r.data.results ?? []),
  })

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: () => apiClient.get(INVENTORY.SUPPLIERS).then(r => Array.isArray(r.data) ? r.data : r.data.data ?? r.data.results ?? []),
  })

  const { data: purchaseOrders = [] } = useQuery<PurchaseOrder[]>({
    queryKey: ['purchase-orders', fyYear],
    queryFn: () =>
      apiClient.get(INVENTORY.PURCHASE_ORDERS, { params: fyYear ? { fiscal_year: fyYear } : {} }).then(r => Array.isArray(r.data) ? r.data : r.data.data ?? r.data.results ?? []),
  })

  const filteredPOs = purchaseOrders.filter(po => form.supplier === '' || po.supplier === form.supplier)

  const createMut = useMutation({
    mutationFn: (data: typeof form) => apiClient.post(INVENTORY.RETURN_ORDERS, {
      supplier: data.supplier,
      purchase_order: data.purchase_order || null,
      reason: data.reason,
      notes: data.notes,
      items: data.items.filter(i => i.product !== '').map(i => ({
        product: i.product, quantity: i.quantity, unit_cost: i.unit_cost || '0',
      })),
    }),
    onSuccess: () => { toast.success('Return order created'); setShowAdd(false); resetForm(); qc.invalidateQueries({ queryKey: ['return-orders'] }) },
    onError: () => toast.error('Failed to create return order'),
  })

  const actionMut = useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'send' | 'accept' | 'cancel' }) => {
      const url = action === 'send' ? INVENTORY.RETURN_ORDER_SEND(id)
        : action === 'accept' ? INVENTORY.RETURN_ORDER_ACCEPT(id)
        : INVENTORY.RETURN_ORDER_CANCEL(id)
      return apiClient.post(url)
    },
    onSuccess: (_, vars) => {
      toast.success(`Return order ${vars.action === 'send' ? 'sent' : vars.action === 'accept' ? 'accepted' : 'cancelled'}`)
      qc.invalidateQueries({ queryKey: ['return-orders'] })
      if (detail?.id === vars.id) setDetail(null)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Action failed'
      toast.error(msg)
    },
  })

  const resetForm = () => setForm({ supplier: '', purchase_order: '', reason: 'defective', notes: '', items: [{ product: '' as number | '', quantity: 1, unit_cost: '' }] })

  const STATUS_STYLE: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600',
    sent: 'bg-blue-100 text-blue-700',
    accepted: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-600',
  }
  const REASON_LABELS: Record<string, string> = {
    defective: 'Defective', wrong_item: 'Wrong Item', overstock: 'Overstock', expired: 'Expired', other: 'Other',
  }

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { product: '' as number | '', quantity: 1, unit_cost: '' }] }))
  const removeItem = (idx: number) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
  const updateItem = (idx: number, key: string, value: string | number) =>
    setForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, [key]: value } : it) }))

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-700 flex items-center gap-2"><RotateCcw size={16} className="text-indigo-400" /> Return to Supplier</h2>
        {canManage && (
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition">
            <Plus size={14} /> New Return
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading…</div>
        ) : returns.length === 0 ? (
          <div className="p-10 text-center"><RotateCcw size={32} className="text-gray-300 mx-auto mb-2" /><p className="text-gray-400 text-sm">No return orders yet</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3 text-left">Return #</th>
                <th className="px-5 py-3 text-left">Supplier</th>
                <th className="px-5 py-3 text-left">Reason</th>
                <th className="px-5 py-3 text-center">Items</th>
                <th className="px-5 py-3 text-right">Total Value</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-left">Date</th>
                {canManage && <th className="px-5 py-3"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {returns.map(ro => (
                <tr key={ro.id} className="hover:bg-indigo-50 transition cursor-pointer" onClick={() => setDetail(ro)}>
                  <td className="px-5 py-3 font-mono text-xs font-medium text-gray-700">{ro.return_number}</td>
                  <td className="px-5 py-3 text-gray-700">{ro.supplier_name}</td>
                  <td className="px-5 py-3 text-gray-500 text-xs">{REASON_LABELS[ro.reason] ?? ro.reason}</td>
                  <td className="px-5 py-3 text-center text-gray-500">{ro.total_items}</td>
                  <td className="px-5 py-3 text-right font-medium text-gray-800">Rs. {parseFloat(ro.total_value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td className="px-5 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[ro.status] ?? 'bg-gray-100'}`}>{ro.status}</span></td>
                  <td className="px-5 py-3 text-gray-400 text-xs"><DateDisplay adDate={ro.created_at} compact /></td>
                  {canManage && (
                    <td className="px-5 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1 justify-end">
                        {ro.status === 'draft' && (
                          <button onClick={() => actionMut.mutate({ id: ro.id, action: 'send' })}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition">
                            <Send size={11} /> Send
                          </button>
                        )}
                        {ro.status === 'sent' && (
                          <button onClick={() => actionMut.mutate({ id: ro.id, action: 'accept' })}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition">
                            <CheckCircle2 size={11} /> Accept
                          </button>
                        )}
                        {(ro.status === 'draft' || ro.status === 'sent') && (
                          <button onClick={() => { confirm({ title: 'Cancel Return Order', message: 'Cancel this return order?', variant: 'warning', confirmLabel: 'Cancel Order' }).then(ok => { if (ok) actionMut.mutate({ id: ro.id, action: 'cancel' }) }) }}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition">
                            <Ban size={11} /> Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail modal */}
      {detail && (
        <Modal open onClose={() => setDetail(null)} title={`Return Order ${detail.return_number}`} width="max-w-2xl">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-400">Supplier:</span> <span className="font-medium">{detail.supplier_name}</span></div>
              <div><span className="text-gray-400">Status:</span> <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[detail.status]}`}>{detail.status}</span></div>
              <div><span className="text-gray-400">Reason:</span> <span className="font-medium">{REASON_LABELS[detail.reason]}</span></div>
              {detail.po_number && <div><span className="text-gray-400">PO:</span> <span className="font-medium">{detail.po_number}</span></div>}
              {detail.sent_at && <div><span className="text-gray-400">Sent At:</span> <span className="font-medium"><DateDisplay adDate={detail.sent_at} showTime compact /></span></div>}
            </div>
            {detail.notes && <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-700">{detail.notes}</div>}
            <table className="w-full text-sm border-t border-gray-100 mt-2">
              <thead><tr className="text-gray-400 text-xs uppercase tracking-wide"><th className="py-2 text-left">Product</th><th className="py-2 text-center">Qty</th><th className="py-2 text-right">Unit Cost</th><th className="py-2 text-right">Total</th></tr></thead>
              <tbody className="divide-y divide-gray-50">
                {detail.items.map(i => (
                  <tr key={i.id}>
                    <td className="py-2 text-gray-700">{i.product_name} <span className="text-gray-400 text-xs">({i.product_sku})</span></td>
                    <td className="py-2 text-center text-gray-600">{i.quantity}</td>
                    <td className="py-2 text-right text-gray-600">Rs. {parseFloat(i.unit_cost).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 text-right font-medium text-gray-800">Rs. {parseFloat(i.line_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={3} className="pt-2 text-right font-semibold text-gray-600">Total</td><td className="pt-2 text-right font-bold text-gray-800">Rs. {parseFloat(detail.total_value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr></tfoot>
            </table>
          </div>
        </Modal>
      )}

      {/* Create Return Modal */}
      {showAdd && (
        <Modal open onClose={() => { setShowAdd(false); resetForm() }} title="New Return to Supplier" width="max-w-2xl">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Supplier *</label>
                <select value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: Number(e.target.value), purchase_order: '' }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">Select supplier…</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Related PO (optional)</label>
                <select value={form.purchase_order} onChange={e => setForm(f => ({ ...f, purchase_order: e.target.value ? Number(e.target.value) : '' }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">None</option>
                  {filteredPOs.map(po => <option key={po.id} value={po.id}>{po.po_number}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Reason *</label>
                <select value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value as ReturnOrder['reason'] }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {Object.entries(REASON_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            {/* Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-gray-600">Return Items</label>
                <button onClick={addItem} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"><Plus size={11} /> Add Row</button>
              </div>
              <div className="space-y-2">
                {form.items.map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <select value={item.product} onChange={e => updateItem(idx, 'product', Number(e.target.value))}
                      className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                      <option value="">Select product…</option>
                      {products.filter(p => !p.is_service).map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                    </select>
                    <input type="number" min="1" value={item.quantity} onChange={e => updateItem(idx, 'quantity', Number(e.target.value))}
                      className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Qty" />
                    <input type="number" min="0" step="0.01" value={item.unit_cost} onChange={e => updateItem(idx, 'unit_cost', e.target.value)}
                      className="w-28 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Unit Cost" />
                    {form.items.length > 1 && (
                      <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => { setShowAdd(false); resetForm() }} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={() => createMut.mutate(form)} disabled={createMut.isPending || !form.supplier}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {createMut.isPending ? 'Creating…' : 'Create Return'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Reports Tab ───────────────────────────────────────────────────────────────

function ReportsTab() {
  const [activeReport, setActiveReport] = useState<'valuation' | 'dead-stock' | 'abc' | 'forecast' | 'top-selling'>('valuation')
  const [deadStockDays, setDeadStockDays] = useState(60)
  const [forecastDays, setForecastDays]   = useState(30)
  const [topSellingDays, setTopSellingDays] = useState(90)

  const { data: valuation, isLoading: loadingVal } = useQuery({
    queryKey: ['report-valuation'],
    queryFn: () => apiClient.get(INVENTORY.REPORT_VALUATION).then(r => r.data?.data ?? r.data),
    enabled: activeReport === 'valuation',
  })
  const { data: deadStock, isLoading: loadingDead } = useQuery({
    queryKey: ['report-dead-stock', deadStockDays],
    queryFn: () => apiClient.get(`${INVENTORY.REPORT_DEAD_STOCK}?days=${deadStockDays}`).then(r => r.data?.data ?? r.data),
    enabled: activeReport === 'dead-stock',
  })
  const { data: abc, isLoading: loadingAbc } = useQuery({
    queryKey: ['report-abc'],
    queryFn: () => apiClient.get(INVENTORY.REPORT_ABC).then(r => r.data?.data ?? r.data),
    enabled: activeReport === 'abc',
  })
  const { data: forecast, isLoading: loadingForecast } = useQuery({
    queryKey: ['report-forecast', forecastDays],
    queryFn: () => apiClient.get(`${INVENTORY.REPORT_FORECAST}?days=${forecastDays}`).then(r => r.data?.data ?? r.data),
    enabled: activeReport === 'forecast',
  })
  const { data: topSelling, isLoading: loadingTopSelling } = useQuery({
    queryKey: ['report-top-selling', topSellingDays],
    queryFn: () => apiClient.get(`${INVENTORY.REPORT_TOP_SELLING}?days=${topSellingDays}`).then(r => r.data?.data ?? r.data),
    enabled: activeReport === 'top-selling',
  })

  const handleExportCsv = async () => {
    try {
      const res = await apiClient.get(INVENTORY.REPORT_EXPORT_CSV, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data]))
      const a   = document.createElement('a')
      a.href    = url
      a.download = 'products_export.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Export failed')
    }
  }

  const REPORT_TABS = [
    { id: 'valuation' as const,   label: 'Stock Valuation', icon: <DollarSign size={14} /> },
    { id: 'dead-stock' as const,  label: 'Dead Stock',      icon: <Archive size={14} /> },
    { id: 'abc' as const,         label: 'ABC Analysis',    icon: <TrendingUp size={14} /> },
    { id: 'forecast' as const,    label: 'Forecast',        icon: <TrendingDown size={14} /> },
    { id: 'top-selling' as const, label: 'Top Selling',     icon: <BarChart2 size={14} /> },
  ]

  const ABC_STYLE: Record<string, string> = {
    A: 'bg-green-100 text-green-700',
    B: 'bg-yellow-100 text-yellow-700',
    C: 'bg-red-100 text-red-600',
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-700 flex items-center gap-2"><FileBarChart2 size={16} className="text-indigo-400" /> Inventory Reports</h2>
        <button onClick={handleExportCsv}
          className="flex items-center gap-1.5 px-4 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
          <FileDown size={14} /> Export Products CSV
        </button>
      </div>

      {/* Sub-report tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
        {REPORT_TABS.map(t => (
          <button key={t.id} onClick={() => setActiveReport(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${activeReport === t.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Valuation */}
      {activeReport === 'valuation' && (
        <div>
          {loadingVal ? (
            <div className="p-8 text-center text-gray-400 flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading…</div>
          ) : valuation ? (
            <>
              <div className="mb-3 bg-indigo-50 rounded-xl p-4 flex items-center justify-between">
                <span className="text-sm text-indigo-600 font-medium">Total Inventory Value</span>
                <span className="text-xl font-bold text-indigo-700">Rs. {parseFloat(valuation.total_value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                    <tr><th className="px-5 py-3 text-left">Product</th><th className="px-5 py-3 text-left">SKU</th><th className="px-5 py-3 text-left">Category</th><th className="px-5 py-3 text-center">Qty</th><th className="px-5 py-3 text-right">Cost</th><th className="px-5 py-3 text-right">Value</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {valuation.rows.map((r: {id: number; name: string; sku: string; category: string | null; quantity_on_hand: number; cost_price: number; total_value: number}) => (
                      <tr key={r.id}>
                        <td className="px-5 py-3 font-medium text-gray-800">{r.name}</td>
                        <td className="px-5 py-3 font-mono text-xs text-gray-400">{r.sku}</td>
                        <td className="px-5 py-3 text-gray-500 text-xs">{r.category ?? '—'}</td>
                        <td className="px-5 py-3 text-center text-gray-600">{r.quantity_on_hand}</td>
                        <td className="px-5 py-3 text-right text-gray-500">Rs. {Number(r.cost_price ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="px-5 py-3 text-right font-semibold text-gray-800">Rs. {Number(r.total_value ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* Dead Stock */}
      {activeReport === 'dead-stock' && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-sm text-gray-600">No movement in the last</span>
            <input type="number" value={deadStockDays} onChange={e => setDeadStockDays(Number(e.target.value))} min={7} max={365}
              className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <span className="text-sm text-gray-600">days</span>
          </div>
          {loadingDead ? (
            <div className="p-8 text-center text-gray-400 flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading…</div>
          ) : deadStock ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {deadStock.count === 0 ? (
                <div className="p-10 text-center"><CheckCircle2 size={32} className="text-green-300 mx-auto mb-2" /><p className="text-gray-400 text-sm">No dead stock — all products have recent movement</p></div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                    <tr><th className="px-5 py-3 text-left">Product</th><th className="px-5 py-3 text-left">SKU</th><th className="px-5 py-3 text-center">Qty on Hand</th><th className="px-5 py-3 text-left">Last Movement</th><th className="px-5 py-3 text-center">Days Inactive</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {deadStock.rows.map((r: {id: number; name: string; sku: string; quantity_on_hand: number; last_movement: string | null; days_inactive: number}) => (
                      <tr key={r.id}>
                        <td className="px-5 py-3 font-medium text-gray-800">{r.name}</td>
                        <td className="px-5 py-3 font-mono text-xs text-gray-400">{r.sku}</td>
                        <td className="px-5 py-3 text-center text-gray-600">{r.quantity_on_hand}</td>
                        <td className="px-5 py-3 text-gray-500 text-xs">{r.last_movement ? <DateDisplay adDate={r.last_movement} compact /> : 'Never'}</td>
                        <td className="px-5 py-3 text-center"><span className="px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-xs font-medium">{r.days_inactive}d</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* ABC Analysis */}
      {activeReport === 'abc' && (
        <div>
          <div className="flex gap-3 mb-4">
            {['A', 'B', 'C'].map(cls => (
              <div key={cls} className={`px-3 py-2 rounded-xl text-xs ${ABC_STYLE[cls]}`}>
                <strong>Class {cls}:</strong> {cls === 'A' ? 'Top 70% of value' : cls === 'B' ? 'Next 20%' : 'Bottom 10%'}
              </div>
            ))}
          </div>
          {loadingAbc ? (
            <div className="p-8 text-center text-gray-400 flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading…</div>
          ) : abc ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <tr><th className="px-5 py-3 text-left">Product</th><th className="px-5 py-3 text-left">SKU</th><th className="px-5 py-3 text-center">Qty</th><th className="px-5 py-3 text-right">Stock Value</th><th className="px-5 py-3 text-center">Cumulative %</th><th className="px-5 py-3 text-center">Class</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {abc.rows.map((r: {id: number; name: string; sku: string; quantity_on_hand: number; stock_value: number; cumulative_pct: number; class: string}) => (
                    <tr key={r.id}>
                      <td className="px-5 py-3 font-medium text-gray-800">{r.name}</td>
                      <td className="px-5 py-3 font-mono text-xs text-gray-400">{r.sku}</td>
                      <td className="px-5 py-3 text-center text-gray-600">{r.quantity_on_hand}</td>
                      <td className="px-5 py-3 text-right font-semibold text-gray-800">Rs. {Number(r.stock_value ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="px-5 py-3 text-center text-gray-500 text-xs">{r.cumulative_pct}%</td>
                      <td className="px-5 py-3 text-center"><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${ABC_STYLE[r.class]}`}>{r.class}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      )}

      {/* Forecast */}
      {activeReport === 'forecast' && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-sm text-gray-600">Based on consumption over last</span>
            <input type="number" value={forecastDays} onChange={e => setForecastDays(Number(e.target.value))} min={7} max={365}
              className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <span className="text-sm text-gray-600">days</span>
          </div>
          {loadingForecast ? (
            <div className="p-8 text-center text-gray-400 flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading…</div>
          ) : forecast ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <tr><th className="px-5 py-3 text-left">Product</th><th className="px-5 py-3 text-left">Category</th><th className="px-5 py-3 text-center">On Hand</th><th className="px-5 py-3 text-center">Reorder At</th><th className="px-5 py-3 text-center">Avg Daily Use</th><th className="px-5 py-3 text-center">Days of Stock</th><th className="px-5 py-3 text-center">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {forecast.rows.map((r: {id: number; name: string; category: string | null; quantity_on_hand: number; reorder_level: number; avg_daily_consumption: number; days_of_stock: number | null; needs_reorder: boolean}) => (
                    <tr key={r.id} className={r.needs_reorder ? 'bg-red-50' : ''}>
                      <td className="px-5 py-3 font-medium text-gray-800">{r.name}</td>
                      <td className="px-5 py-3 text-gray-500 text-xs">{r.category ?? '—'}</td>
                      <td className="px-5 py-3 text-center text-gray-600">{r.quantity_on_hand}</td>
                      <td className="px-5 py-3 text-center text-gray-500">{r.reorder_level}</td>
                      <td className="px-5 py-3 text-center text-gray-500">{r.avg_daily_consumption}</td>
                      <td className="px-5 py-3 text-center">
                        {r.days_of_stock === null
                          ? <span className="text-gray-300 text-xs">No consumption</span>
                          : <span className={`font-medium ${r.days_of_stock < 7 ? 'text-red-600' : r.days_of_stock < 14 ? 'text-amber-600' : 'text-green-600'}`}>{r.days_of_stock}d</span>
                        }
                      </td>
                      <td className="px-5 py-3 text-center">
                        {r.needs_reorder
                          ? <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-xs font-medium">Reorder Now</span>
                          : <span className="px-2 py-0.5 bg-green-100 text-green-600 rounded-full text-xs font-medium">OK</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      )}

      {/* Top Selling */}
      {activeReport === 'top-selling' && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-sm text-gray-600">Based on ticket usage over last</span>
            <input type="number" value={topSellingDays} onChange={e => setTopSellingDays(Number(e.target.value))} min={7} max={365}
              className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <span className="text-sm text-gray-600">days</span>
          </div>
          {loadingTopSelling ? (
            <div className="p-8 text-center text-gray-400 flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading…</div>
          ) : topSelling ? (
            topSelling.rows.length === 0 ? (
              <div className="p-10 text-center"><Package size={32} className="text-gray-200 mx-auto mb-2" /><p className="text-gray-400 text-sm">No ticket product usage found in this period</p></div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-5 py-3 text-center">#</th>
                      <th className="px-5 py-3 text-left">Product</th>
                      <th className="px-5 py-3 text-left">SKU</th>
                      <th className="px-5 py-3 text-left">Category</th>
                      <th className="px-5 py-3 text-right">Unit Price</th>
                      <th className="px-5 py-3 text-center">Qty Sold</th>
                      <th className="px-5 py-3 text-center">On Hand</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {topSelling.rows.map((r: {id: number; name: string; sku: string; category: string | null; unit_price: number; quantity_sold: number; quantity_on_hand: number}, i: number) => (
                      <tr key={r.id}>
                        <td className="px-5 py-3 text-center text-gray-400 text-xs font-medium">{i + 1}</td>
                        <td className="px-5 py-3 font-medium text-gray-800">{r.name}</td>
                        <td className="px-5 py-3 font-mono text-xs text-gray-400">{r.sku}</td>
                        <td className="px-5 py-3 text-gray-500 text-xs">{r.category ?? '—'}</td>
                        <td className="px-5 py-3 text-right text-gray-600">Rs. {r.unit_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="px-5 py-3 text-center font-semibold text-indigo-600">{r.quantity_sold}</td>
                        <td className="px-5 py-3 text-center text-gray-600">{r.quantity_on_hand}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : null}
        </div>
      )}
    </div>
  )
}

// ── Supplier–Product Catalog Tab ─────────────────────────────────────────────

interface SupplierProduct {
  id: number
  supplier: number
  supplier_name: string
  product: number
  product_name: string
  product_sku: string
  supplier_sku: string
  unit_cost: string
  lead_time_days: number
  min_order_qty: number
  is_preferred: boolean
  notes: string
}

function SupplierCatalogTab({ products, canManage }: { products: Product[]; canManage: boolean }) {
  const qc = useQueryClient()
  const [filterSupplier, setFilterSupplier] = useState('')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<SupplierProduct | null>(null)
  const [form, setForm] = useState({ supplier: '', product: '', supplier_sku: '', unit_cost: '', lead_time_days: '0', min_order_qty: '1', is_preferred: false, notes: '' })

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: () => apiClient.get(INVENTORY.SUPPLIERS).then(r => Array.isArray(r.data) ? r.data : r.data.data ?? r.data.results ?? []),
  })
  const { data: catalog = [], isLoading } = useQuery<SupplierProduct[]>({
    queryKey: ['supplier-catalog', filterSupplier],
    queryFn: () => {
      const params = filterSupplier ? `?supplier=${filterSupplier}` : ''
      return apiClient.get(`${INVENTORY.SUPPLIER_PRODUCTS}${params}`).then(r => Array.isArray(r.data) ? r.data : r.data.data ?? r.data.results ?? [])
    },
  })

  const createMut = useMutation({
    mutationFn: (d: typeof form) => apiClient.post(INVENTORY.SUPPLIER_PRODUCTS, { ...d, unit_cost: parseFloat(d.unit_cost) || 0, lead_time_days: parseInt(d.lead_time_days) || 0, min_order_qty: parseInt(d.min_order_qty) || 1 }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['supplier-catalog'] }); setModal(false); toast.success('Catalog entry added') },
    onError: () => toast.error('Failed to add — check supplier/product combination is unique'),
  })
  const updateMut = useMutation({
    mutationFn: (d: typeof form) => apiClient.patch(INVENTORY.SUPPLIER_PRODUCT_DETAIL(editing!.id), { ...d, unit_cost: parseFloat(d.unit_cost) || 0, lead_time_days: parseInt(d.lead_time_days) || 0, min_order_qty: parseInt(d.min_order_qty) || 1 }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['supplier-catalog'] }); setModal(false); setEditing(null); toast.success('Updated') },
    onError: () => toast.error('Failed to update'),
  })
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiClient.delete(INVENTORY.SUPPLIER_PRODUCT_DETAIL(id)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['supplier-catalog'] }); toast.success('Removed from catalog') },
    onError: () => toast.error('Delete failed'),
  })

  function openAdd() { setEditing(null); setForm({ supplier: '', product: '', supplier_sku: '', unit_cost: '', lead_time_days: '0', min_order_qty: '1', is_preferred: false, notes: '' }); setModal(true) }
  function openEdit(sp: SupplierProduct) { setEditing(sp); setForm({ supplier: String(sp.supplier), product: String(sp.product), supplier_sku: sp.supplier_sku, unit_cost: sp.unit_cost, lead_time_days: String(sp.lead_time_days), min_order_qty: String(sp.min_order_qty), is_preferred: sp.is_preferred, notes: sp.notes }); setModal(true) }
  function handleSubmit() { editing ? updateMut.mutate(form) : createMut.mutate(form) }
  const busy = createMut.isPending || updateMut.isPending
  const inp = 'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400'

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3">
        <select value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)} className="border rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400">
          <option value="">All Suppliers</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {canManage && (
          <button onClick={openAdd} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">
            <Plus size={15} /> Link Supplier to Product
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-indigo-400" size={28} /></div>
      ) : catalog.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Truck size={36} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">No supplier–product links yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs tracking-wide">
              <tr>
                {['Product', 'Supplier', 'Supplier SKU', 'Unit Cost', 'Lead Time', 'Min Qty', 'Preferred', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {catalog.map(sp => (
                <tr key={sp.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3 font-medium text-gray-800">{sp.product_name} <span className="text-xs text-gray-400 font-mono ml-1">{sp.product_sku}</span></td>
                  <td className="px-4 py-3 text-gray-600">{sp.supplier_name}</td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{sp.supplier_sku || '—'}</td>
                  <td className="px-4 py-3 text-gray-700">Rs. {parseFloat(sp.unit_cost).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-gray-500">{sp.lead_time_days}d</td>
                  <td className="px-4 py-3 text-gray-500">{sp.min_order_qty}</td>
                  <td className="px-4 py-3">
                    {sp.is_preferred ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        <CheckCircle2 size={10} /> Preferred
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canManage && (
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openEdit(sp)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition"><Pencil size={14} /></button>
                        <button onClick={() => deleteMut.mutate(sp.id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition"><Trash2 size={14} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <Modal open title={editing ? 'Edit Catalog Entry' : 'Link Supplier to Product'} onClose={() => { setModal(false); setEditing(null) }}>
          <div className="space-y-3 p-1">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Supplier *</label>
              <select className={inp} value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} disabled={!!editing}>
                <option value="">— select —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Product *</label>
              <select className={inp} value={form.product} onChange={e => setForm(f => ({ ...f, product: e.target.value }))} disabled={!!editing}>
                <option value="">— select —</option>
                {products.filter(p => !p.is_service).map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Supplier SKU</label>
                <input className={inp} value={form.supplier_sku} onChange={e => setForm(f => ({ ...f, supplier_sku: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Unit Cost (Rs.)</label>
                <input className={inp} type="number" min="0" step="0.01" value={form.unit_cost} onChange={e => setForm(f => ({ ...f, unit_cost: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Lead Time (days)</label>
                <input className={inp} type="number" min="0" value={form.lead_time_days} onChange={e => setForm(f => ({ ...f, lead_time_days: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Min Order Qty</label>
                <input className={inp} type="number" min="1" value={form.min_order_qty} onChange={e => setForm(f => ({ ...f, min_order_qty: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Notes</label>
              <textarea className={inp} rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="sp-preferred" checked={form.is_preferred} onChange={e => setForm(f => ({ ...f, is_preferred: e.target.checked }))} className="rounded accent-indigo-600" />
              <label htmlFor="sp-preferred" className="text-sm text-gray-700">Preferred supplier for this product (used by Auto-Reorder)</label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => { setModal(false); setEditing(null) }} className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleSubmit} disabled={!form.supplier || !form.product || busy} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1">
                {busy && <Loader2 className="animate-spin" size={13} />}
                {editing ? 'Save Changes' : 'Add to Catalog'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Stock Count (Stocktake) Tab ───────────────────────────────────────────────

interface StockCountItem {
  id: number
  product: number
  product_name: string
  product_sku: string
  expected_qty: number
  counted_qty: number | null
  discrepancy: number
  notes: string
}

interface StockCountSession {
  id: number
  count_number: string
  description: string
  status: 'draft' | 'counting' | 'completed' | 'cancelled'
  category: number | null
  category_name: string | null
  total_items: number
  discrepancy_count: number
  created_at: string
  created_by_name: string
  completed_by_name: string | null
  completed_at: string | null
  items: StockCountItem[]
}

const COUNT_STATUS_COLORS: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-600',
  counting:  'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-500',
}

function StockCountsTab({ categories, canManage }: { categories: Category[]; canManage: boolean }) {
  const qc = useQueryClient()
  const [createModal, setCreateModal] = useState(false)
  const [activeSession, setActiveSession] = useState<StockCountSession | null>(null)
  const [newForm, setNewForm] = useState({ description: '', category: '' })
  const [countInputs, setCountInputs] = useState<Record<number, string>>({})

  const { data: sessions = [], isLoading } = useQuery<StockCountSession[]>({
    queryKey: ['stock-counts'],
    queryFn: () => apiClient.get(INVENTORY.STOCK_COUNTS).then(r => Array.isArray(r.data) ? r.data : r.data.data ?? r.data.results ?? []),
  })

  // refresh active session detail
  const { data: sessionDetail, refetch: refetchDetail } = useQuery<StockCountSession>({
    queryKey: ['stock-count-detail', activeSession?.id],
    queryFn: () => apiClient.get(INVENTORY.STOCK_COUNT_DETAIL(activeSession!.id)).then(r => r.data),
    enabled: !!activeSession,
  })

  const createMut = useMutation({
    mutationFn: (d: typeof newForm) => apiClient.post(INVENTORY.STOCK_COUNTS, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['stock-counts'] }); setCreateModal(false); toast.success('Count session created') },
    onError: () => toast.error('Failed to create session'),
  })
  const startMut = useMutation({
    mutationFn: (id: number) => apiClient.post(INVENTORY.STOCK_COUNT_START(id)),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ['stock-counts'] }); setActiveSession(res.data); refetchDetail(); toast.success('Counting started — snapshot taken') },
    onError: () => toast.error('Failed to start'),
  })
  const countItemMut = useMutation({
    mutationFn: ({ id, product, counted_qty, notes }: { id: number; product: number; counted_qty: number; notes?: string }) =>
      apiClient.patch(INVENTORY.STOCK_COUNT_ITEM(id), { product, counted_qty, notes: notes ?? '' }),
    onSuccess: () => { refetchDetail(); toast.success('Saved') },
    onError: () => toast.error('Failed to save count'),
  })
  const completeMut = useMutation({
    mutationFn: (id: number) => apiClient.post(INVENTORY.STOCK_COUNT_COMPLETE(id)),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['stock-counts'] }); qc.invalidateQueries({ queryKey: ['stock-levels'] })
      setActiveSession(null)
      toast.success(`Count completed — ${res.data.adjustments_created} adjustment${res.data.adjustments_created !== 1 ? 's' : ''} applied`)
    },
    onError: () => toast.error('Failed to complete count'),
  })
  const cancelMut = useMutation({
    mutationFn: (id: number) => apiClient.post(INVENTORY.STOCK_COUNT_CANCEL(id)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['stock-counts'] }); setActiveSession(null); toast.success('Session cancelled') },
    onError: () => toast.error('Failed to cancel'),
  })

  const session = sessionDetail ?? activeSession
  const inp = 'border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400'

  if (session) {
    const items = session.items ?? []
    const counted = items.filter(i => i.counted_qty !== null).length
    const progress = items.length > 0 ? Math.round((counted / items.length) * 100) : 0
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <button onClick={() => setActiveSession(null)} className="text-indigo-600 text-sm hover:underline flex items-center gap-1">
              ← Back to sessions
            </button>
            <h2 className="text-lg font-semibold text-gray-800 mt-1">{session.count_number} — {session.description || 'Stock Count'}</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${COUNT_STATUS_COLORS[session.status]}`}>{session.status}</span>
              {session.category_name && <span className="text-xs text-gray-400">Category: {session.category_name}</span>}
              <span className="text-xs text-gray-400">{counted}/{items.length} counted • {progress}%</span>
            </div>
          </div>
          {canManage && session.status === 'counting' && (
            <div className="flex gap-2">
              <button onClick={() => completeMut.mutate(session.id)} disabled={completeMut.isPending || counted === 0}
                className="flex items-center gap-1.5 text-sm bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50">
                {completeMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                Complete Count
              </button>
              <button onClick={() => cancelMut.mutate(session.id)} disabled={cancelMut.isPending}
                className="flex items-center gap-1.5 text-sm bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50">
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Progress bar */}
        {session.status === 'counting' && (
          <div className="mb-4 bg-gray-100 rounded-full h-2">
            <div className="bg-indigo-500 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}

        {items.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">No items in this session.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs tracking-wide">
                <tr>
                  {['Product', 'SKU', 'Expected', 'Counted', 'Discrepancy', ...(session.status === 'counting' && canManage ? [''] : [])].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map(item => {
                  const disc = item.discrepancy
                  const key = item.product
                  return (
                    <tr key={item.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 font-medium text-gray-800">{item.product_name}</td>
                      <td className="px-4 py-3 text-gray-400 font-mono text-xs">{item.product_sku}</td>
                      <td className="px-4 py-3 text-gray-600 text-center">{item.expected_qty}</td>
                      <td className="px-4 py-3 text-center">
                        {item.counted_qty !== null ? (
                          <span className="font-semibold text-gray-800">{item.counted_qty}</span>
                        ) : (
                          <span className="text-gray-300 text-xs italic">not counted</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {item.counted_qty !== null ? (
                          <span className={`font-medium ${disc > 0 ? 'text-green-600' : disc < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                            {disc > 0 ? '+' : ''}{disc}
                          </span>
                        ) : <span className="text-gray-200">—</span>}
                      </td>
                      {session.status === 'counting' && canManage && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 justify-end">
                            <input
                              type="number" min="0"
                              value={countInputs[key] ?? ''}
                              onChange={e => setCountInputs(ci => ({ ...ci, [key]: e.target.value }))}
                              placeholder={item.counted_qty !== null ? String(item.counted_qty) : '0'}
                              className={`${inp} w-20 text-center`}
                            />
                            <button
                              disabled={countInputs[key] === '' || countInputs[key] === undefined || countItemMut.isPending}
                              onClick={() => {
                                const val = parseInt(countInputs[key] ?? '')
                                if (isNaN(val) || val < 0) return
                                countItemMut.mutate({ id: session.id, product: key, counted_qty: val })
                                setCountInputs(ci => { const n = { ...ci }; delete n[key]; return n })
                              }}
                              className="text-xs bg-indigo-600 text-white px-2 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                            >Save</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">Physical inventory count sessions to reconcile expected vs actual stock.</p>
        {canManage && (
          <button onClick={() => setCreateModal(true)} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">
            <Plus size={15} /> New Count
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-indigo-400" size={28} /></div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <ClipboardList size={36} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">No stock count sessions yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs tracking-wide">
              <tr>
                {['Count #', 'Description', 'Status', 'Items', 'Discrepancies', 'Created', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sessions.map(sc => (
                <tr key={sc.id} className="hover:bg-gray-50 transition cursor-pointer" onClick={() => setActiveSession(sc)}>
                  <td className="px-4 py-3 font-mono font-medium text-indigo-700">{sc.count_number}</td>
                  <td className="px-4 py-3 text-gray-700">{sc.description || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${COUNT_STATUS_COLORS[sc.status]}`}>{sc.status}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{sc.total_items}</td>
                  <td className="px-4 py-3">
                    {sc.discrepancy_count > 0 ? (
                      <span className="text-red-600 font-medium">{sc.discrepancy_count}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs"><DateDisplay adDate={sc.created_at} compact /></td>
                  <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                    {canManage && sc.status === 'draft' && (
                      <button
                        onClick={() => startMut.mutate(sc.id)}
                        disabled={startMut.isPending}
                        className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        {startMut.isPending ? <Loader2 size={11} className="animate-spin inline" /> : 'Start →'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createModal && (
        <Modal open title="New Stock Count Session" onClose={() => setCreateModal(false)}>
          <div className="space-y-3 p-1">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Description</label>
              <input className={`w-full ${inp}`} value={newForm.description} onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Monthly physical count — Jan 2025" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Limit to Category (optional)</label>
              <select className={`w-full ${inp}`} value={newForm.category} onChange={e => setNewForm(f => ({ ...f, category: e.target.value }))}>
                <option value="">All categories</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <p className="text-xs text-gray-400">After creating, click "Start →" to snapshot current stock quantities.</p>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setCreateModal(false)} className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={() => createMut.mutate(newForm)} disabled={createMut.isPending} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1">
                {createMut.isPending && <Loader2 className="animate-spin" size={13} />}
                Create Session
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Product Bundles Tab ───────────────────────────────────────────────────────

interface ProductBundle {
  id: number
  bundle: number
  bundle_name?: string
  component: number
  component_name: string
  component_sku: string
  quantity: number
}

function BundlesTab({ products, canManage }: { products: Product[]; canManage: boolean }) {
  const qc = useQueryClient()
  const [filterBundle, setFilterBundle] = useState<number | ''>('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ bundle: '' as number | '', component: '' as number | '', quantity: '1' })

  const bundleProducts = products.filter(p => p.is_bundle)

  const { data: components = [], isLoading } = useQuery<ProductBundle[]>({
    queryKey: ['product-bundles', filterBundle],
    queryFn: () => {
      const url = filterBundle ? `${INVENTORY.PRODUCT_BUNDLES}?bundle=${filterBundle}` : INVENTORY.PRODUCT_BUNDLES
      return apiClient.get(url).then(r => Array.isArray(r.data) ? r.data : r.data.data ?? r.data.results ?? [])
    },
  })

  const createMut = useMutation({
    mutationFn: (data: object) => apiClient.post(INVENTORY.PRODUCT_BUNDLES, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['product-bundles'] }); setModal(false); setForm({ bundle: '', component: '', quantity: '1' }); toast.success('Component added') },
    onError: () => toast.error('Failed to add component'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiClient.delete(INVENTORY.PRODUCT_BUNDLE_DETAIL(id)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['product-bundles'] }); toast.success('Removed') },
    onError: () => toast.error('Failed to remove'),
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-700 flex items-center gap-2"><Package size={16} className="text-indigo-400" /> Product Bundles</h2>
        {canManage && (
          <button onClick={() => setModal(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition">
            <Plus size={14} /> Add Component
          </button>
        )}
      </div>

      <div className="mb-4 flex items-center gap-3">
        <span className="text-sm text-gray-500">Filter by bundle:</span>
        <select value={filterBundle} onChange={e => setFilterBundle(e.target.value ? Number(e.target.value) : '')}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">All bundles</option>
          {bundleProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {bundleProducts.length === 0 && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
          No bundle products yet. Create a product with <strong>is_bundle</strong> enabled, then add its components here.
        </div>
      )}

      {isLoading ? (
        <div className="p-10 text-center text-gray-400 flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading…</div>
      ) : components.length === 0 ? (
        <div className="p-10 text-center"><Package size={32} className="text-gray-200 mx-auto mb-2" /><p className="text-gray-400 text-sm">No bundle components yet</p></div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3 text-left">Bundle</th>
                <th className="px-5 py-3 text-left">Component</th>
                <th className="px-5 py-3 text-left">SKU</th>
                <th className="px-5 py-3 text-center">Qty</th>
                {canManage && <th className="px-5 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {components.map(c => {
                const bundleProd = bundleProducts.find(p => p.id === c.bundle)
                return (
                  <tr key={c.id}>
                    <td className="px-5 py-3 font-medium text-gray-700">{bundleProd?.name ?? `#${c.bundle}`}</td>
                    <td className="px-5 py-3 text-gray-800">{c.component_name}</td>
                    <td className="px-5 py-3 font-mono text-xs text-gray-400">{c.component_sku}</td>
                    <td className="px-5 py-3 text-center font-medium text-indigo-600">{c.quantity}</td>
                    {canManage && (
                      <td className="px-5 py-3 text-right">
                        <button onClick={() => deleteMut.mutate(c.id)} title="Remove" className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition"><Trash2 size={14} /></button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <Modal open title="Add Bundle Component" onClose={() => { setModal(false); setForm({ bundle: '', component: '', quantity: '1' }) }}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bundle Product</label>
              <select value={form.bundle} onChange={e => setForm(f => ({ ...f, bundle: e.target.value ? Number(e.target.value) : '' }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">Select bundle…</option>
                {bundleProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Component Product</label>
              <select value={form.component} onChange={e => setForm(f => ({ ...f, component: e.target.value ? Number(e.target.value) : '' }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">Select component…</option>
                {products.filter(p => !p.is_bundle || p.id !== form.bundle).map(p => <option key={p.id} value={p.id}>{p.name} {p.sku ? `(${p.sku})` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
              <input type="number" min={1} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => createMut.mutate({ bundle: form.bundle, component: form.component, quantity: Number(form.quantity) })}
                disabled={!form.bundle || !form.component || createMut.isPending}
                className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50">
                {createMut.isPending ? 'Adding…' : 'Add Component'}
              </button>
              <button onClick={() => { setModal(false); setForm({ bundle: '', component: '', quantity: '1' }) }}
                className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 transition">
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Supplier Payments Tab ─────────────────────────────────────────────────────

interface SupplierPaymentRecord {
  id: number
  supplier: number
  supplier_name: string
  purchase_order: number | null
  po_number: string | null
  amount: string
  payment_date: string
  payment_method: string
  reference: string
  notes: string
  recorded_by_name: string | null
  created_at: string
}

function SupplierPaymentsTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient()
  const [filterSupplier, setFilterSupplier] = useState<number | ''>('')
  const [modal, setModal] = useState(false)
  const emptyForm = { supplier: '' as number | '', purchase_order: '' as number | '', amount: '', payment_date: new Date().toISOString().slice(0, 10), payment_method: 'bank_transfer', reference: '', notes: '' }
  const [form, setForm] = useState({ ...emptyForm })

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: () => apiClient.get(INVENTORY.SUPPLIERS).then(r => Array.isArray(r.data) ? r.data : r.data.data ?? r.data.results ?? []),
  })

  const { data: pos = [] } = useQuery<PurchaseOrder[]>({
    queryKey: ['purchase-orders'],
    queryFn: () => apiClient.get(INVENTORY.PURCHASE_ORDERS).then(r => Array.isArray(r.data) ? r.data : r.data.data ?? r.data.results ?? []),
    enabled: !!form.supplier,
  })

  const filteredPos = pos.filter(po => po.supplier === form.supplier && po.status !== 'cancelled')

  const { data: payments = [], isLoading } = useQuery<SupplierPaymentRecord[]>({
    queryKey: ['supplier-payments', filterSupplier],
    queryFn: () => {
      const url = filterSupplier ? `${INVENTORY.SUPPLIER_PAYMENTS}?supplier=${filterSupplier}` : INVENTORY.SUPPLIER_PAYMENTS
      return apiClient.get(url).then(r => Array.isArray(r.data) ? r.data : r.data.data ?? r.data.results ?? [])
    },
  })

  const { data: summary } = useQuery({
    queryKey: ['supplier-payment-summary'],
    queryFn: () => apiClient.get(INVENTORY.SUPPLIER_PAYMENT_SUMMARY).then(r => r.data),
  })

  const createMut = useMutation({
    mutationFn: (data: object) => apiClient.post(INVENTORY.SUPPLIER_PAYMENTS, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-payments'] })
      qc.invalidateQueries({ queryKey: ['supplier-payment-summary'] })
      setModal(false)
      setForm({ ...emptyForm })
      toast.success('Payment recorded')
    },
    onError: () => toast.error('Failed to record payment'),
  })

  const METHOD_LABELS: Record<string, string> = {
    cash: 'Cash', bank_transfer: 'Bank Transfer', cheque: 'Cheque',
    mobile_banking: 'Mobile Banking', other: 'Other',
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-700 flex items-center gap-2"><DollarSign size={16} className="text-indigo-400" /> Supplier Payments</h2>
        {canManage && (
          <button onClick={() => setModal(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition">
            <Plus size={14} /> Record Payment
          </button>
        )}
      </div>

      {/* Outstanding Summary */}
      {summary?.rows?.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
          {summary.rows.filter((r: {outstanding: number}) => r.outstanding > 0).slice(0, 6).map((r: {supplier_id: number; supplier_name: string; total_po_amount: number; total_paid: number; outstanding: number}) => (
            <div key={r.supplier_id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="text-sm font-medium text-gray-700 mb-1">{r.supplier_name}</div>
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>PO Total</span><span>Rs. {r.total_po_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-400 mb-2">
                <span>Paid</span><span>Rs. {r.total_paid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold text-red-600">
                <span>Outstanding</span><span>Rs. {r.outstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mb-4 flex items-center gap-3">
        <span className="text-sm text-gray-500">Filter by supplier:</span>
        <select value={filterSupplier} onChange={e => setFilterSupplier(e.target.value ? Number(e.target.value) : '')}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">All suppliers</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="p-10 text-center text-gray-400 flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading…</div>
      ) : payments.length === 0 ? (
        <div className="p-10 text-center"><DollarSign size={32} className="text-gray-200 mx-auto mb-2" /><p className="text-gray-400 text-sm">No payments recorded yet</p></div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3 text-left">Supplier</th>
                <th className="px-5 py-3 text-left">PO</th>
                <th className="px-5 py-3 text-right">Amount</th>
                <th className="px-5 py-3 text-left">Date</th>
                <th className="px-5 py-3 text-left">Method</th>
                <th className="px-5 py-3 text-left">Reference</th>
                <th className="px-5 py-3 text-left">Recorded By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payments.map(p => (
                <tr key={p.id}>
                  <td className="px-5 py-3 font-medium text-gray-800">{p.supplier_name}</td>
                  <td className="px-5 py-3 font-mono text-xs text-indigo-600">{p.po_number ?? '—'}</td>
                  <td className="px-5 py-3 text-right font-semibold text-gray-800">Rs. {parseFloat(p.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td className="px-5 py-3 text-gray-600"><DateDisplay adDate={p.payment_date} compact /></td>
                  <td className="px-5 py-3 text-gray-500">{METHOD_LABELS[p.payment_method] ?? p.payment_method}</td>
                  <td className="px-5 py-3 text-gray-400 font-mono text-xs">{p.reference || '—'}</td>
                  <td className="px-5 py-3 text-gray-400 text-xs">{p.recorded_by_name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <Modal open title="Record Supplier Payment" onClose={() => { setModal(false); setForm({ ...emptyForm }) }}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
              <select value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value ? Number(e.target.value) : '', purchase_order: '' }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">Select supplier…</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Order (optional)</label>
              <select value={form.purchase_order} onChange={e => setForm(f => ({ ...f, purchase_order: e.target.value ? Number(e.target.value) : '' }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">No specific PO</option>
                {filteredPos.map(po => <option key={po.id} value={po.id}>{po.po_number} — {po.status}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (Rs.)</label>
                <input type="number" min={0} step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date</label>
                <input type="date" value={form.payment_date} onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                <select value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cheque">Cheque</option>
                  <option value="mobile_banking">Mobile Banking</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
                <input type="text" placeholder="Cheque no., txn ID…" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => createMut.mutate({ ...form, purchase_order: form.purchase_order || null })}
                disabled={!form.supplier || !form.amount || createMut.isPending}
                className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50">
                {createMut.isPending ? 'Saving…' : 'Record Payment'}
              </button>
              <button onClick={() => { setModal(false); setForm({ ...emptyForm }) }}
                className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 transition">
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Warranty Tab ──────────────────────────────────────────────────────────────

function WarrantyTab({ products, canManage }: { products: Product[]; canManage: boolean }) {
  const [filterProduct, setFilterProduct] = useState<number | ''>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({ product: '' as number | '', serial_number: '', warranty_expires: '', notes: '' })
  const qc = useQueryClient()

  const warrantyProducts = products.filter(p => !!(p as any).has_warranty)

  const params: Record<string, unknown> = {}
  if (filterProduct !== '') params.product = filterProduct
  if (filterStatus) params.status = filterStatus

  const { data: serials = [], isLoading, refetch } = useQuery<SerialNumber[]>({
    queryKey: ['serial-numbers', params],
    queryFn: () =>
      apiClient
        .get(INVENTORY.SERIAL_NUMBERS, { params })
        .then(r => Array.isArray(r.data) ? r.data : r.data.data ?? r.data.results ?? []),
    staleTime: 30_000,
  })

  const addMutation = useMutation({
    mutationFn: () =>
      apiClient.post(INVENTORY.SERIAL_NUMBERS, {
        product:         addForm.product,
        serial_number:   addForm.serial_number.trim(),
        warranty_expires: addForm.warranty_expires || null,
        notes:            addForm.notes.trim(),
      }),
    onSuccess: () => {
      toast.success('Serial number added')
      qc.invalidateQueries({ queryKey: ['serial-numbers'] })
      setAddOpen(false)
      setAddForm({ product: '', serial_number: '', warranty_expires: '', notes: '' })
    },
    onError: () => toast.error('Failed to add serial number'),
  })

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  function warrantyStatus(sn: SerialNumber): { label: string; color: string; bg: string; icon: React.ReactNode } {
    if (!sn.warranty_expires) return { label: 'No Expiry Set', color: 'text-gray-500', bg: 'bg-gray-100', icon: <ShieldOff size={13} /> }
    const exp = new Date(sn.warranty_expires)
    const daysLeft = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (daysLeft < 0)  return { label: `Expired ${Math.abs(daysLeft)}d ago`, color: 'text-red-700',    bg: 'bg-red-100',    icon: <ShieldOff   size={13} /> }
    if (daysLeft <= 30) return { label: `Expiring in ${daysLeft}d`,           color: 'text-amber-700',  bg: 'bg-amber-100',  icon: <ShieldAlert size={13} /> }
    return { label: `Valid · ${daysLeft}d left`,                               color: 'text-green-700', bg: 'bg-green-100',  icon: <ShieldCheck size={13} /> }
  }

  const STATUS_LABELS: Record<string, string> = { available: 'Available', used: 'Sold / Used', damaged: 'Damaged', returned: 'Returned' }
  const STATUS_COLORS: Record<string, string> = { available: 'text-blue-700 bg-blue-100', used: 'text-purple-700 bg-purple-100', damaged: 'text-red-700 bg-red-100', returned: 'text-gray-700 bg-gray-100' }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap gap-2">
          <select
            value={filterProduct}
            onChange={e => setFilterProduct(e.target.value === '' ? '' : Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All warranty products</option>
            {warrantyProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All statuses</option>
            <option value="available">Available</option>
            <option value="used">Sold / Used</option>
            <option value="damaged">Damaged</option>
            <option value="returned">Returned</option>
          </select>
        </div>
        {canManage && (
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            <Plus size={15} /> Add Serial Number
          </button>
        )}
      </div>

      {/* Summary bar */}
      {serials.length > 0 && (() => {
        const exp    = serials.filter(s => s.warranty_expires && new Date(s.warranty_expires) < today).length
        const soon   = serials.filter(s => {
          if (!s.warranty_expires) return false
          const d = Math.ceil((new Date(s.warranty_expires).getTime() - today.getTime()) / 86400000)
          return d >= 0 && d <= 30
        }).length
        const valid  = serials.filter(s => s.warranty_expires && new Date(s.warranty_expires) > today && Math.ceil((new Date(s.warranty_expires).getTime() - today.getTime()) / 86400000) > 30).length
        return (
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Total',            value: serials.length, color: 'text-gray-800',   bg: 'bg-white border border-gray-200' },
              { label: 'Under Warranty',   value: valid,          color: 'text-green-700',  bg: 'bg-green-50 border border-green-200' },
              { label: 'Expiring Soon',    value: soon,           color: 'text-amber-700',  bg: 'bg-amber-50 border border-amber-200' },
              { label: 'Expired',          value: exp,            color: 'text-red-700',    bg: 'bg-red-50 border border-red-200' },
            ].map(s => (
              <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center`}>
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )
      })()}

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-indigo-400" /></div>
      ) : serials.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <ShieldCheck size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-base font-semibold">No serial numbers found</p>
          <p className="text-sm mt-1">Add serial numbers to warranty products to start tracking.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left">Serial Number</th>
                <th className="px-4 py-3 text-left">Product</th>
                <th className="px-4 py-3 text-left">Stock Status</th>
                <th className="px-4 py-3 text-left">Warranty Status</th>
                <th className="px-4 py-3 text-left">Expires</th>
                <th className="px-4 py-3 text-left">Sold / Used At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {serials.map(sn => {
                const ws = warrantyStatus(sn)
                return (
                  <tr key={sn.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono font-medium text-gray-800">{sn.serial_number}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{sn.product_name}</p>
                      <p className="text-xs text-gray-400">{sn.product_sku}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[sn.status] ?? 'text-gray-600 bg-gray-100'}`}>
                        {STATUS_LABELS[sn.status] ?? sn.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${ws.color} ${ws.bg}`}>
                        {ws.icon} {ws.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {sn.warranty_expires ? new Date(sn.warranty_expires).toLocaleDateString() : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {sn.used_at ? new Date(sn.used_at).toLocaleDateString() : <span className="text-gray-300">—</span>}
                      {sn.reference_type && sn.reference_id ? (
                        <span className="ml-1 text-indigo-500">#{sn.reference_id}</span>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Serial Number Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Serial Number" width="max-w-md">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Product *</label>
            <select
              value={addForm.product}
              onChange={e => setAddForm(f => ({ ...f, product: e.target.value === '' ? '' : Number(e.target.value) }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Select warranty product…</option>
              {warrantyProducts.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Serial / IMEI Number *</label>
            <input
              value={addForm.serial_number}
              onChange={e => setAddForm(f => ({ ...f, serial_number: e.target.value }))}
              placeholder="e.g. SN-20260001 or IMEI"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Warranty Expiry Date</label>
            <input
              type="date"
              value={addForm.warranty_expires}
              onChange={e => setAddForm(f => ({ ...f, warranty_expires: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {/* Auto-suggest from product warranty_months */}
            {addForm.product !== '' && (() => {
              const prod = warrantyProducts.find(p => p.id === addForm.product)
              const months = (prod as any)?.warranty_months
              if (!months) return null
              const suggested = new Date()
              suggested.setMonth(suggested.getMonth() + months)
              const iso = suggested.toISOString().split('T')[0]
              return (
                <button
                  onClick={() => setAddForm(f => ({ ...f, warranty_expires: iso }))}
                  className="text-xs text-indigo-600 hover:underline mt-1"
                >
                  Use product default: {months}m → {suggested.toLocaleDateString()}
                </button>
              )
            })()}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea
              value={addForm.notes}
              onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="Optional notes"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button
              onClick={() => addMutation.mutate()}
              disabled={!addForm.product || !addForm.serial_number.trim() || addMutation.isPending}
              className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
            >
              {addMutation.isPending && <Loader2 size={13} className="animate-spin" />}
              Add Serial Number
            </button>
            <button onClick={() => setAddOpen(false)} className="flex-1 border border-gray-300 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = 'products' | 'movements' | 'low-stock' | 'categories' | 'uom' | 'variants' | 'suppliers' | 'purchase-orders' | 'returns' | 'supplier-catalog' | 'stock-counts' | 'bundles' | 'supplier-payments' | 'warranty'

export default function InventoryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = (searchParams.get('tab') ?? 'products') as Tab
  function setActiveTab(tab: Tab) { setSearchParams({ tab }, { replace: true }) }
  const { can } = usePermissions()
  const canManage = can('can_manage_inventory')

  const { data: products = [], isLoading: loadingProducts } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => apiClient.get(INVENTORY.PRODUCTS).then(r => Array.isArray(r.data) ? r.data : r.data.data ?? r.data.results ?? []),
  })
  const { data: stockLevels = [] } = useQuery<StockLevel[]>({
    queryKey: ['stock-levels'],
    queryFn: () => apiClient.get(INVENTORY.STOCK_LEVELS).then(r => Array.isArray(r.data) ? r.data : r.data.data ?? r.data.results ?? []),
  })
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['inventory-categories'],
    queryFn: () => apiClient.get(INVENTORY.CATEGORIES).then(r => Array.isArray(r.data) ? r.data : r.data.data ?? r.data.results ?? []),
  })

  // Badge count for Low Stock tab
  const lowStockCount = products.filter(p => {
    if (p.is_service || p.track_stock === false) return false
    const sl = stockLevels.find(s => s.product === p.id)
    return (sl?.quantity_on_hand ?? 0) <= (p.reorder_level ?? 0)
  }).length

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'products',        label: 'Products',         icon: <Package       size={15} /> },
    { id: 'movements',       label: 'Stock Movements',  icon: <Clock         size={15} /> },
    { id: 'low-stock',       label: 'Low Stock Alerts', icon: <AlertTriangle size={15} /> },
    { id: 'categories',      label: 'Categories',       icon: <Layers        size={15} /> },
    { id: 'uom',             label: 'Units of Measure', icon: <Scale         size={15} /> },
    { id: 'variants',        label: 'Variants',         icon: <Layers        size={15} /> },
    { id: 'suppliers',       label: 'Suppliers',        icon: <Truck         size={15} /> },
    { id: 'purchase-orders', label: 'Purchase Orders',  icon: <ShoppingCart  size={15} /> },
    { id: 'returns',          label: 'Returns',            icon: <RotateCcw     size={15} /> },
    { id: 'supplier-catalog', label: 'Supplier Catalog',   icon: <Truck         size={15} /> },
    { id: 'stock-counts',       label: 'Stock Counts',       icon: <ClipboardList size={15} /> },
    { id: 'bundles',            label: 'Bundles',            icon: <Package       size={15} /> },
    { id: 'supplier-payments',  label: 'Supplier Payments',  icon: <DollarSign    size={15} /> },
    { id: 'warranty',           label: 'Warranty',           icon: <ShieldCheck   size={15} /> },
  ]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Package size={22} className="text-indigo-400" /> Inventory
        </h1>
        <p className="text-xs text-gray-400 mt-0.5">Products, stock levels, and movements</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit flex-wrap">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === tab.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {tab.icon}
            {tab.label}
            {tab.id === 'low-stock' && lowStockCount > 0 && (
              <span className="ml-0.5 text-xs bg-red-500 text-white rounded-full px-1.5 py-0.5 leading-none min-w-[18px] text-center">
                {lowStockCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'products'         && <ProductsTab        products={products} stockLevels={stockLevels} categories={categories} loadingProducts={loadingProducts} canManage={canManage} />}
      {activeTab === 'movements'         && <MovementsTab        products={products} canManage={canManage} />}
      {activeTab === 'low-stock'         && <LowStockTab         products={products} canManage={canManage} />}
      {activeTab === 'categories'        && <CategoriesTab       categories={categories} canManage={canManage} />}
      {activeTab === 'uom'               && <UoMTab              canManage={canManage} />}
      {activeTab === 'variants'          && <VariantsTab         products={products} canManage={canManage} />}
      {activeTab === 'suppliers'         && <SuppliersTab        canManage={canManage} />}
      {activeTab === 'purchase-orders'   && <PurchaseOrdersTab   products={products} canManage={canManage} />}
      {activeTab === 'returns'           && <ReturnsTab          products={products} canManage={canManage} />}
      {activeTab === 'supplier-catalog'  && <SupplierCatalogTab  products={products} canManage={canManage} />}
      {activeTab === 'stock-counts'      && <StockCountsTab      categories={categories} canManage={canManage} />}
      {activeTab === 'bundles'            && <BundlesTab          products={products}     canManage={canManage} />}
      {activeTab === 'supplier-payments'  && <SupplierPaymentsTab                         canManage={canManage} />}
      {activeTab === 'warranty'          && <WarrantyTab         products={products}     canManage={canManage} />}
    </div>
  )
}

