import { api } from '../../core/api'
import type { DeliveryOrder } from './types'

export type UpdateDeliveryOrderStatusInput = {
  id: string
  status: string
}

export const updateDeliveryOrderStatus = async ({ id, status }: UpdateDeliveryOrderStatusInput) => {
  const response = await api.patch<DeliveryOrder>(`/api/orders/${id}/`, { status })
  return response.data
}

export const deleteDeliveryOrder = async (id: string) => {
  await api.delete(`/api/orders/${id}/`)
  return id
}

export type KitchenOrderActionInput = {
  orderId: string
}

export const markKitchenOrderReady = async ({ orderId }: KitchenOrderActionInput) => {
  await api.post(`/api/kitchen/${orderId}/ready`)
  return { orderId, status: 'READY' as const }
}

export const moveKitchenOrderBackToPrep = async ({ orderId }: KitchenOrderActionInput) => {
  await api.post(`/api/kitchen/${orderId}/back-to-prep`)
  return { orderId, status: 'SENT' as const }
}

export const queueKitchenOrderPrint = async ({ orderId }: KitchenOrderActionInput) => {
  await api.post(`/api/kitchen/${orderId}/print`)
  return orderId
}
