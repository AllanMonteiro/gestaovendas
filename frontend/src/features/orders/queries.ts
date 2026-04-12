import { api } from '../../core/api'
import type { DeliveryOrder, DeliveryOrdersResponse, KitchenOrder } from './types'

export const normalizeDeliveryOrders = (payload: DeliveryOrdersResponse): DeliveryOrder[] => {
  if (Array.isArray(payload)) {
    return payload
  }
  if (payload && !Array.isArray(payload) && 'results' in payload && Array.isArray(payload.results)) {
    return payload.results
  }
  if (payload && !Array.isArray(payload) && 'data' in payload && Array.isArray(payload.data)) {
    return payload.data
  }
  return []
}

export const listDeliveryOrders = async () => {
  const response = await api.get<DeliveryOrdersResponse>('/api/orders/')
  return normalizeDeliveryOrders(response.data)
}

export const listKitchenQueue = async () => {
  const response = await api.get<KitchenOrder[]>('/api/kitchen/queue')
  return response.data
}
