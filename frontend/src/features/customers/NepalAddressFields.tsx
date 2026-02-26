/**
 * Cascading Nepal address selects:
 * Province → District → Municipality → Ward No + Street
 *
 * All fields are optional — nothing is marked required here; callers
 * apply their own validation.
 */
import { useMemo } from 'react'
import {
  PROVINCES,
  getDistricts,
  getMunicipalities,
  getWards,
} from '../../data/nepalAddress'

export interface NepalAddressValue {
  province:     string
  district:     string
  municipality: string
  ward_no:      string
  street:       string
}

interface Props {
  value:    NepalAddressValue
  onChange: (next: NepalAddressValue) => void
  /** optional extra class overrides for inputs/selects */
  inputCls?: string
  errors?: Partial<Record<keyof NepalAddressValue, string>>
}

const BASE =
  'w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500'
const ERR_BORDER = 'border-red-400'
const OK_BORDER  = 'border-gray-300'

function cls(extra = '', hasErr = false) {
  return `${BASE} ${hasErr ? ERR_BORDER : OK_BORDER} ${extra}`.trim()
}

export default function NepalAddressFields({ value, onChange, inputCls = '', errors = {} }: Props) {
  const districts     = useMemo(() => getDistricts(value.province), [value.province])
  const municipalities = useMemo(
    () => getMunicipalities(value.province, value.district),
    [value.province, value.district],
  )
  const wards = useMemo(
    () => getWards(value.province, value.district, value.municipality),
    [value.province, value.district, value.municipality],
  )

  function setProvince(province: string) {
    onChange({ ...value, province, district: '', municipality: '', ward_no: '' })
  }
  function setDistrict(district: string) {
    onChange({ ...value, district, municipality: '', ward_no: '' })
  }
  function setMunicipality(municipality: string) {
    onChange({ ...value, municipality, ward_no: '' })
  }
  function set(field: keyof NepalAddressValue) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange({ ...value, [field]: e.target.value })
  }

  return (
    <div className="space-y-2">

      {/* Province */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Province</label>
        <select
          value={value.province}
          onChange={e => setProvince(e.target.value)}
          className={cls(inputCls, !!errors.province)}
        >
          <option value="">— Select Province —</option>
          {PROVINCES.map(p => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
        {errors.province && <p className="text-xs text-red-500 mt-1">{errors.province}</p>}
      </div>

      {/* District */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">District</label>
        {districts.length > 0 ? (
          <select
            value={value.district}
            onChange={e => setDistrict(e.target.value)}
            className={cls(inputCls, !!errors.district)}
          >
            <option value="">— Select District —</option>
            {districts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        ) : (
          <input
            type="text"
            value={value.district}
            onChange={set('district')}
            placeholder="e.g. Kathmandu"
            className={cls(inputCls, !!errors.district)}
          />
        )}
        {errors.district && <p className="text-xs text-red-500 mt-1">{errors.district}</p>}
      </div>

      {/* Municipality */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Municipality</label>
        {municipalities.length > 0 ? (
          <select
            value={value.municipality}
            onChange={e => setMunicipality(e.target.value)}
            className={cls(inputCls, !!errors.municipality)}
          >
            <option value="">— Select Municipality —</option>
            {municipalities.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        ) : (
          <input
            type="text"
            value={value.municipality}
            onChange={set('municipality')}
            placeholder="e.g. Kathmandu Metropolitan City"
            className={cls(inputCls, !!errors.municipality)}
          />
        )}
        {errors.municipality && <p className="text-xs text-red-500 mt-1">{errors.municipality}</p>}
      </div>

      {/* Ward No + Street */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Ward No</label>
          {wards.length > 0 ? (
            <select
              value={value.ward_no}
              onChange={set('ward_no')}
              className={cls(inputCls, !!errors.ward_no)}
            >
              <option value="">—</option>
              {wards.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          ) : (
            <input
              type="text"
              value={value.ward_no}
              onChange={set('ward_no')}
              placeholder="e.g. 4"
              className={cls(inputCls, !!errors.ward_no)}
            />
          )}
          {errors.ward_no && <p className="text-xs text-red-500 mt-1">{errors.ward_no}</p>}
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">Street / Tole</label>
          <input
            type="text"
            value={value.street}
            onChange={set('street')}
            placeholder="e.g. New Road, Bishal Nagar"
            className={cls(inputCls, !!errors.street)}
          />
          {errors.street && <p className="text-xs text-red-500 mt-1">{errors.street}</p>}
        </div>
      </div>

    </div>
  )
}
