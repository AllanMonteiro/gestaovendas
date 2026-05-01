import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { catalogQueryKeys } from '../features/catalog/queryKeys'

type SocketEventPayload = {
  event?: string
  type?: string
  topic?: string
  source?: string
}

const resolveEventName = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') {
    return ''
  }

  const socketEvent = payload as SocketEventPayload
  return String(socketEvent.event || socketEvent.type || socketEvent.topic || '').trim().toLowerCase()
}

const invalidateKeys = (queryClient: QueryClient, queryKeys: QueryKey[]) => {
  queryKeys.forEach((queryKey) => {
    void queryClient.invalidateQueries({ queryKey })
  })
}

export const invalidateQueriesFromSocketEvent = (queryClient: QueryClient, payload: unknown, path: string) => {
  const eventName = resolveEventName(payload)
  if (!eventName) {
    return
  }

  switch (eventName) {
    case 'product_created':
    case 'product_updated':
    case 'category_updated':
    case 'catalog_updated':
      invalidateKeys(queryClient, [catalogQueryKeys.all])
      return
    case 'order_created':
    case 'order_updated':
    case 'order_status_changed':
      invalidateKeys(queryClient, [['orders'], ['sales']])
      return
    case 'payment_confirmed':
    case 'payment_received':
    case 'payment_updated':
      invalidateKeys(queryClient, [['orders'], ['sales'], ['payments']])
      return
    case 'operational_notification':
    case 'operation_notification':
    case 'printer_status_changed':
      invalidateKeys(queryClient, [['operations']])
      return
    default:
      if (path.includes('/ws/pdv') && eventName.startsWith('order_')) {
        invalidateKeys(queryClient, [['orders']])
      }
  }
}
