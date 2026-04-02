const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '')

const isLocalHostname = (hostname: string) =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'

const shouldIgnoreConfiguredUrl = (configured: string) => {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    const parsed = new URL(configured)
    return isLocalHostname(parsed.hostname) && !isLocalHostname(window.location.hostname)
  } catch {
    return false
  }
}

export const getApiBaseUrl = () => {
  const configured = import.meta.env.VITE_API_URL?.trim()
  if (configured && !shouldIgnoreConfiguredUrl(configured)) {
    return trimTrailingSlash(configured)
  }
  if (typeof window !== 'undefined') {
    return trimTrailingSlash(window.location.origin)
  }
  return ''
}

export const getWebSocketBaseUrl = () => {
  const configured = import.meta.env.VITE_WS_URL?.trim()
  if (configured && !shouldIgnoreConfiguredUrl(configured)) {
    return trimTrailingSlash(configured)
  }
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}`
  }
  return 'ws://127.0.0.1:8000'
}

export const resolveAssetUrl = (value?: string | null) => {
  const trimmed = value?.trim()
  if (!trimmed) {
    return ''
  }
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed
  }

  try {
    const parsed = new URL(trimmed)
    if (parsed.pathname.startsWith('/media/')) {
      return new URL(`${parsed.pathname}${parsed.search}${parsed.hash}`, `${getApiBaseUrl()}/`).toString()
    }
    return trimmed
  } catch {
    // Relative paths are resolved against the API base below.
  }

  const normalizedPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return new URL(normalizedPath, `${getApiBaseUrl()}/`).toString()
}
