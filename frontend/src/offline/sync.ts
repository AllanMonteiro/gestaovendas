import axios from 'axios'
import { listOutbox, removeOutbox, markOutboxError } from './outbox'

export async function syncOutbox(baseURL: string) {
  const items = await listOutbox()
  for (const item of items) {
    try {
      await axios.request({
        method: item.method,
        url: `${baseURL}${item.url}`,
        data: item.body,
        headers: item.headers,
        timeout: 8000
      })
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