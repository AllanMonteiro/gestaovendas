import axios from 'axios'
import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from '../app/auth'
import { listOutbox, removeOutbox, markOutboxError } from './outbox'

const buildSyncHeaders = (headers: Record<string, string> | undefined, accessToken: string | null) => {
  const nextHeaders: Record<string, string> = {}
  Object.entries(headers ?? {}).forEach(([key, value]) => {
    if (key.toLowerCase() === 'authorization') {
      return
    }
    nextHeaders[key] = value
  })
  if (accessToken) {
    nextHeaders.Authorization = `Bearer ${accessToken}`
  }
  return nextHeaders
}

const refreshAccessToken = async (baseURL: string) => {
  const refresh = getRefreshToken()
  if (!refresh) {
    clearTokens()
    return null
  }
  try {
    const response = await axios.post(
      `${baseURL}/api/auth/refresh`,
      { refresh },
      { headers: {}, timeout: 8000 }
    )
    const nextAccess = response.data.access as string
    saveTokens(nextAccess, refresh)
    return nextAccess
  } catch {
    clearTokens()
    return null
  }
}

export async function syncOutbox(baseURL: string) {
  const items = await listOutbox()
  for (const item of items) {
    try {
      let accessToken = getAccessToken()
      const send = () =>
        axios.request({
          method: item.method,
          url: `${baseURL}${item.url}`,
          data: item.body,
          headers: buildSyncHeaders(item.headers, accessToken),
          timeout: 8000
        })

      try {
        await send()
      } catch (err: any) {
        if (err?.response?.status === 401) {
          accessToken = await refreshAccessToken(baseURL)
          if (!accessToken) {
            throw err
          }
          await send()
        } else {
          throw err
        }
      }

      if (item.id) {
        await removeOutbox(item.id)
      }
    } catch (err: any) {
      if (item.id) {
        await markOutboxError(item.id, err?.message || 'sync error')
      }
      break
    }
  }
}
