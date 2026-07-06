import type { AppSettings } from '@/lib/settings-types'
import { lumaEntryMatchesId, unwrapLumaEvent } from '@/lib/luma-event-utils'

export class LumaApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public errorCode?: string,
  ) {
    super(message)
    this.name = 'LumaApiError'
  }
}

function isMaskedSecret(s: string): boolean {
  return !!s && s.includes('*')
}

function getConfig(settings: AppSettings) {
  const apiKey = settings.luma.apiKey?.trim() || ''
  const base = (settings.luma.apiBaseUrl || 'https://public-api.luma.com').replace(/\/$/, '')
  if (!apiKey || isMaskedSecret(apiKey)) {
    throw new LumaApiError('Luma API key not configured. Go to Settings → Luma.', 400)
  }
  return { apiKey, base }
}

async function lumaRequest(
  settings: AppSettings,
  method: string,
  path: string,
  opts?: { query?: Record<string, string>; body?: unknown },
): Promise<Record<string, unknown>> {
  const { apiKey, base } = getConfig(settings)
  const url = new URL(`${base}${path.startsWith('/') ? path : `/${path}`}`)
  if (opts?.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, v)
    }
  }

  const init: RequestInit = {
    method,
    headers: {
      'x-luma-api-key': apiKey,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  }
  if (opts?.body && method !== 'GET' && method !== 'HEAD') {
    init.body = JSON.stringify(opts.body)
  }

  const res = await fetch(url.toString(), init)
  const text = await res.text()
  let data: Record<string, unknown> = {}
  try { data = text ? JSON.parse(text) as Record<string, unknown> : {} } catch { data = { raw: text } }

  if (!res.ok) {
    const msg = String(data.message || data.error || text || `Luma HTTP ${res.status}`)
    throw new LumaApiError(msg, res.status, String(data.error || ''))
  }
  return data
}

/** Mirrors Hightribe Laravel LumaService::listHostedEvents */
export async function listHostedEvents(
  settings: AppSettings,
  query: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  const fetchAll = query.fetch_all === 'true'
  const upcomingOnly = query.upcoming_only !== 'false'

  const params: Record<string, string> = {
    platforms: 'luma',
    status: 'approved',
    sort_column: 'start_at',
    sort_direction: 'asc nulls last',
    ...query,
  }
  delete params.fetch_all
  delete params.upcoming_only

  if (upcomingOnly && !params.after) {
    params.after = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  }

  if (!fetchAll) {
    const result = await lumaRequest(settings, 'GET', '/v1/calendars/events/list', { query: params })
    return { ...result, source: 'luma_calendar_hosted' }
  }

  const allEntries: unknown[] = []
  let cursor: string | null = null
  do {
    if (cursor) params.pagination_cursor = cursor
    else delete params.pagination_cursor
    const page = await lumaRequest(settings, 'GET', '/v1/calendars/events/list', { query: params })
    const entries = page.entries
    if (Array.isArray(entries)) allEntries.push(...entries)
    cursor = page.next_cursor ? String(page.next_cursor) : null
  } while (cursor)

  return { entries: allEntries, count: allEntries.length, has_more: false, source: 'luma_calendar_hosted' }
}

function guestsQueryForEvent(eventId: string): Record<string, string> {
  return { event_id: eventId, event_api_id: eventId }
}

/** List guests for one event — current + legacy Luma API paths, with pagination. */
export async function listEventGuests(
  settings: AppSettings,
  eventId: string,
): Promise<Record<string, unknown>> {
  const id = String(eventId || '').trim()
  if (!id) throw new LumaApiError('event_id required', 400)

  const attempts: Array<{ path: string; baseQuery: Record<string, string> }> = [
    { path: '/v1/events/guests/list', baseQuery: guestsQueryForEvent(id) },
    { path: '/v1/event/get-guests', baseQuery: { event_api_id: id } },
  ]

  let lastErr: LumaApiError | null = null
  for (const { path, baseQuery } of attempts) {
    try {
      const allEntries: unknown[] = []
      const params = { ...baseQuery }
      let cursor: string | null = null
      let pages = 0
      do {
        if (cursor) params.pagination_cursor = cursor
        else delete params.pagination_cursor
        const page = await lumaRequest(settings, 'GET', path, { query: params })
        const entries = page.entries
        if (Array.isArray(entries)) {
          for (const entry of entries) {
            if (entry && typeof entry === 'object' && 'guest' in (entry as Record<string, unknown>)) {
              allEntries.push((entry as Record<string, unknown>).guest)
            } else {
              allEntries.push(entry)
            }
          }
        }
        cursor = page.next_cursor ? String(page.next_cursor) : null
        if (!page.has_more) cursor = null
        pages++
      } while (cursor && pages < 50)

      return { entries: allEntries, count: allEntries.length, total: allEntries.length }
    } catch (e) {
      if (e instanceof LumaApiError) lastErr = e
    }
  }

  throw lastErr || new LumaApiError(`Could not list guests for event ${id}`, 404)
}

function ticketTypesQuery(query: Record<string, string>): Record<string, string> {
  const eventId = query.event_id || query.event_api_id || query.api_id || query.id || ''
  if (!eventId) throw new LumaApiError('event_id required', 400)
  return { ...query, event_id: eventId, event_api_id: eventId }
}

/** Fetch one Luma event — tries current + legacy API params, then hosted list. */
export async function getLumaEvent(settings: AppSettings, eventId: string): Promise<Record<string, unknown>> {
  const attempts: Array<{ path: string; query: Record<string, string> }> = [
    { path: '/v1/events/get', query: { id: eventId } },
    { path: '/v1/events/get', query: { event_id: eventId } },
    { path: '/v1/events/get', query: { event_api_id: eventId } },
    { path: '/v1/events/get', query: { api_id: eventId } },
    { path: '/v1/event/get', query: { id: eventId } },
    { path: '/v1/event/get', query: { api_id: eventId } },
  ]

  let lastErr: LumaApiError | null = null
  for (const { path, query } of attempts) {
    try {
      return await lumaRequest(settings, 'GET', path, { query })
    } catch (e) {
      if (e instanceof LumaApiError) lastErr = e
    }
  }

  const list = await listHostedEvents(settings, { upcoming_only: 'false', fetch_all: 'true' })
  const entries = list.entries
  if (Array.isArray(entries)) {
    for (const entry of entries) {
      if (lumaEntryMatchesId(entry, eventId)) {
        const ev = unwrapLumaEvent(entry)
        return { event: ev }
      }
    }
  }

  throw lastErr || new LumaApiError(`Luma event not found: ${eventId}`, 404)
}

/** Two-step Luma cancel: request token, then confirm. */
export async function cancelLumaEvent(
  settings: AppSettings,
  eventId: string,
  opts?: { shouldRefund?: boolean },
): Promise<Record<string, unknown>> {
  const id = String(eventId)
  const requestPaths = ['/v1/events/cancel/request', '/v1/event/cancel/request']
  const cancelPaths = ['/v1/events/cancel', '/v1/event/cancel']

  let tokenData: Record<string, unknown> | null = null
  outer: for (const path of requestPaths) {
    for (const reqBody of [{ event_id: id }, { api_id: id }]) {
      try {
        tokenData = await lumaRequest(settings, 'POST', path, { body: reqBody })
        break outer
      } catch { /* try next body/path */ }
    }
  }
  if (!tokenData) throw new LumaApiError('Failed to request Luma cancellation token', 400)

  const nested = tokenData.data as Record<string, unknown> | undefined
  const cancellationToken = String(
    tokenData.cancellation_token || nested?.cancellation_token || '',
  )
  if (!cancellationToken) throw new LumaApiError('Luma did not return cancellation_token', 400)

  const cancelBody: Record<string, unknown> = {
    event_id: id,
    cancellation_token: cancellationToken,
  }
  const hasPaid = !!(tokenData.has_paid_guests ?? tokenData.has_paid_registrations ?? nested?.has_paid_guests)
  if (hasPaid || opts?.shouldRefund) cancelBody.should_refund = opts?.shouldRefund ?? true

  for (const path of cancelPaths) {
    try {
      return await lumaRequest(settings, 'POST', path, { body: cancelBody })
    } catch {
      try {
        return await lumaRequest(settings, 'POST', path, { body: { ...cancelBody, api_id: id } })
      } catch { /* try next path */ }
    }
  }
  throw new LumaApiError('Failed to cancel Luma event', 400)
}

/** Map Next.js proxy path segments to Luma API */
export async function proxyLumaPath(
  pathSegments: string[],
  method: string,
  query: Record<string, string>,
  body: unknown | undefined,
  settings: AppSettings,
): Promise<{ data: unknown; status: number }> {
  const path = pathSegments.join('/')

  if (path === 'events/hosted' && method === 'GET') {
    return { data: await listHostedEvents(settings, query), status: 200 }
  }

  if (path === 'events' && method === 'GET') {
    const eventId = query.api_id || query.id || query.event_id || query.event_api_id
    if (!eventId) throw new LumaApiError('api_id or event_id required', 400)
    return { data: await getLumaEvent(settings, eventId), status: 200 }
  }

  if (path === 'events' && method === 'POST') {
    return { data: await lumaRequest(settings, 'POST', '/v1/events/create', { body }), status: 201 }
  }

  if (path === 'events' && method === 'PUT') {
    return { data: await lumaRequest(settings, 'POST', '/v1/events/update', { body }), status: 200 }
  }

  if (path === 'events/create' && method === 'POST') {
    return { data: await lumaRequest(settings, 'POST', '/v1/events/create', { body }), status: 201 }
  }

  if (path === 'events/cancel' && method === 'POST') {
    const b = (body || {}) as Record<string, unknown>
    const eventId = String(b.event_id || b.api_id || b.id || '')
    if (!eventId) throw new LumaApiError('event_id required', 400)
    return {
      data: await cancelLumaEvent(settings, eventId, { shouldRefund: !!b.should_refund }),
      status: 200,
    }
  }

  if (path === 'users/self' && method === 'GET') {
    return { data: await lumaRequest(settings, 'GET', '/v1/users/get-self'), status: 200 }
  }

  if (path === 'calendars' && method === 'GET') {
    return { data: await lumaRequest(settings, 'GET', '/v1/calendars/get'), status: 200 }
  }

  if (path === 'webhooks' && method === 'GET') {
    return { data: await lumaRequest(settings, 'GET', '/v1/webhooks/list', { query }), status: 200 }
  }

  if (path === 'webhooks' && method === 'POST') {
    return { data: await lumaRequest(settings, 'POST', '/v2/webhooks/create', { body }), status: 201 }
  }

  if (path === 'webhooks' && method === 'PUT') {
    return { data: await lumaRequest(settings, 'POST', '/v2/webhooks/update', { body }), status: 200 }
  }

  if (path === 'webhooks' && method === 'DELETE') {
    return { data: await lumaRequest(settings, 'POST', '/v1/webhooks/delete', { body }), status: 200 }
  }

  if (path === 'ticket-types' && method === 'GET') {
    return { data: await lumaRequest(settings, 'GET', '/v1/event/ticket-types/list', { query: ticketTypesQuery(query) }), status: 200 }
  }

  if (path === 'ticket-types' && method === 'PUT') {
    return { data: await lumaRequest(settings, 'POST', '/v1/event/ticket-types/update', { body }), status: 200 }
  }

  if (path === 'guests' && method === 'GET') {
    const eventId = query.event_id || query.event_api_id || query.api_id || query.id
    if (!eventId) throw new LumaApiError('event_id required', 400)
    return { data: await listEventGuests(settings, eventId), status: 200 }
  }

  // Fallback: pass through as /v1/{path}
  const lumaPath = `/v1/${path.replace(/\//g, '/')}`
  if (method === 'GET') return { data: await lumaRequest(settings, 'GET', lumaPath, { query }), status: 200 }
  if (method === 'POST') return { data: await lumaRequest(settings, 'POST', lumaPath, { body }), status: 200 }
  if (method === 'PUT') return { data: await lumaRequest(settings, 'POST', lumaPath.replace('/update', '/update'), { body }), status: 200 }
  throw new LumaApiError(`Unsupported Luma route: ${method} ${path}`, 404)
}
