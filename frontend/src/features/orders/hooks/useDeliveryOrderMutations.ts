import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  deleteDeliveryOrder,
  markKitchenOrderReady,
  moveKitchenOrderBackToPrep,
  queueKitchenOrderPrint,
  updateDeliveryOrderStatus,
} from '../mutations'
import { ordersQueryKeys } from '../queryKeys'
import type { DeliveryOrder, KitchenOrder } from '../types'

const syncDeliveryOrdersCache = (
  queryClient: ReturnType<typeof useQueryClient>,
  updater: (current: DeliveryOrder[]) => DeliveryOrder[]
) => {
  queryClient.setQueryData<DeliveryOrder[]>(ordersQueryKeys.delivery.list(), (current) => updater(current ?? []))
}

const syncKitchenQueueCache = (
  queryClient: ReturnType<typeof useQueryClient>,
  updater: (current: KitchenOrder[]) => KitchenOrder[]
) => {
  queryClient.setQueryData<KitchenOrder[]>(ordersQueryKeys.kitchen.queue(), (current) => updater(current ?? []))
}

export const useUpdateDeliveryOrderStatusMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateDeliveryOrderStatus,
    onSuccess: (order) => {
      syncDeliveryOrdersCache(queryClient, (current) =>
        current.map((item) => (item.id === order.id ? order : item))
      )
    },
  })
}

export const useDeleteDeliveryOrderMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteDeliveryOrder,
    onSuccess: (orderId) => {
      syncDeliveryOrdersCache(queryClient, (current) => current.filter((item) => item.id !== orderId))
    },
  })
}

export const useMarkKitchenOrderReadyMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: markKitchenOrderReady,
    onSuccess: ({ orderId, status }) => {
      syncKitchenQueueCache(queryClient, (current) =>
        current.map((item) => (item.id === orderId ? { ...item, status } : item))
      )
    },
  })
}

export const useMoveKitchenOrderBackToPrepMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: moveKitchenOrderBackToPrep,
    onSuccess: ({ orderId, status }) => {
      syncKitchenQueueCache(queryClient, (current) =>
        current.map((item) => (item.id === orderId ? { ...item, status } : item))
      )
    },
  })
}

export const useQueueKitchenOrderPrintMutation = () =>
  useMutation({
    mutationFn: queueKitchenOrderPrint,
  })
