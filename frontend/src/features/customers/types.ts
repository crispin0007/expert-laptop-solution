export interface Customer {
  id: number
  customer_number: string
  type: 'individual' | 'organization'
  name: string
  email: string
  phone: string
  // Nepal hierarchical address
  province: string
  district: string
  municipality: string
  ward_no: string
  street: string
  full_address: string   // read-only, assembled by API
  vat_number: string
  pan_number: string
  notes: string
  is_active: boolean
  is_deleted: boolean
  created_by: number | null
  created_by_name: string
  created_at: string
  updated_at: string
}
