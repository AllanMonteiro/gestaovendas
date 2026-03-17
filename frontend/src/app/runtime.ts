const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '')

export const getApiBaseUrl = () => {
  const configured = import.meta.env.VITE_API_URL?.trim()
  if (configured) {
    return trimTrailingSlash(configured)
  }
  if (typeof window !== 'undefined') {
    return trimTrailingSlash(window.location.origin)
  }
  return ''
}

export const getWebSocketBaseUrl = () => {
  const configured = import.meta.env.VITE_WS_URL?.trim()
  if (configured) {
    return trimTrailingSlash(configured)
  }
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}`
  }
  return 'ws://127.0.0.1:8000'
}
