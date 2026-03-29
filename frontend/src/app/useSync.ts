import { useEffect } from 'react'
import { syncOutbox } from '../offline/sync'
import { getApiBaseUrl } from './runtime'

export function useOutboxSync() {
  useEffect(() => {
    const baseURL = getApiBaseUrl()
    const run = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return
      }
      void syncOutbox(baseURL)
    }
    const handleVisibility = () => run()
    run()
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
