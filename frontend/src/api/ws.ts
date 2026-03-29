import { getWebSocketBaseUrl } from '../app/runtime'
import { getAccessToken } from '../app/auth'

export function connectWS(path: string, onMessage: (data: any) => void) {
  const base = getWebSocketBaseUrl()
  const token = getAccessToken()
  const separator = path.includes('?') ? '&' : '?'
  const url = token ? `${base}${path}${separator}token=${encodeURIComponent(token)}` : `${base}${path}`
  const ws = new WebSocket(url)
  ws.onmessage = (evt) => {
    try {
      onMessage(JSON.parse(evt.data))
    } catch {
      onMessage(evt.data)
    }
  }
  return ws
}
