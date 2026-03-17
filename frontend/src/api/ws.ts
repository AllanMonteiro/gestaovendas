import { getWebSocketBaseUrl } from '../app/runtime'

export function connectWS(path: string, onMessage: (data: any) => void) {
  const base = getWebSocketBaseUrl()
  const ws = new WebSocket(`${base}${path}`)
  ws.onmessage = (evt) => {
    try {
      onMessage(JSON.parse(evt.data))
    } catch {
      onMessage(evt.data)
    }
  }
  return ws
}
