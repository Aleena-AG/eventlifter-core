import { authHeader, clearAuth, isAuthErrorMessage } from '@/lib/auth'
import { resolveClientApiUrl } from '@/lib/client-api-url'
import type { ChannelKey } from '@/lib/types'
import { unwrapSettingsResponse } from '@/lib/settings-response'

export type LumaConnectBody = {
  apiKey: string
  calendarId?: string
  apiBaseUrl?: string
  discoverBaseUrl?: string
}

export type EventbriteConnectBody = {
  privateToken: string
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  publicToken?: string
}

export type HightribeConnectBody = {
  apiKey: string
  serviceUrl?: string
  webhookSecret?: string
}

async function putSettings(patch: Record<string, unknown>): Promise<ReturnType<typeof unwrapSettingsResponse>> {
  const res = await fetch(resolveClientApiUrl('/api/settings'), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: authHeader(),
    },
    body: JSON.stringify(patch),
  })
  const data = await res.json().catch(() => ({})) as {
    error?: string
    message?: string
    code?: string
  }
  if (res.status === 401 || isAuthErrorMessage(data.message || data.error || '')) {
    clearAuth()
    throw new Error('SESSION_EXPIRED')
  }
  if (!res.ok) {
    throw new Error(data.message || data.error || `HTTP ${res.status}`)
  }
  return unwrapSettingsResponse(data)
}

async function deleteChannelSettings(channel: ChannelKey): Promise<void> {
  const res = await fetch(resolveClientApiUrl(`/api/settings/${encodeURIComponent(channel)}`), {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
      Authorization: authHeader(),
    },
  })
  const data = await res.json().catch(() => ({})) as { error?: string; message?: string }
  if (res.status === 401 || isAuthErrorMessage(data.message || data.error || '')) {
    clearAuth()
    throw new Error('SESSION_EXPIRED')
  }
  if (!res.ok) {
    throw new Error(data.message || data.error || `HTTP ${res.status}`)
  }
}

/** Connect Luma via PUT /api/v1/settings (proxied at /api/settings). */
export async function connectLuma(body: LumaConnectBody): Promise<unknown> {
  const apiKey = body.apiKey?.trim()
  if (!apiKey) throw new Error('Luma apiKey is required')
  return putSettings({
    luma: {
      apiKey,
      ...(body.calendarId ? { calendarId: body.calendarId } : {}),
      apiBaseUrl: body.apiBaseUrl || 'https://public-api.luma.com',
      discoverBaseUrl: body.discoverBaseUrl || 'https://api.lu.ma',
    },
  })
}

/** Connect Eventbrite via PUT /api/v1/settings. */
export async function connectEventbrite(body: EventbriteConnectBody): Promise<unknown> {
  const privateToken = body.privateToken?.trim()
  if (!privateToken) throw new Error('Eventbrite privateToken is required for sync')
  return putSettings({
    eventbrite: {
      privateToken,
      clientId: body.clientId || '',
      clientSecret: body.clientSecret || '',
      redirectUri: body.redirectUri || '',
      publicToken: body.publicToken || '',
    },
  })
}

/** Connect Hightribe via PUT /api/v1/settings (apiKey = HT token from login). */
export async function connectHightribeChannel(body: HightribeConnectBody): Promise<unknown> {
  const apiKey = body.apiKey?.trim()
  if (!apiKey) throw new Error('Hightribe apiKey is required')
  return putSettings({
    hightribe: {
      apiKey,
      serviceUrl: (body.serviceUrl || 'https://api.hightribe.com').replace(/\/$/, ''),
      ...(body.webhookSecret !== undefined ? { webhookSecret: body.webhookSecret } : {}),
    },
  })
}

export type HightribeLoginConnectResult = {
  htToken: string
  settings: unknown
}

/**
 * User enters Hightribe email + password on the frontend.
 * We login to Hightribe ourselves, then store the returned token as settings.apiKey:
 *
 *   POST https://api.hightribe.com/api/login  { email, password }
 *   PUT  /api/v1/settings  { hightribe: { serviceUrl, apiKey: <token>, webhookSecret? } }
 */
export async function connectHightribeWithPassword(opts: {
  email: string
  password: string
  serviceUrl?: string
  webhookSecret?: string
}): Promise<HightribeLoginConnectResult> {
  const email = opts.email.trim()
  const password = opts.password
  if (!email || !password) {
    throw new Error('Hightribe email and password are required')
  }

  const loginRes = await fetch(resolveClientApiUrl('/api/hightribe/login'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })
  const loginData = await loginRes.json().catch(() => ({})) as {
    status?: boolean
    success?: boolean
    token?: string
    message?: string
    error?: string
  }

  const htTokenRaw = loginData.token
  const loginOk = loginRes.ok && (loginData.status === true || loginData.success === true || !!htTokenRaw)
  if (!loginOk || !htTokenRaw) {
    throw new Error(
      loginData.message || loginData.error || 'Invalid Hightribe email or password',
    )
  }

  const htToken = htTokenRaw.startsWith('Bearer ') ? htTokenRaw.slice(7) : htTokenRaw
  const settings = await connectHightribeChannel({
    apiKey: htToken,
    serviceUrl: opts.serviceUrl || 'https://api.hightribe.com',
    webhookSecret: opts.webhookSecret ?? '',
  })

  return { htToken, settings }
}

/** Disconnect one channel via DELETE /api/v1/settings/:channel. */
export async function disconnectChannelSettings(channel: ChannelKey): Promise<void> {
  if (channel !== 'luma' && channel !== 'eventbrite' && channel !== 'hightribe') {
    throw new Error('Unknown channel')
  }
  await deleteChannelSettings(channel)
}

/** After connect, pull events from the channel provider. */
export async function syncChannelFromApi(channel: ChannelKey): Promise<unknown> {
  const res = await fetch(resolveClientApiUrl(`/api/events/${encodeURIComponent(channel)}/sync-from-api`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: authHeader(),
    },
    body: '{}',
  })
  const data = await res.json().catch(() => ({})) as { error?: string; message?: string }
  if (res.status === 401 || isAuthErrorMessage(data.message || data.error || '')) {
    clearAuth()
    throw new Error('SESSION_EXPIRED')
  }
  if (!res.ok) {
    throw new Error(data.message || data.error || `Sync failed (${res.status})`)
  }
  return data
}
