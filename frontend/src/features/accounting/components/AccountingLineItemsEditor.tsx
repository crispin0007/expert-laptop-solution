import { Plus, X } from 'lucide-react'

export type AccountingLineItemDraft = {
  description: string
  qty: string
  unit_price: string
  discount: string
  line_type: 'service' | 'product'
  product_id?: number
  service_id?: number
}

export const emptyAccountingLineItem = (): AccountingLineItemDraft => ({
  description: '',
  qty: '1',
  unit_price: '',
  discount: '0',
  line_type: 'service',
})

interface ServiceItem {
  id: number
  name: string
  unit_price: string
}
interface InventoryProduct {
  id: number
  name: string
  unit_price: string
  sku: string
}

interface Props {
  lines: AccountingLineItemDraft[]
  onChange: (lines: AccountingLineItemDraft[]) => void
  products?: InventoryProduct[]
  services?: ServiceItem[]
  showDiscount?: boolean
  onAddLine?: () => void
  onRemoveLine?: (index: number) => void
}

export function AccountingLineItemsEditor({
  lines,
  onChange,
  products = [],
  services = [],
  showDiscount = false,
  onAddLine,
  onRemoveLine,
}: Props) {
  function setLine<K extends keyof AccountingLineItemDraft>(idx: number, key: K, value: string | number | undefined) {
    onChange(lines.map((line, i) => i === idx ? { ...line, [key]: value } : line))
  }

  function selectProduct(idx: number, productId: number) {
    const product = products.find(p => p.id === productId)
    if (!product) return
    onChange(lines.map((line, i) => i === idx
      ? { ...line, product_id: product.id, service_id: undefined, description: product.name, unit_price: product.unit_price }
      : line
    ))
  }

  function selectService(idx: number, serviceId: number) {
    const service = services.find(s => s.id === serviceId)
    if (!service) return
    onChange(lines.map((line, i) => i === idx
      ? { ...line, service_id: service.id, product_id: undefined, description: service.name, unit_price: service.unit_price }
      : line
    ))
  }

  function addLine() {
    if (onAddLine) {
      onAddLine()
      return
    }
    onChange([...lines, emptyAccountingLineItem()])
  }

  function removeLine(idx: number) {
    if (onRemoveLine) {
      onRemoveLine(idx)
      return
    }
    onChange(lines.filter((_, i) => i !== idx))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-600">Line Items</span>
        <button
          type="button"
          onClick={addLine}
          className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
        >
          <Plus size={12} /> Add line
        </button>
      </div>
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-gray-500 font-medium">Description</th>
              <th className="px-2 py-2 text-left text-gray-500 font-medium w-24">Type</th>
              <th className="px-2 py-2 text-right text-gray-500 font-medium w-16">Qty</th>
              <th className="px-2 py-2 text-right text-gray-500 font-medium w-28">Unit Price</th>
              {showDiscount && <th className="px-2 py-2 text-right text-gray-500 font-medium w-16">Disc%</th>}
              <th className="px-2 py-2 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lines.map((line, index) => (
              <tr key={index}>
                <td className="px-2 py-1.5">
                  {line.line_type === 'product' ? (
                    <select
                      value={line.product_id ?? ''}
                      onChange={e => {
                        const value = e.target.value
                        if (value) selectProduct(index, Number(value))
                        else setLine(index, 'product_id', undefined)
                      }}
                      className="w-full border-0 outline-none text-xs bg-transparent"
                    >
                      <option value="">— Select product —</option>
                      {products.map(product => (
                        <option key={product.id} value={product.id}>
                          {product.name}{product.sku ? ` (${product.sku})` : ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      {services.length > 0 && (
                        <select
                          value={line.service_id?.toString() ?? ''}
                          onChange={e => {
                            const value = e.target.value
                            if (value) selectService(index, Number(value))
                            else setLine(index, 'service_id', undefined)
                          }}
                          className="border-0 outline-none text-xs bg-transparent text-gray-400 w-full"
                        >
                          <option value="">From catalog…</option>
                          {services.map(service => (
                            <option key={service.id} value={service.id}>{service.name}</option>
                          ))}
                        </select>
                      )}
                      {line.service_id ? (
                        <span className="text-xs text-gray-700 truncate">{line.description}</span>
                      ) : (
                        <input
                          data-lpignore="true"
                          value={line.description}
                          onChange={e => setLine(index, 'description', e.target.value)}
                          placeholder="Or enter description"
                          className="border-0 outline-none text-xs bg-transparent w-full"
                          required
                        />
                      )}
                    </div>
                  )}
                </td>
                <td className="px-2 py-1.5">
                  <select
                    value={line.line_type}
                    onChange={e => {
                      const newType = e.target.value as 'service' | 'product'
                      onChange(lines.map((ln, j) => j === index
                        ? { ...ln, line_type: newType, service_id: undefined, product_id: undefined, description: '', unit_price: '' }
                        : ln
                      ))
                    }}
                    className="w-full border-0 outline-none text-xs bg-transparent"
                  >
                    <option value="service">Service</option>
                    <option value="product">Product</option>
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <input
                    data-lpignore="true"
                    type="number"
                    min="1"
                    value={line.qty}
                    onChange={e => setLine(index, 'qty', e.target.value)}
                    className="w-full border-0 outline-none text-xs text-right bg-transparent"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    data-lpignore="true"
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.unit_price}
                    onChange={e => setLine(index, 'unit_price', e.target.value)}
                    placeholder="0.00"
                    className="w-full border-0 outline-none text-xs text-right bg-transparent"
                    required
                  />
                </td>
                {showDiscount && (
                  <td className="px-2 py-1.5">
                    <input
                      data-lpignore="true"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={line.discount}
                      onChange={e => setLine(index, 'discount', e.target.value)}
                      className="w-full border-0 outline-none text-xs text-right bg-transparent"
                    />
                  </td>
                )}
                <td className="px-2 py-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => removeLine(index)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <X size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
