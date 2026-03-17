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

const ACCESS_TOKEN_KEY = 'sorveteria.auth.access'
const REFRESH_TOKEN_KEY = 'sorveteria.auth.refresh'

export const getAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY)
export const getRefreshToken = () => localStorage.getItem(REFRESH_TOKEN_KEY)

export const saveTokens = (access: string, refresh: string) => {
  localStorage.setItem(ACCESS_TOKEN_KEY, access)
  localStorage.setItem(REFRESH_TOKEN_KEY, refresh)
}

export const clearTokens = () => {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}
