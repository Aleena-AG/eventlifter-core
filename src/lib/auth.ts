const TOKEN_KEY = 'ht_token'
const USER_KEY = 'ht_user'

export interface HtUser {
  id: string | number
  name: string
  email: string
  username?: string
  type?: string
  location?: string
  has_business_profile?: boolean
  profile?: {
    avatar?: string
    bio?: string
  }
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  // Strip "Bearer " prefix if it comes in the token value
  const clean = token.startsWith('Bearer ') ? token.slice(7) : token
  localStorage.setItem(TOKEN_KEY, clean)
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  localStorage.removeItem('ewentcast_account')
  localStorage.removeItem('ht_link_token')
}

export function getUser(): HtUser | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as HtUser } catch { return null }
}

export function setUser(user: HtUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function isAuthenticated(): boolean {
  return !!getToken()
}

/** Returns the Authorization header value ready to use */
export function authHeader(): string {
  const token = getToken()
  return token ? `Bearer ${token}` : ''
}

/** True when an API error indicates the Ewentcast session token is missing or invalid. */
export function isAuthErrorMessage(message: string): boolean {
  return /unauthenticated|unauthorized|session expired/i.test(message.trim())
}
