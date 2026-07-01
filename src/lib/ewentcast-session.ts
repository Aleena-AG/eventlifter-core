'use client'

import { authHeader, getToken, setToken, setUser, type HtUser } from '@/lib/auth'

export interface EwentcastAccount {
  auth_source: 'ewentcast_signup' | 'hightribe_native'
  subscription_plan: string
  subscription_status: string
  subscription_active: boolean
  subscription_amount_usd: number
  ht_connected: boolean
  linked_ht_user_id?: number | null
  ht_connected_at?: string | null
}

const EWENTCAST_KEY = 'ewentcast_account'
const HT_LINK_TOKEN_KEY = 'ht_link_token'

export function getEwentcastAccount(): EwentcastAccount | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(EWENTCAST_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as EwentcastAccount } catch { return null }
}

export function setEwentcastAccount(account: EwentcastAccount | null): void {
  if (!account) {
    localStorage.removeItem(EWENTCAST_KEY)
    return
  }
  localStorage.setItem(EWENTCAST_KEY, JSON.stringify(account))
}

export function getHtLinkToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(HT_LINK_TOKEN_KEY)
}

export function setHtLinkToken(token: string | null): void {
  if (!token) localStorage.removeItem(HT_LINK_TOKEN_KEY)
  else localStorage.setItem(HT_LINK_TOKEN_KEY, token)
}

export function clearEwentcastSession(): void {
  setEwentcastAccount(null)
  setHtLinkToken(null)
}

export function htApiAuthHeader(): string {
  const account = getEwentcastAccount()
  if (account?.auth_source === 'ewentcast_signup' && account.ht_connected) {
    const link = getHtLinkToken()
    if (link) return `Bearer ${link}`
  }
  return authHeader()
}

export function isEwentcastSignupUser(): boolean {
  return getEwentcastAccount()?.auth_source === 'ewentcast_signup'
}

export function needsSubscription(): boolean {
  const account = getEwentcastAccount()
  return account?.auth_source === 'ewentcast_signup' && !account.subscription_active
}

export function needsHtConnect(): boolean {
  const account = getEwentcastAccount()
  return account?.auth_source === 'ewentcast_signup' && account.subscription_active && !account.ht_connected
}

export async function fetchAuthMe(): Promise<{
  user: HtUser
  ewentcast: EwentcastAccount
} | null> {
  const token = getToken()
  if (!token) return null

  const res = await fetch('/api/auth/me', {
    headers: { Authorization: authHeader(), Accept: 'application/json' },
  })
  if (!res.ok) return null

  const data = await res.json() as {
    user?: HtUser
    ewentcast?: EwentcastAccount
    ht_link_token?: string | null
  }
  if (!data.user || !data.ewentcast) return null

  setUser(data.user)
  setEwentcastAccount(data.ewentcast)
  if (data.ht_link_token) setHtLinkToken(data.ht_link_token)
  return { user: data.user, ewentcast: data.ewentcast }
}

/** @deprecated use fetchAuthMe */
export const fetchEwentcastMe = fetchAuthMe

export async function registerLocal(body: {
  name: string
  email: string
  password: string
}): Promise<{ token: string; user: HtUser; ewentcast: EwentcastAccount }> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json() as {
    status?: boolean
    message?: string
    token?: string
    user?: HtUser
    ewentcast?: EwentcastAccount
  }
  if (!res.ok || !data.status || !data.token || !data.user || !data.ewentcast) {
    throw new Error(data.message || 'Registration failed')
  }
  setToken(data.token)
  setUser(data.user)
  setEwentcastAccount(data.ewentcast)
  return { token: data.token, user: data.user, ewentcast: data.ewentcast }
}

/** @deprecated use registerLocal */
export const registerEwentcast = registerLocal

export async function loginLocal(email: string, password: string): Promise<void> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json() as {
    status?: boolean
    message?: string
    token?: string
    user?: HtUser
    ewentcast?: EwentcastAccount
  }
  if (!res.ok || !data.status || !data.token || !data.user || !data.ewentcast) {
    throw new Error(data.message || 'Login failed')
  }
  setToken(data.token)
  setUser(data.user)
  setEwentcastAccount(data.ewentcast)
}

export async function logoutLocal(): Promise<void> {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: authHeader(), Accept: 'application/json' },
    })
  } catch {
    // clear locally regardless
  }
}

export async function requestPasswordReset(email: string): Promise<{
  resetToken?: string
  resetUrl?: string
}> {
  const res = await fetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email }),
  })
  const data = await res.json() as {
    status?: boolean
    message?: string
    resetToken?: string
    resetUrl?: string
  }
  if (!res.ok || !data.status) throw new Error(data.message || 'Request failed')
  return { resetToken: data.resetToken, resetUrl: data.resetUrl }
}

export async function resetPassword(token: string, password: string): Promise<void> {
  const res = await fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ token, password }),
  })
  const data = await res.json() as { status?: boolean; message?: string }
  if (!res.ok || !data.status) throw new Error(data.message || 'Reset failed')
}

export async function loginWithHightribe(email: string, password: string): Promise<void> {
  const res = await fetch('/api/hightribe/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json() as {
    status?: boolean
    message?: string
    token?: string
    user?: HtUser
  }
  if (!res.ok || !data.status || !data.token || !data.user) {
    throw new Error(data.message || 'HighTribe login failed')
  }
  setToken(data.token)
  setUser(data.user)
  setEwentcastAccount({
    auth_source: 'hightribe_native',
    subscription_plan: 'pro_monthly_20',
    subscription_status: 'active',
    subscription_active: true,
    subscription_amount_usd: 20,
    ht_connected: true,
    linked_ht_user_id: Number(data.user.id) || null,
    ht_connected_at: new Date().toISOString(),
  })
}

export async function startSubscriptionCheckout(): Promise<string> {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const res = await fetch('/api/hightribe/ewentcast/subscribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: authHeader(),
    },
    body: JSON.stringify({
      success_url: `${origin}/subscribe?success=1`,
      cancel_url: `${origin}/subscribe?canceled=1`,
    }),
  })
  const data = await res.json() as { checkout_url?: string; message?: string; status?: boolean }
  if (data.checkout_url) return data.checkout_url
  if (data.status && data.message?.includes('already active')) {
    await fetchAuthMe()
    throw new Error('ALREADY_ACTIVE')
  }
  throw new Error(data.message || 'Could not start checkout')
}

export async function connectHightribe(email: string, password: string): Promise<void> {
  const res = await fetch('/api/auth/connect-hightribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: authHeader(),
    },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json() as {
    status?: boolean
    message?: string
    ewentcast?: EwentcastAccount
    ht_link_token?: string
  }
  if (!res.ok || !data.status) {
    throw new Error(data.message || 'Connect failed')
  }
  if (data.ewentcast) setEwentcastAccount(data.ewentcast)
  if (data.ht_link_token) setHtLinkToken(data.ht_link_token)
}

export async function disconnectHightribe(): Promise<void> {
  const res = await fetch('/api/auth/disconnect-hightribe', {
    method: 'POST',
    headers: { Authorization: authHeader(), Accept: 'application/json' },
  })
  const data = await res.json() as { status?: boolean; ewentcast?: EwentcastAccount; message?: string }
  if (!res.ok || !data.status) throw new Error(data.message || 'Disconnect failed')
  if (data.ewentcast) setEwentcastAccount(data.ewentcast)
  setHtLinkToken(null)
}
