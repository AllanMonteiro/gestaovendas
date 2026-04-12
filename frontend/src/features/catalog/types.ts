export type Category = {
  id: number
  name: string
  image_url?: string | null
  price?: string | null
  sort_order?: number
  active?: boolean
}

export type Product = {
  id: number
  category: number
  name: string
  description?: string | null
  active: boolean
  sold_by_weight: boolean
  image_url?: string | null
  stock: string | number
}

export type ProductPrice = {
  id?: number
  product?: number
  store_id?: number
  price: string | number
  cost: string | number
  freight: string | number
  other: string | number
  tax_pct: string | number
  overhead_pct: string | number
  margin_pct: string | number
  updated_at?: string
  ideal_price: string | number
  cost_base?: string | number
  profit: string | number
}
