import React, { createContext, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { getApiBaseUrl, restoreSessionOnStartup } from './runtime'

export type SessionUser = {
  id: number
  email: string
  name: string
  is_active: boolean
  is_staff: boolean
  is_superuser: boolean
  role_ids: number[]
  permission_codes: string[]
}

export type AuthSession = {
  require_auth: boolean
  authenticated: boolean
  bootstrap_required: boolean
  user?: SessionUser
}

export type AuthContextValue = {
  user: SessionUser | null
  accessToken: string | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<AuthSession>
  logout: () => Promise<AuthSession | null>
  refreshSession: () => Promise<AuthSession | null>
}

type AuthSnapshot = {
  user: SessionUser | null
  accessToken: string | null
  isAuthenticated: boolean
}

const ACCESS_TOKEN_KEY = 'sorveteria.auth.access'
const REFRESH_TOKEN_KEY = 'sorveteria.auth.refresh'
const AUTH_REQUEST_TIMEOUT_MS = 8000

// Legacy persistence is intentionally kept during the migration so existing
// browser sessions and code paths continue working while accessToken moves to memory.
const readLegacyToken = (key: string) => {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

const writeLegacyToken = (key: string, value: string) => {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Ignore storage failures and keep the in-memory state as the source of truth.
  }
}

const removeLegacyToken = (key: string) => {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Ignore storage failures and continue clearing in-memory state.
  }
}

const listeners = new Set<(snapshot: AuthSnapshot) => void>()
let refreshPromise: Promise<string | null> | null = null
let authSnapshot: AuthSnapshot = {
  user: null,
  accessToken: null,
  isAuthenticated: false,
}

const emitAuthSnapshot = () => {
  listeners.forEach((listener) => listener(authSnapshot))
}

const setAuthSnapshot = (nextSnapshot: AuthSnapshot) => {
  authSnapshot = nextSnapshot
  emitAuthSnapshot()
}

const updateAuthSnapshot = (patch: Partial<AuthSnapshot>) => {
  const nextAccessToken = patch.accessToken !== undefined ? patch.accessToken : authSnapshot.accessToken
  const nextUser = patch.user !== undefined ? patch.user : authSnapshot.user
  setAuthSnapshot({
    user: nextUser,
    accessToken: nextAccessToken,
    isAuthenticated:
      patch.isAuthenticated !== undefined
        ? patch.isAuthenticated
        : Boolean(nextAccessToken || nextUser),
  })
}

const isUnauthorizedError = (error: unknown) =>
  axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403)

export const subscribeToAuthSnapshot = (listener: (snapshot: AuthSnapshot) => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const getAuthSnapshot = () => authSnapshot

export const getAccessToken = () => authSnapshot.accessToken

export const getRefreshToken = () => readLegacyToken(REFRESH_TOKEN_KEY)

export const saveTokens = (access: string, refresh: string) => {
  writeLegacyToken(ACCESS_TOKEN_KEY, access)
  writeLegacyToken(REFRESH_TOKEN_KEY, refresh)
  updateAuthSnapshot({
    accessToken: access,
    isAuthenticated: true,
  })
}

export const clearTokens = () => {
  removeLegacyToken(ACCESS_TOKEN_KEY)
  removeLegacyToken(REFRESH_TOKEN_KEY)
  setAuthSnapshot({
    user: null,
    accessToken: null,
    isAuthenticated: false,
  })
}

const fetchSession = async (accessToken?: string | null) => {
  const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
  const response = await axios.get<AuthSession>(`${getApiBaseUrl()}/api/auth/session`, {
    headers,
    timeout: AUTH_REQUEST_TIMEOUT_MS,
  })
  return response.data
}

const applySession = (session: AuthSession | null, accessToken?: string | null) => {
  if (!session) {
    clearTokens()
    return
  }

  if (!session.authenticated) {
    setAuthSnapshot({
      user: null,
      accessToken: null,
      isAuthenticated: false,
    })
    return
  }

  updateAuthSnapshot({
    user: session.user ?? null,
    accessToken: accessToken ?? authSnapshot.accessToken,
    isAuthenticated: true,
  })
}

export const refreshAccessToken = async () => {
  const refreshToken = getRefreshToken()
  if (!refreshToken) {
    clearTokens()
    return null
  }

  refreshPromise =
    refreshPromise ||
    axios
      .post<{ access: string }>(
        `${getApiBaseUrl()}/api/auth/refresh`,
        { refresh: refreshToken },
        { headers: {}, timeout: AUTH_REQUEST_TIMEOUT_MS }
      )
      .then((response) => {
        const nextAccessToken = response.data.access
        saveTokens(nextAccessToken, refreshToken)
        return nextAccessToken
      })
      .catch(() => {
        clearTokens()
        return null
      })
      .finally(() => {
        refreshPromise = null
      })

  return refreshPromise
}

export const refreshStoredSession = async (): Promise<AuthSession | null> => {
  const currentAccessToken = getAccessToken()

  if (currentAccessToken) {
    try {
      const session = await fetchSession(currentAccessToken)
      applySession(session, currentAccessToken)
      return session
    } catch (error) {
      if (!isUnauthorizedError(error)) {
        throw error
      }
    }
  }

  const nextAccessToken = await refreshAccessToken()
  if (nextAccessToken) {
    try {
      const session = await fetchSession(nextAccessToken)
      applySession(session, nextAccessToken)
      return session
    } catch (error) {
      if (!isUnauthorizedError(error)) {
        throw error
      }
      clearTokens()
    }
  }

  try {
    const anonymousSession = await fetchSession(null)
    applySession(anonymousSession, null)
    return anonymousSession
  } catch {
    clearTokens()
    return null
  }
}

export const loginWithCredentials = async (email: string, password: string) => {
  const response = await axios.post<{ access: string; refresh: string }>(
    `${getApiBaseUrl()}/api/auth/login`,
    { email, password },
    { headers: {}, timeout: AUTH_REQUEST_TIMEOUT_MS }
  )

  saveTokens(response.data.access, response.data.refresh)
  const session = await fetchSession(response.data.access)
  applySession(session, response.data.access)
  return session
}

export const logoutSession = async () => {
  clearTokens()
  try {
    const anonymousSession = await fetchSession(null)
    applySession(anonymousSession, null)
    return anonymousSession
  } catch {
    return null
  }
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [snapshot, setSnapshot] = useState<AuthSnapshot>(() => getAuthSnapshot())

  useEffect(() => subscribeToAuthSnapshot(setSnapshot), [])

  useEffect(() => {
    void restoreSessionOnStartup(refreshStoredSession)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user: snapshot.user,
      accessToken: snapshot.accessToken,
      isAuthenticated: snapshot.isAuthenticated,
      login: loginWithCredentials,
      logout: logoutSession,
      refreshSession: refreshStoredSession,
    }),
    [snapshot.accessToken, snapshot.isAuthenticated, snapshot.user]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
