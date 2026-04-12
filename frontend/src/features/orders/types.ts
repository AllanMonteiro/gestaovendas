export type DeliveryOrderItem = {
  product_name: string
  quantity: string | number
  unit_price?: string | null
  total?: string | null
}

export type DeliveryOrder = {
  id: string
  customer_name: string
  customer_phone: string
  address: string
  subtotal: string
  delivery_fee: string
  total: string
  status: string
  created_at: string
  source: string
  pix_payload?: string | null
  items?: DeliveryOrderItem[]
}

export type DeliveryOrdersResponse =
  | DeliveryOrder[]
  | {
      results?: DeliveryOrder[]
    }
  | {
      data?: DeliveryOrder[]
    }

export type KitchenOrderItem = {
  id: number
  product?: number
  product_name?: string | null
  qty?: string | number
  total?: string | number
  weight_grams?: number | null
  notes?: string | null
}

export type KitchenOrder = {
  id: string
  display_number?: string
  status: string
  created_at: string
  subtotal?: string | number
  discount?: string | number
  total?: string | number
  items: KitchenOrderItem[]
}
