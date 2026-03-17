import { useEffect } from 'react'
import { syncOutbox } from '../offline/sync'

export function useOutboxSync() {
  useEffect(() => {
    const baseURL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
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