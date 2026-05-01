import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { useSocket } from '../hooks/useSocket'
import {
  DELIVERY_SOUND_RUNTIME_EVENT,
  getDeliverySoundRuntimeStatus,
  playNotificationSound,
  prepareNotificationSound,
  requestDeliverySoundActivation,
  stopRepeatingDeliveryAlarm,
  syncRepeatingDeliveryAlarm,
  type DeliverySoundRuntimeStatus,
} from '../app/playNotificationSound'

type DeliveryAlert = {
  id: string
  customer_name?: string
  total?: string
}

type DeliveryOrderPayload = DeliveryAlert & {
  created_at?: string
  status?: string
}

type DeliveryOrdersResponse =
  | DeliveryOrderPayload[]
  | { results?: DeliveryOrderPayload[] }
  | { data?: DeliveryOrderPayload[] }

const DELIVERY_ALERT_POLL_INTERVAL_MS = 10000
const DELIVERY_ALERT_REFRESH_DEBOUNCE_MS = 150

const normalizeDeliveryOrders = (payload: DeliveryOrdersResponse): DeliveryOrderPayload[] => {
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

const isDeliveryRealtimeEvent = (data: unknown) =>
  typeof data === 'object' &&
  data !== null &&
  'event' in data &&
  'source' in data &&
  (data as { event?: unknown }).event === 'order_created' &&
  (data as { source?: unknown }).source === 'delivery'

const getHttpStatus = (error: unknown) => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response?: { status?: number } }).response?.status === 'number'
  ) {
    return (error as { response: { status: number } }).response.status
  }
  return 0
}

export const useDeliveryAlerts = (currentPath: string) => {
  const [deliveryAlerts, setDeliveryAlerts] = useState<DeliveryAlert[]>([])
  const [deliverySoundRuntime, setDeliverySoundRuntime] = useState<DeliverySoundRuntimeStatus>(() =>
    getDeliverySoundRuntimeStatus()
  )
  const knownDeliveryOrderIdsRef = useRef<Set<string>>(new Set())
  const deliveryAlertsDisabledRef = useRef(false)
  const deliveryPollTimerRef = useRef<number | null>(null)
  const deliveryRefreshTimerRef = useRef<number | null>(null)
  const deliveryAlertTimeoutsRef = useRef<Record<string, number>>({})
  const fetchDeliveryOrdersRef = useRef<(options?: { notifyOnNew?: boolean }) => void>(() => undefined)

  const dismissAlert = useCallback((id: string) => {
    const timeoutId = deliveryAlertTimeoutsRef.current[id]
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId)
      delete deliveryAlertTimeoutsRef.current[id]
    }
    setDeliveryAlerts((current) => current.filter((item) => item.id !== id))
  }, [])

  const pushDeliveryAlerts = useCallback((orders: DeliveryOrderPayload[]) => {
    if (!orders.length) {
      return
    }
    playNotificationSound()
    setDeliveryAlerts((current) => {
      const next = [...current]
      for (const order of orders) {
        const timeoutId = deliveryAlertTimeoutsRef.current[order.id]
        if (timeoutId !== undefined) {
          window.clearTimeout(timeoutId)
        }
        next.unshift({
          id: order.id,
          customer_name: order.customer_name || 'Novo pedido delivery',
          total: order.total,
        })
        deliveryAlertTimeoutsRef.current[order.id] = window.setTimeout(() => {
          setDeliveryAlerts((items) => items.filter((item) => item.id !== order.id))
          delete deliveryAlertTimeoutsRef.current[order.id]
        }, 15000)
      }
      return next
        .filter((alert, index, source) => source.findIndex((item) => item.id === alert.id) === index)
        .slice(0, 3)
    })
  }, [])

  const fetchDeliveryOrders = useCallback(async (options?: { notifyOnNew?: boolean }) => {
    if (deliveryAlertsDisabledRef.current) {
      return
    }
    try {
      const response = await api.get<DeliveryOrdersResponse>('/api/orders/?include_items=0&limit=20')
      const nextOrders = normalizeDeliveryOrders(response.data)
      syncRepeatingDeliveryAlarm(nextOrders.some((order) => order.status === 'novo'))
      if (options?.notifyOnNew) {
        const newOrders = nextOrders.filter((order) => !knownDeliveryOrderIdsRef.current.has(order.id))
        if (newOrders.length) {
          const ordered = [...newOrders].sort((a, b) => {
            const left = a.created_at ? new Date(a.created_at).getTime() : 0
            const right = b.created_at ? new Date(b.created_at).getTime() : 0
            return left - right
          })
          pushDeliveryAlerts(ordered)
        }
      }
      knownDeliveryOrderIdsRef.current = new Set(nextOrders.map((order) => order.id))
    } catch (error) {
      const status = getHttpStatus(error)
      if (status === 401 || status === 403) {
        // Disable background polling when the logged-in profile cannot access delivery.
        deliveryAlertsDisabledRef.current = true
        knownDeliveryOrderIdsRef.current = new Set()
        stopRepeatingDeliveryAlarm()
        setDeliveryAlerts([])
      }
    }
  }, [pushDeliveryAlerts])

  useEffect(() => {
    prepareNotificationSound()
  }, [])

  useEffect(() => {
    const syncRuntime = () => {
      setDeliverySoundRuntime(getDeliverySoundRuntimeStatus())
    }

    syncRuntime()
    window.addEventListener(DELIVERY_SOUND_RUNTIME_EVENT, syncRuntime as EventListener)
    return () => window.removeEventListener(DELIVERY_SOUND_RUNTIME_EVENT, syncRuntime as EventListener)
  }, [])

  useEffect(() => {
    if (currentPath === '/delivery') {
      setDeliveryAlerts([])
      stopRepeatingDeliveryAlarm()
      return
    }

    deliveryAlertsDisabledRef.current = false

    fetchDeliveryOrdersRef.current = (options) => {
      void fetchDeliveryOrders(options)
    }

    void fetchDeliveryOrders()

    deliveryPollTimerRef.current = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void fetchDeliveryOrders({ notifyOnNew: true })
      }
    }, DELIVERY_ALERT_POLL_INTERVAL_MS)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void fetchDeliveryOrders({ notifyOnNew: true })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      fetchDeliveryOrdersRef.current = () => undefined
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (deliveryPollTimerRef.current !== null) {
        window.clearInterval(deliveryPollTimerRef.current)
      }
      if (deliveryRefreshTimerRef.current !== null) {
        window.clearTimeout(deliveryRefreshTimerRef.current)
      }
      Object.values(deliveryAlertTimeoutsRef.current).forEach((timeoutId) => window.clearTimeout(timeoutId))
      deliveryAlertTimeoutsRef.current = {}
      stopRepeatingDeliveryAlarm()
    }
  }, [currentPath, fetchDeliveryOrders])

  const handlePdvRealtimeMessage = useCallback((data: unknown) => {
    if (currentPath === '/delivery' || document.visibilityState !== 'visible') {
      return
    }

    if (!isDeliveryRealtimeEvent(data)) {
      return
    }

    if (deliveryRefreshTimerRef.current !== null) {
      window.clearTimeout(deliveryRefreshTimerRef.current)
    }

    deliveryRefreshTimerRef.current = window.setTimeout(() => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) {
        return
      }
      fetchDeliveryOrdersRef.current({ notifyOnNew: true })
    }, DELIVERY_ALERT_REFRESH_DEBOUNCE_MS)
  }, [currentPath])

  useSocket('/ws/pdv', {
    enabled: currentPath !== '/delivery',
    onMessage: handlePdvRealtimeMessage,
  })

  return {
    deliveryAlerts,
    deliverySoundRuntime,
    dismissAlert,
    requestDeliverySoundActivation,
  }
}
