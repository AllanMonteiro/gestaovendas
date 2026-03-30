import { useEffect, useRef } from 'react'
import { syncOutbox } from '../offline/sync'
import { getApiBaseUrl } from './runtime'

export function useOutboxSync() {
  const runningRef = useRef(false)
  const pendingRef = useRef(false)

  useEffect(() => {
    const baseURL = getApiBaseUrl()
    const run = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return
      }
      if (runningRef.current) {
        pendingRef.current = true
        return
      }
      runningRef.current = true
      try {
        await syncOutbox(baseURL)
      } finally {
        runningRef.current = false
        if (pendingRef.current) {
          pendingRef.current = false
          void run()
        }
      }
    }
    const handleVisibility = () => run()
    void run()
    const interval = setInterval(run, 30000)
    window.addEventListener('online', run)
    window.addEventListener('sorveteria:outbox-changed', run)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      clearInterval(interval)
      window.removeEventListener('online', run)
      window.removeEventListener('sorveteria:outbox-changed', run)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])
}
