// All requests go to Next.js App Router API routes (relative paths).
// No Express backend needed.

import { authHeader, clearAuth, isAuthErrorMessage } from './auth'

function withAuth(headers: Record<string, string> = {}): Record<string, string> {
  const auth = authHeader()
  if (auth) headers.Authorization = auth
  return headers
}

async function parseApiError(r: Response): Promise<never> {
  const d = await r.json().catch(() => ({})) as { error?: string; message?: string; code?: string }
  const message = d.error || d.message || `HTTP ${r.status}`
  if (r.status === 401 || isAuthErrorMessage(message)) {
    clearAuth()
    throw new Error('SESSION_EXPIRED')
  }
  if (r.status === 402 || d.code === 'SUBSCRIPTION_REQUIRED') {
    throw new Error('SUBSCRIPTION_REQUIRED')
  }
  throw new Error(message)
}

async function get<T = unknown>(path: string, opts?: { auth?: boolean }): Promise<T> {
  const headers = opts?.auth === false ? undefined : withAuth()
  const r = await fetch(path, headers ? { headers } : undefined)
    if (!r.ok) return parseApiError(r)
  return r.json() as Promise<T>
}

async function post<T = unknown>(path: string, body: unknown = {}, opts?: { auth?: boolean }): Promise<T> {
  const r = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(opts?.auth === false ? {} : withAuth()),
    },
    body: JSON.stringify(body),
  })
    if (!r.ok) return parseApiError(r)
  return r.json() as Promise<T>
}

async function put<T = unknown>(path: string, body: unknown = {}, opts?: { auth?: boolean }): Promise<T> {
  const r = await fetch(path, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(opts?.auth === false ? {} : withAuth()),
    },
    body: JSON.stringify(body),
  })
    if (!r.ok) return parseApiError(r)
  return r.json() as Promise<T>
}

async function del<T = unknown>(path: string): Promise<T> {
  const r = await fetch(path, { method: 'DELETE', headers: withAuth() })
    if (!r.ok) return parseApiError(r)
  return r.json() as Promise<T>
}

export const api = {
  // Settings
  getSettings: () => get('/api/settings'),
  updateSettings: (patch: object) => put('/api/settings', patch),

  // Luma
  getLumaConfig: () => get('/api/luma/users/self'),
  getLumaSelf: () => get('/api/luma/users/self'),
  getLumaCalendar: () => get('/api/luma/calendars'),
  getLumaHostedEvents: (query?: Record<string, string>) =>
    get('/api/luma/events/hosted' + (query ? '?' + new URLSearchParams(query) : '')),
  getLumaGuests: (eventApiId: string) =>
    get(`/api/luma/guests?event_id=${encodeURIComponent(eventApiId)}`),
  createLumaEvent: (body: object) => post('/api/luma/events/create', body),
  getLumaDiscover: (params?: Record<string, string>) =>
    get('/api/luma/discover' + (params ? '?' + new URLSearchParams(params) : '')),

  // Eventbrite
  getEbStatus: () => get('/api/eventbrite/status'),
  getEbMe: () => get('/api/eventbrite/users/me'),
  getEbOrganizations: () => get('/api/eventbrite/users/me/organizations'),
  getEbOrgEvents: (orgId: string) =>
    get(`/api/eventbrite/organizations/${encodeURIComponent(orgId)}/events`),
  getEbEvent: (id: string) => get(`/api/eventbrite/events/${encodeURIComponent(id)}`),
  getEbCategories: () => get('/api/eventbrite/categories'),

  // Hightribe
  getHtStatus: () => get('/api/hightribe/status'),

  // Convenience aliases used by settings page tests
  testLuma: () => post('/api/luma/verify-key', {}),
  testEventbrite: () => get('/api/eventbrite/status'),
}

// Named exports kept for backwards compat with existing page imports
import type { AppSettings, ConnectionsResponse, EventsResponse, EventStatusResponse, MasterEvent, PublishResult, ChannelKey, CreateEventPayload } from './types'
import { channelConnectionMap } from './channel-connection'

export async function getSettings(): Promise<AppSettings> {
  return get<AppSettings>('/api/settings')
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  return put<AppSettings>('/api/settings', patch)
}

export async function getLumaConfig(): Promise<unknown> {
  return get('/api/luma/users/self')
}

export async function getEventbriteStatus(): Promise<unknown> {
  return get('/api/eventbrite/status')
}

// These endpoints no longer exist in the standalone architecture.
// They return empty stubs so existing page code doesn't break at runtime.
export async function getConnections(_hostId: string): Promise<ConnectionsResponse> {
  const settings = await getSettings()
  const map = channelConnectionMap(settings)
  const channels = (['hightribe', 'eventbrite', 'luma'] as ChannelKey[]).map((channel) => ({
    channel,
    status: map[channel] ? ('connected' as const) : ('disconnected' as const),
  }))
  return { channels }
}

export async function connectChannel(channel: ChannelKey, body?: Record<string, unknown>): Promise<unknown> {
  if (channel === 'luma' && body?.apiKey) {
    // Save the API key to settings
    return put('/api/settings', { luma: { apiKey: body.apiKey } })
  }
  if (channel === 'eventbrite') {
    // OAuth flow — caller should open the redirect URL
    return { oauthRequired: true }
  }
  if (channel === 'hightribe') {
    return put('/api/settings', { hightribe: { serviceUrl: (body?.serviceUrl as string) || 'http://localhost:4000' } })
  }
  return {}
}

export async function disconnectChannel(channel: ChannelKey, _hostId: string): Promise<unknown> {
  if (channel === 'luma') return put('/api/settings', { luma: { apiKey: '' } })
  if (channel === 'eventbrite') return put('/api/settings', { eventbrite: { privateToken: '', clientId: '', clientSecret: '' } })
  if (channel === 'hightribe') return put('/api/settings', { hightribe: { serviceUrl: '' } })
  return {}
}

export async function getEvents(_hostId: string): Promise<EventsResponse> {
  // Fetch from Luma (best effort)
  try {
    const res = await get<{ data?: { entries?: Array<{ event?: { api_id?: string; name?: string; start_at?: string; end_at?: string; timezone?: string }; id?: string; name?: string; start_at?: string; end_at?: string; timezone?: string }> }; entries?: Array<{ event?: { api_id?: string; name?: string; start_at?: string; end_at?: string; timezone?: string }; id?: string; name?: string; start_at?: string; end_at?: string; timezone?: string }> }>('/api/luma/events/hosted?upcoming_only=false')
    const entries = res.data?.entries || res.entries || []
    const events: MasterEvent[] = entries.map((e) => {
      const ev = e.event || (e.id ? { api_id: e.id, name: e.name, start_at: e.start_at, end_at: e.end_at, timezone: e.timezone } : undefined)
      return {
        id: ev?.api_id || '',
        hostId: 'luma',
        title: ev?.name || 'Untitled',
        startUtc: ev?.start_at || new Date().toISOString(),
        endUtc: ev?.end_at || new Date().toISOString(),
        timezone: ev?.timezone || 'UTC',
        format: 'in_person' as const,
        ticketType: 'free' as const,
        priceCents: 0,
        currency: 'USD',
        visibility: 'public' as const,
        tags: [],
      }
    }).filter(e => e.id)
    return { events }
  } catch {
    return { events: [] }
  }
}

export async function getEventStatus(_eventId: string): Promise<EventStatusResponse> {
  return { channels: [] }
}

export async function createEvent(payload: CreateEventPayload): Promise<MasterEvent> {
  const body = {
    name: payload.title,
    summary: payload.summary,
    description: payload.description,
    start_at: payload.startUtc,
    end_at: payload.endUtc,
    timezone: payload.timezone,
    geo_address_json: payload.address ? {
      full_address: payload.address,
      city: payload.city,
      country: payload.country,
    } : undefined,
    meeting_url: payload.onlineUrl,
    require_rsvp_approval: false,
    capacity: payload.capacity,
    tags: payload.tags,
  }
  const res = await post<{ api_id?: string }>('/api/luma/events/create', body)
  return {
    id: res.api_id || String(Date.now()),
    hostId: payload.hostId,
    title: payload.title,
    summary: payload.summary,
    description: payload.description,
    startUtc: payload.startUtc,
    endUtc: payload.endUtc,
    timezone: payload.timezone,
    format: payload.format,
    ticketType: payload.ticketType,
    priceCents: payload.priceCents || 0,
    currency: payload.currency || 'USD',
    capacity: payload.capacity,
    visibility: payload.visibility,
    tags: payload.tags || [],
    venueName: payload.venueName,
    address: payload.address,
    city: payload.city,
    country: payload.country,
    onlineUrl: payload.onlineUrl,
  }
}

export async function publishEvent(
  _eventId: string,
  _channels?: ChannelKey[]
): Promise<{ channels: PublishResult[] }> {
  return { channels: [] }
}

export type { HealthResponse } from './types'
export async function getHealth() {
  return { ok: true, channels: [] }
}

// re-export del for any future use
export { del }
