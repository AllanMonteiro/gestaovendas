import { useEffect, useMemo, useState } from 'react'
import { closeWS, sendWSMessage, subscribeWS, type SocketConnectionStatus } from '../api/ws'

type UseSocketOptions = {
  enabled?: boolean
  onMessage?: (data: unknown) => void
}

export const useSocket = (path: string, options?: UseSocketOptions) => {
  const enabled = options?.enabled ?? true
  const onMessage = options?.onMessage
  const [status, setStatus] = useState<SocketConnectionStatus>(enabled ? 'connecting' : 'idle')

  useEffect(() => {
    if (!enabled) {
      setStatus('idle')
      return
    }

    const unsubscribe = subscribeWS(
      path,
      (data) => onMessage?.(data),
      (nextStatus) => setStatus(nextStatus)
    )

    return () => {
      unsubscribe()
    }
  }, [enabled, onMessage, path])

  return useMemo(
    () => ({
      status,
      isConnected: status === 'open',
      sendMessage: (message: unknown) => sendWSMessage(path, message),
      close: () => closeWS(path),
    }),
    [path, status]
  )
}
