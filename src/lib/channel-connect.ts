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
  /** Optional — stored for UI if backend accepts it. */
  email?: string
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

  // Some backends DELETE events only and leave apiKey — clear credentials so refresh stays disconnected.
  try {
    await clearChannelCredentials(channel)
  } catch {
    // DELETE already succeeded; credentials clear is best-effort
  }
}

/** PUT empty credentials so GET /settings → channel.configured === false. */
async function clearChannelCredentials(channel: ChannelKey): Promise<void> {
  if (channel === 'hightribe') {
    await putSettings({
      hightribe: {
        serviceUrl: 'https://api.hightribe.com',
        apiKey: '',
        webhookSecret: '',
      },
    })
  } else if (channel === 'luma') {
    await putSettings({
      luma: {
        apiKey: '',
        calendarId: '',
        apiBaseUrl: 'https://public-api.luma.com',
        discoverBaseUrl: 'https://api.lu.ma',
      },
    })
  } else if (channel === 'eventbrite') {
    await putSettings({
      eventbrite: {
        privateToken: '',
        clientId: '',
        clientSecret: '',
        redirectUri: '',
        publicToken: '',
      },
    })
  }

  // Confirm disconnect stuck — some APIs ignore empty strings and keep the old key.
  const { getSettings } = await import('@/lib/api')
  const saved = await getSettings() as Record<string, { configured?: boolean } | undefined>
  if (saved[channel]?.configured === true) {
    // Second pass with null so backends that skip empty strings still clear.
    if (channel === 'hightribe') {
      await putSettings({ hightribe: { serviceUrl: 'https://api.hightribe.com', apiKey: null, webhookSecret: null } })
    } else if (channel === 'luma') {
      await putSettings({ luma: { apiKey: null, calendarId: null } })
    } else if (channel === 'eventbrite') {
      await putSettings({ eventbrite: { privateToken: null } })
    }
  }
}

/** Connect Luma via PUT /api/v1/settings (proxied at /api/settings). */
export async function connectLuma(body: LumaConnectBody): Promise<unknown> {
  const apiKey = body.apiKey?.trim()
  if (!apiKey) throw new Error('Luma apiKey is required')
  const apiBaseUrl = body.apiBaseUrl || 'https://public-api.luma.com'
  const discoverBaseUrl = body.discoverBaseUrl || 'https://api.lu.ma'
  // Send camelCase + snake_case — remote backends differ on which they persist.
  return putSettings({
    luma: {
      apiKey,
      api_key: apiKey,
      ...(body.calendarId
        ? { calendarId: body.calendarId, calendar_id: body.calendarId }
        : {}),
      apiBaseUrl,
      api_base_url: apiBaseUrl,
      discoverBaseUrl,
      discover_base_url: discoverBaseUrl,
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
      private_token: privateToken,
      clientId: body.clientId || '',
      client_id: body.clientId || '',
      clientSecret: body.clientSecret || '',
      client_secret: body.clientSecret || '',
      redirectUri: body.redirectUri || '',
      redirect_uri: body.redirectUri || '',
      publicToken: body.publicToken || '',
      public_token: body.publicToken || '',
    },
  })
}

/** Connect Hightribe via PUT /api/v1/settings — exact contract:
 *   { hightribe: { serviceUrl, apiKey, webhookSecret } }
 * Optional email is saved when the backend accepts it (for Settings UI).
 */
export async function connectHightribeChannel(body: HightribeConnectBody): Promise<unknown> {
  const apiKey = body.apiKey?.trim()
  if (!apiKey) throw new Error('Hightribe apiKey is required')
  const serviceUrl = (body.serviceUrl || 'https://api.hightribe.com').replace(/\/$/, '')
  const webhookSecret = body.webhookSecret ?? ''
  const email = body.email?.trim() || undefined
  return putSettings({
    hightribe: {
      serviceUrl,
      apiKey,
      webhookSecret,
      ...(email ? { email } : {}),
    },
  })
}

export type HightribeLoginConnectResult = {
  htToken: string
  settings: unknown
  configured: boolean
}

/** Pull HT apiKey from /api/hightribe/login response shapes. */
function extractHightribeLoginToken(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return ''
  const root = raw as Record<string, unknown>
  const nested = root.data && typeof root.data === 'object'
    ? (root.data as Record<string, unknown>)
    : null
  const candidates = [
    root.token,
    root.access_token,
    root.apiKey,
    root.api_key,
    nested?.token,
    nested?.access_token,
    nested?.apiKey,
    nested?.api_key,
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) {
      const t = c.trim()
      return t.startsWith('Bearer ') ? t.slice(7) : t
    }
  }
  return ''
}

/**
 * Hightribe connect (settings only — backend has no /hightribe/login route):
 *
 *   1) POST https://api.hightribe.com/api/login { email, password }  → HT token
 *   2) PUT  /api/v1/settings { hightribe: { serviceUrl, apiKey, webhookSecret } }
 *      (Bearer = Ewentcast session)
 *   3) Connected when GET /api/v1/settings → hightribe.configured === true
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
  if (!authHeader()) {
    throw new Error('Sign in to Ewentcast first, then connect Hightribe')
  }

  const serviceUrl = (opts.serviceUrl || 'https://api.hightribe.com').replace(/\/$/, '')

  // Backend has no /api/v1/hightribe/login — login on Hightribe itself, then save via settings.
  const loginRes = await fetch(`${serviceUrl}/api/login`, {
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
    message?: string
    error?: string
  }

  const htToken = extractHightribeLoginToken(loginData)
  const loginOk =
    loginRes.ok
    && (loginData.status === true || loginData.success === true || !!htToken)

  if (!loginOk || !htToken) {
    throw new Error(
      loginData.message || loginData.error || 'Invalid Hightribe email or password',
    )
  }

  // Connect = PUT /api/v1/settings only.
  const settings = await connectHightribeChannel({
    apiKey: htToken,
    serviceUrl,
    webhookSecret: opts.webhookSecret ?? '',
    email,
  })

  const { getSettings } = await import('@/lib/api')
  const saved = await getSettings() as {
    hightribe?: { configured?: boolean }
  }
  const configured = saved.hightribe?.configured === true
    || (settings as { hightribe?: { configured?: boolean } })?.hightribe?.configured === true

  return { htToken, settings, configured }
}

/** Disconnect one channel via DELETE /api/v1/settings/:channel. */
export async function disconnectChannelSettings(channel: ChannelKey): Promise<void> {
  if (channel !== 'luma' && channel !== 'eventbrite' && channel !== 'hightribe') {
    throw new Error('Unknown channel')
  }
  await deleteChannelSettings(channel)
}

export type ChannelSyncFromApiResult = {
  events: number
  pruned: number
  bookings: number
  raw?: unknown
}

/** Pull events from the channel provider via POST /api/v1/events/:channel/sync-from-api. */
export async function syncChannelFromApi(channel: ChannelKey): Promise<ChannelSyncFromApiResult> {
  const res = await fetch(resolveClientApiUrl(`/api/events/${encodeURIComponent(channel)}/sync-from-api`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: authHeader(),
    },
    body: '{}',
  })
  const data = await res.json().catch(() => ({})) as {
    error?: string
    message?: string
    upserted?: number
    pruned?: number
    events?: number
    bookings?: number
    data?: {
      upserted?: number
      pruned?: number
      events?: number
      bookings?: number
    }
  }
  if (res.status === 401 || isAuthErrorMessage(data.message || data.error || '')) {
    clearAuth()
    throw new Error('SESSION_EXPIRED')
  }
  if (!res.ok) {
    throw new Error(data.message || data.error || `Sync failed (${res.status})`)
  }
  const inner = data.data || data
  return {
    events: Number(inner.events ?? inner.upserted ?? 0) || 0,
    pruned: Number(inner.pruned ?? 0) || 0,
    bookings: Number(inner.bookings ?? 0) || 0,
    raw: data,
  }
}
