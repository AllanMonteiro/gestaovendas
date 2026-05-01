import { getWebSocketBaseUrl } from '../app/runtime'
import { getAccessToken, getRefreshToken, subscribeToAuthSnapshot } from '../app/auth'

export type SocketConnectionStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error'
export type SocketMessageHandler = (data: unknown) => void
export type SocketStatusHandler = (status: SocketConnectionStatus) => void
export type GlobalSocketMessageHandler = (data: unknown, path: string) => void

type SocketRecord = {
  path: string
  ws: WebSocket | null
  status: SocketConnectionStatus
  listeners: Set<SocketMessageHandler>
  statusListeners: Set<SocketStatusHandler>
  refCount: number
  reconnectTimer: number | null
  reconnectAttempts: number
  shouldReconnect: boolean
}

const sockets = new Map<string, SocketRecord>()
const globalMessageHandlers = new Set<GlobalSocketMessageHandler>()

const buildSocketUrl = (path: string) => {
  const base = getWebSocketBaseUrl()
  const token = getAccessToken()
  const separator = path.includes('?') ? '&' : '?'
  return token ? `${base}${path}${separator}token=${encodeURIComponent(token)}` : `${base}${path}`
}

const parseSocketPayload = (payload: string) => {
  try {
    return JSON.parse(payload)
  } catch {
    return payload
  }
}

const notifyStatus = (record: SocketRecord) => {
  record.statusListeners.forEach((listener) => listener(record.status))
}

const deleteSocketIfUnused = (record: SocketRecord) => {
  if (
    record.refCount === 0 &&
    record.listeners.size === 0 &&
    record.statusListeners.size === 0 &&
    !record.ws &&
    record.reconnectTimer === null
  ) {
    sockets.delete(record.path)
  }
}

const clearReconnectTimer = (record: SocketRecord) => {
  if (record.reconnectTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(record.reconnectTimer)
  }
  record.reconnectTimer = null
}

const shouldWaitForTokenRefresh = () => Boolean(getRefreshToken() && !getAccessToken())
const AUTH_FAILURE_CLOSE_CODES = new Set([1008, 4401, 4403])

const scheduleReconnect = (record: SocketRecord) => {
  if (
    record.reconnectTimer !== null ||
    !record.shouldReconnect ||
    record.refCount === 0 ||
    record.listeners.size === 0 ||
    typeof window === 'undefined'
  ) {
    return
  }

  const delayMs = shouldWaitForTokenRefresh()
    ? 400
    : Math.min(1000 * 2 ** Math.min(record.reconnectAttempts, 4), 10000)

  record.reconnectTimer = window.setTimeout(() => {
    record.reconnectTimer = null
    if (!record.shouldReconnect || record.refCount === 0 || record.listeners.size === 0 || record.ws) {
      deleteSocketIfUnused(record)
      return
    }
    openSocket(record)
  }, delayMs)
}

const openSocket = (record: SocketRecord) => {
  if (record.ws || typeof WebSocket === 'undefined') {
    return
  }
  if (shouldWaitForTokenRefresh()) {
    scheduleReconnect(record)
    return
  }

  clearReconnectTimer(record)
  record.status = 'connecting'
  notifyStatus(record)

  const ws = new WebSocket(buildSocketUrl(record.path))
  record.ws = ws

  ws.onopen = () => {
    if (record.ws !== ws) {
      return
    }
    record.reconnectAttempts = 0
    record.status = 'open'
    notifyStatus(record)
  }

  ws.onerror = () => {
    if (record.ws !== ws) {
      return
    }
    record.status = 'error'
    notifyStatus(record)
  }

  ws.onclose = (event) => {
    if (record.ws !== ws) {
      return
    }
    record.ws = null
    record.status = 'closed'
    record.reconnectAttempts += 1
    if (AUTH_FAILURE_CLOSE_CODES.has(event.code)) {
      // Stop reconnecting when the backend explicitly rejected the session.
      record.shouldReconnect = false
    }
    notifyStatus(record)
    scheduleReconnect(record)
    deleteSocketIfUnused(record)
  }

  ws.onmessage = (event) => {
    const payload = parseSocketPayload(event.data)
    globalMessageHandlers.forEach((handler) => handler(payload, record.path))
    record.listeners.forEach((handler) => handler(payload))
  }
}

const ensureSocketRecord = (path: string) => {
  const current = sockets.get(path)
  if (current) {
    if (!current.ws) {
      openSocket(current)
    }
    return current
  }

  const record: SocketRecord = {
    path,
    ws: null,
    status: 'idle',
    listeners: new Set(),
    statusListeners: new Set(),
    refCount: 0,
    reconnectTimer: null,
    reconnectAttempts: 0,
    shouldReconnect: true,
  }

  sockets.set(path, record)
  openSocket(record)
  return record
}

export const subscribeWS = (
  path: string,
  onMessage: SocketMessageHandler,
  onStatusChange?: SocketStatusHandler
) => {
  const record = ensureSocketRecord(path)
  record.shouldReconnect = true
  record.refCount += 1
  record.listeners.add(onMessage)

  if (onStatusChange) {
    record.statusListeners.add(onStatusChange)
    onStatusChange(record.status)
  }

  return () => {
    record.listeners.delete(onMessage)
    if (onStatusChange) {
      record.statusListeners.delete(onStatusChange)
    }
    record.refCount = Math.max(0, record.refCount - 1)
    if (record.refCount === 0) {
      record.shouldReconnect = false
      clearReconnectTimer(record)
      record.ws?.close()
      if (!record.ws) {
        deleteSocketIfUnused(record)
      }
    }
  }
}

export const registerWSMessageHandler = (handler: GlobalSocketMessageHandler) => {
  globalMessageHandlers.add(handler)
  return () => {
    globalMessageHandlers.delete(handler)
  }
}

export const sendWSMessage = (path: string, message: unknown) => {
  const record = ensureSocketRecord(path)
  if (!record.ws || record.ws.readyState !== WebSocket.OPEN) {
    return false
  }

  const payload = typeof message === 'string' ? message : JSON.stringify(message)
  record.ws.send(payload)
  return true
}

export const closeWS = (path: string) => {
  const record = sockets.get(path)
  if (!record) {
    return
  }

  record.refCount = 0
  record.shouldReconnect = false
  record.listeners.clear()
  record.statusListeners.clear()
  clearReconnectTimer(record)
  record.ws?.close()
  if (!record.ws) {
    sockets.delete(path)
  }
}

if (typeof window !== 'undefined') {
  let lastKnownAccessToken = getAccessToken()

  window.addEventListener('online', () => {
    sockets.forEach((record) => {
      if (record.ws || record.refCount === 0 || record.listeners.size === 0) {
        return
      }
      record.shouldReconnect = true
      record.reconnectAttempts = 0
      clearReconnectTimer(record)
      openSocket(record)
    })
  })

  subscribeToAuthSnapshot((snapshot) => {
    const tokenChanged = snapshot.accessToken !== lastKnownAccessToken
    lastKnownAccessToken = snapshot.accessToken

    sockets.forEach((record) => {
      if (record.refCount === 0 || record.listeners.size === 0) {
        return
      }
      record.shouldReconnect = true
      record.reconnectAttempts = 0

      if (record.ws && tokenChanged) {
        record.ws.close()
        return
      }

      if (!record.ws) {
        clearReconnectTimer(record)
        openSocket(record)
      }
    })
  })
}

export function connectWS(path: string, onMessage: SocketMessageHandler) {
  const unsubscribe = subscribeWS(path, onMessage)
  const getSocket = () => sockets.get(path)?.ws ?? null

  return {
    send: (message: unknown) => sendWSMessage(path, message),
    close: () => unsubscribe(),
    get readyState() {
      return getSocket()?.readyState ?? WebSocket.CLOSED
    },
  }
}
