import { inferTimezoneFromEvent } from '@/lib/eventbrite-timezone'

function stripMs(s: string): string {
  return s.replace(/\.\d{3}Z$/, 'Z')
}

/** Match Luma event ids across `id`, `api_id`, and list entry shapes. */
export function lumaEventRecordId(e: Record<string, unknown>): string {
  return String(e.id || e.api_id || '')
}

export function lumaEntryMatchesId(entry: unknown, eventId: string | number): boolean {
  if (!entry || typeof entry !== 'object') return false
  const top = entry as Record<string, unknown>
  const ev = unwrapLumaEvent(entry)
  const target = String(eventId)
  const candidates = [top.id, top.api_id, ev.id, ev.api_id].filter(v => v != null && v !== '').map(String)
  return candidates.includes(target)
}

function lumaName(e: Record<string, unknown>): string {
  if (typeof e.name === 'string') return e.name.trim()
  if (e.name && typeof e.name === 'object') {
    const n = e.name as Record<string, unknown>
    const s = String(n.text || n.html || n.title || '').trim()
    if (s) return s
  }
  return String(e.title || '').trim()
}

/** Luma list/get responses may nest fields under `event` or use flat entries. */
export function unwrapLumaEvent(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') return {}
  const payload = data as Record<string, unknown>
  const nested = payload.event
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const inner = nested as Record<string, unknown>
    return {
      ...payload,
      ...inner,
      name: inner.name ?? payload.name,
      title: inner.title ?? payload.title,
      description: inner.description ?? payload.description,
      cover_url: inner.cover_url ?? payload.cover_url,
      geo_address_json: inner.geo_address_json ?? payload.geo_address_json,
      meeting_url: inner.meeting_url ?? payload.meeting_url,
      start_at: inner.start_at ?? payload.start_at,
      end_at: inner.end_at ?? payload.end_at,
      timezone: inner.timezone ?? inner.time_zone ?? payload.timezone ?? payload.time_zone,
    }
  }
  return payload
}

/** Normalise Luma event fields for cross-channel publish / edit forms. */
export function lumaEventToNorm(e: Record<string, unknown>) {
  const geo = (e.geo_address_json || {}) as Record<string, unknown>
  const startAt = e.start_at ? stripMs(String(e.start_at)) : new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  const endAt = e.end_at
    ? stripMs(String(e.end_at))
    : new Date(Date.now() + 3600_000).toISOString().replace(/\.\d{3}Z$/, 'Z')
  const desc = e.description ?? e.description_md ?? e.description_html ?? ''
  return {
    title: lumaName(e),
    description: String(desc || ''),
    startUtc: startAt,
    endUtc: endAt,
    timezone: inferTimezoneFromEvent(e, geo),
    coverImage: e.cover_url != null ? String(e.cover_url).trim() || undefined : undefined,
    isOnline: !!(e.meeting_url),
    onlineUrl: e.meeting_url != null ? String(e.meeting_url).trim() || undefined : undefined,
    address: geo.address != null ? String(geo.address).trim() || undefined
      : geo.full_address != null ? String(geo.full_address).trim() || undefined : undefined,
    city: geo.city != null ? String(geo.city).trim() || undefined : undefined,
    country: geo.country != null ? String(geo.country).trim() || undefined : undefined,
    lat: typeof geo.latitude === 'number' ? geo.latitude
      : typeof geo.latitude === 'string' && geo.latitude.trim() ? parseFloat(geo.latitude) : undefined,
    lng: typeof geo.longitude === 'number' ? geo.longitude
      : typeof geo.longitude === 'string' && geo.longitude.trim() ? parseFloat(geo.longitude) : undefined,
    capacity: typeof e.capacity === 'number' && e.capacity > 0 ? e.capacity : undefined,
  }
}
