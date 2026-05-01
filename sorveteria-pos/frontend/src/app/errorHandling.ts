const CHUNK_RELOAD_KEY = 'sorveteria.chunk-reload-at'
const IGNORABLE_EXTERNAL_REJECTION_PATTERNS = ['No Listener: tabs:outgoing.message.ready']

export const getErrorMessage = (reason: unknown) => {
  if (typeof reason === 'string') {
    return reason
  }
  if (reason instanceof Error) {
    return reason.message
  }
  if (typeof reason === 'object' && reason !== null && 'message' in reason) {
    return String((reason as { message?: unknown }).message ?? '')
  }
  return String(reason ?? '')
}

export const isChunkLoadError = (reason: unknown) => {
  const message = getErrorMessage(reason)
  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed')
  )
}

export const tryRecoverChunk = () => {
  if (typeof window === 'undefined') {
    return false
  }

  const lastReloadAt = Number(window.sessionStorage.getItem(CHUNK_RELOAD_KEY) || '0')
  if (Date.now() - lastReloadAt < 10000) {
    return false
  }

  window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
  window.location.reload()
  return true
}

export const maybeRecoverFromChunkError = (reason: unknown) => {
  if (!isChunkLoadError(reason)) {
    return false
  }

  return tryRecoverChunk()
}

export const isIgnorableExternalRejection = (reason: unknown) => {
  const message = getErrorMessage(reason)
  return IGNORABLE_EXTERNAL_REJECTION_PATTERNS.some((pattern) => message.includes(pattern))
}
