import axios from 'axios'
import { clearTokens, getAccessToken, refreshAccessToken } from '../app/auth'
import { isOutboxUrlSupported, listOutbox, removeOutbox, markOutboxError } from './outbox'

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

const shouldDiscardOnResponseStatus = (status?: number) => [400, 403, 404, 409, 422].includes(Number(status))

export async function syncOutbox(baseURL: string) {
  const items = await listOutbox()
  for (const item of items) {
    if (!isOutboxUrlSupported(item.url)) {
      if (item.id) {
        await removeOutbox(item.id)
      }
      continue
    }
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
          accessToken = await refreshAccessToken()
          if (!accessToken) {
            clearTokens()
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
      if (item.id && shouldDiscardOnResponseStatus(err?.response?.status)) {
        await removeOutbox(item.id)
        continue
      }
      if (item.id) {
        await markOutboxError(item.id, err?.message || 'sync error')
      }
      break
    }
  }
}
