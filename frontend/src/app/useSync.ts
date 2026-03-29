import { useEffect } from 'react'
import { syncOutbox } from '../offline/sync'
import { getApiBaseUrl } from './runtime'

export function useOutboxSync() {
  useEffect(() => {
    const baseURL = getApiBaseUrl()
    const run = () => syncOutbox(baseURL)
    run()
    const interval = setInterval(run, 15000)
    window.addEventListener('online', run)
    return () => {
      clearInterval(interval)
      window.removeEventListener('online', run)
    }
  }, [])
}
