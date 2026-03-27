import axios from 'axios'
import { enqueueOutbox } from '../offline/outbox'
import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from '../app/auth'
import { getApiBaseUrl } from '../app/runtime'

const baseURL = getApiBaseUrl()
let refreshPromise: Promise<string | null> | null = null

export const api = axios.create({
  baseURL,
  timeout: 8000
})

api.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (resp) => resp,
  async (error) => {
    const config = error.config
    const method = (config?.method || 'get').toUpperCase()
    if (error.response?.status === 401 && config && !config._retry) {
      const refresh = getRefreshToken()
      if (!refresh) {
        clearTokens()
        return Promise.reject(error)
      }
      config._retry = true
      refreshPromise =
        refreshPromise ||
        api
          .post('/api/auth/refresh', { refresh }, { headers: {} })
          .then((response) => {
            const nextAccess = response.data.access as string
            saveTokens(nextAccess, refresh)
            return nextAccess
          })
          .catch(() => {
            clearTokens()
            return null
          })
          .finally(() => {
            refreshPromise = null
          })
      const nextAccess = await refreshPromise
      if (nextAccess) {
        config.headers = config.headers || {}
        config.headers.Authorization = `Bearer ${nextAccess}`
        return api.request(config)
      }
    }
    const isNetworkError = !error.response
    if (isNetworkError && ['POST', 'PUT', 'DELETE'].includes(method)) {
      const clientRequestId = crypto.randomUUID()
      let payload = config.data || {}
      if (typeof config.data === 'string') {
        try {
          payload = JSON.parse(config.data)
        } catch {
          payload = {}
        }
      }
      const body = { ...payload, client_request_id: clientRequestId }
      await enqueueOutbox({
        method,
        url: config.url,
        body,
        headers: config.headers || {},
        client_request_id: clientRequestId
      })
      error.enqueued = true
    }
    return Promise.reject(error)
  }
)
