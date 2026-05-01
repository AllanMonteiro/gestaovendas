import axios from 'axios'
import { enqueueOutbox, isOutboxUrlSupported } from '../offline/outbox'
import { clearTokens, getAccessToken, refreshAccessToken } from '../app/auth'
import { getApiBaseUrl } from '../app/runtime'

const baseURL = getApiBaseUrl()

export const api = axios.create({
  baseURL,
  timeout: 8000,
})

api.interceptors.request.use((config) => {
  const token = getAccessToken()
  const isRefreshRequest = config.url?.includes('/api/auth/refresh')
  if (token && !isRefreshRequest) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config
    const method = (config?.method || 'get').toUpperCase()

    if (error.response?.status === 401 && config && !config._retry) {
      config._retry = true
      const nextAccessToken = await refreshAccessToken()

      if (nextAccessToken) {
        config.headers = config.headers || {}
        config.headers.Authorization = `Bearer ${nextAccessToken}`
        return api.request(config)
      }

      clearTokens()
    }

    const isNetworkError = !error.response
    if (isNetworkError && ['POST', 'PUT', 'DELETE'].includes(method) && isOutboxUrlSupported(config?.url)) {
      let payload = config.data || {}
      if (typeof config.data === 'string') {
        try {
          payload = JSON.parse(config.data)
        } catch {
          payload = {}
        }
      }

      const existingClientRequestId =
        payload && typeof payload === 'object' && typeof payload.client_request_id === 'string'
          ? payload.client_request_id
          : undefined
      const clientRequestId = existingClientRequestId || crypto.randomUUID()
      const body = { ...payload, client_request_id: clientRequestId }

      await enqueueOutbox({
        method,
        url: config.url,
        body,
        headers: config.headers || {},
        client_request_id: clientRequestId,
      })
      error.enqueued = true
    }

    return Promise.reject(error)
  }
)
