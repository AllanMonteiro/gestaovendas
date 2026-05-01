const PUBLIC_MENU_PATH = '/cardapio'

export const buildFallbackPublicMenuUrl = () => {
  if (typeof window === 'undefined') {
    return PUBLIC_MENU_PATH
  }
  return `${window.location.origin}${PUBLIC_MENU_PATH}`
}

export const normalizePublicMenuUrl = (configuredUrl?: string | null) => {
  const fallback = buildFallbackPublicMenuUrl()
  const raw = String(configuredUrl || '').trim()

  if (!raw) {
    return fallback
  }

  try {
    if (raw.startsWith('/')) {
      const url = new URL(raw, window.location.origin)
      if (!url.pathname || url.pathname === '/') {
        url.pathname = PUBLIC_MENU_PATH
      }
      return url.toString()
    }

    const normalized = raw.includes('://') ? raw : `https://${raw}`
    const url = new URL(normalized)
    if (!url.pathname || url.pathname === '/') {
      url.pathname = PUBLIC_MENU_PATH
    }
    return url.toString()
  } catch {
    return fallback
  }
}
