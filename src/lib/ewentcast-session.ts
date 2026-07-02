'use client'

import { authHeader, getToken, setToken, setUser, type HtUser } from '@/lib/auth'

export interface EwentcastAccount {
  auth_source: 'ewentcast_signup' | 'hightribe_native'
  subscription_plan: string
  subscription_status: string
  subscription_active: boolean
  subscription_amount_usd: number
  trial_ends_at?: string | null
  trial_days_remaining?: number | null
  current_period_end?: string | null
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
  if (account?.ht_connected || account?.auth_source === 'hightribe_native') {
    const link = getHtLinkToken()
    if (link) return `Bearer ${link}`
  }
  return authHeader()
}

export function isEwentcastSignupUser(): boolean {
  return getEwentcastAccount()?.auth_source === 'ewentcast_signup'
}

/** Luma/Eventbrite keys on Hightribe API — only when HT link token is available. */
export function canLoadHtChannelKeys(): boolean {
  if (!getToken()) return false
  if (isEwentcastSignupUser()) {
    const account = getEwentcastAccount()
    return !!(account?.ht_connected && getHtLinkToken())
  }
  return true
}

export function needsSubscription(): boolean {
  const account = getEwentcastAccount()
  return account?.auth_source === 'ewentcast_signup' && !account.subscription_active
}

export function isOnFreeTrial(): boolean {
  const account = getEwentcastAccount()
  return account?.auth_source === 'ewentcast_signup'
    && account.subscription_status === 'trialing'
    && account.subscription_active
}

export function getTrialDaysRemaining(): number | null {
  const account = getEwentcastAccount()
  if (!isOnFreeTrial()) return null
  if (account?.trial_days_remaining == null) return null
  return account.trial_days_remaining
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
  emailed?: boolean
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
    emailed?: boolean
    resetToken?: string
    resetUrl?: string
  }
  if (!res.ok || !data.status) throw new Error(data.message || 'Request failed')
  return { emailed: data.emailed, resetToken: data.resetToken, resetUrl: data.resetUrl }
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
  const res = await fetch('/api/auth/login-hightribe', {
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
    ht_link_token?: string
  }
  if (!res.ok || !data.status || !data.token || !data.user || !data.ewentcast) {
    throw new Error(data.message || 'HighTribe login failed')
  }
  setToken(data.token)
  setUser(data.user)
  setEwentcastAccount(data.ewentcast)
  if (data.ht_link_token) setHtLinkToken(data.ht_link_token)
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

export interface BillingTransaction {
  id: string | number
  type: string
  amount: number
  currency: string
  status: string
  description: string
  invoiceUrl: string | null
  createdAt: string
}

function parseBillingAmount(raw: Record<string, unknown>): { amount: number; currency: string } {
  const currency = String(raw.currency || 'usd').toLowerCase()
  if (typeof raw.amount === 'number') {
    return { amount: raw.amount, currency }
  }
  if (typeof raw.amount_cents === 'number') {
    return { amount: raw.amount_cents / 100, currency }
  }
  if (typeof raw.amount_usd === 'number') {
    return { amount: raw.amount_usd, currency: 'usd' }
  }
  return { amount: 0, currency }
}

function normalizeBillingTransaction(raw: Record<string, unknown>): BillingTransaction | null {
  const { amount, currency } = parseBillingAmount(raw)
  const createdAt = String(
    raw.created_at || raw.paid_at || raw.date || new Date().toISOString(),
  )
  const invoiceUrl = String(
    raw.invoice_url || raw.hosted_invoice_url || raw.receipt_url || '',
  ).trim() || null

  return {
    id: raw.id ?? raw.stripe_invoice_id ?? createdAt,
    type: String(raw.type || 'payment'),
    amount,
    currency,
    status: String(raw.status || 'paid'),
    description: String(raw.description || raw.plan || 'Ewentcast Pro'),
    invoiceUrl,
    createdAt,
  }
}

export async function fetchBillingTransactions(): Promise<BillingTransaction[]> {
  const res = await fetch('/api/billing/transactions', {
    headers: { Authorization: authHeader(), Accept: 'application/json' },
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({})) as {
    transactions?: Array<Record<string, unknown>>
    data?: Array<Record<string, unknown>>
  }
  const rows = data.transactions || data.data || []
  return rows
    .map((row) => normalizeBillingTransaction(row))
    .filter((row): row is BillingTransaction => row != null)
}

export async function openStripeBillingPortal(): Promise<string> {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const res = await fetch('/api/billing/portal', {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ return_url: `${origin}/settings` }),
  })
  const data = await res.json() as { portal_url?: string; message?: string; status?: boolean }
  if (data.portal_url) return data.portal_url
  throw new Error(data.message || 'Could not open billing portal')
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

function applyLocalHightribeDisconnect(): void {
  const account = getEwentcastAccount()
  if (account) {
    setEwentcastAccount({
      ...account,
      ht_connected: false,
      linked_ht_user_id: null,
      ht_connected_at: null,
    })
  }
  setHtLinkToken(null)
}

/** @returns true when the server confirmed disconnect */
export async function disconnectHightribe(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/disconnect-hightribe', {
      method: 'POST',
      headers: { Authorization: authHeader(), Accept: 'application/json' },
    })
    const data = await res.json().catch(() => ({})) as {
      status?: boolean
      ewentcast?: EwentcastAccount
      message?: string
    }
    if (res.ok && data.status) {
      if (data.ewentcast) setEwentcastAccount(data.ewentcast)
      else applyLocalHightribeDisconnect()
      setHtLinkToken(null)
      return true
    }
  } catch {
    // server unreachable — fall back to local disconnect below
  }

  applyLocalHightribeDisconnect()
  return false
}
