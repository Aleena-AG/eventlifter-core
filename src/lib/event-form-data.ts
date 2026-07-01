import { lumaEventToNorm, unwrapLumaEvent } from '@/lib/luma-event-utils'
import { getStoredEvent, type ChannelName } from '@/lib/channel-events-store'
import type { ChannelKey } from '@/lib/types'
import type { EventFormData } from '@/lib/publish-event'

function stripMs(s: string): string {
  return s.replace(/\.\d{3}Z$/, 'Z')
}

function optStr(v: unknown): string | undefined {
  const s = v != null ? String(v).trim() : ''
  return s || undefined
}

function parseCoord(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

function buildDateStr(date?: string, time?: string): string {
  if (!date) return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  const raw = time ? `${date}T${time}` : `${date}T00:00:00`
  return new Date(raw).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function utcParts(utc: string, tz: string): { date: string; time: string } {
  const d = new Date(utc)
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    })
    const parts = fmt.formatToParts(d)
    const get = (t: string) => parts.find(p => p.type === t)?.value || ''
    return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` }
  } catch {
    const pad = (n: number) => String(n).padStart(2, '0')
    return {
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    }
  }
}

interface NormEvent {
  title: string
  description: string
  startUtc: string
  endUtc: string
  timezone: string
  coverImage?: string
  isOnline: boolean
  venueName?: string
  address?: string
  city?: string
  country?: string
  lat?: number
  lng?: number
  currency?: string
  onlineUrl?: string
  requireApproval?: boolean
  capacity?: number
  visibility?: string
}

function normToForm(n: NormEvent): EventFormData {
  const tz = n.timezone || 'UTC'
  const start = utcParts(n.startUtc, tz)
  const end = utcParts(n.endUtc, tz)
  let format = 'In person'
  if (n.isOnline && (n.venueName || n.address || n.city)) format = 'Hybrid'
  else if (n.isOnline) format = 'Online'

  return {
    title: n.title,
    summary: '',
    description: n.description,
    coverUrl: n.coverImage || '',
    category: 'Music',
    tags: '',
    date: start.date,
    time: start.time,
    endDate: end.date,
    endTime: end.time,
    timezone: tz,
    format,
    venue: n.venueName || '',
    address: n.address || '',
    city: n.city || '',
    region: '',
    postal: '',
    country: n.country || '',
    lat: n.lat != null ? String(n.lat) : '',
    lng: n.lng != null ? String(n.lng) : '',
    onlineUrl: n.onlineUrl || '',
    ticketType: 'Free',
    price: '0',
    currency: n.currency || 'USD',
    capacity: n.capacity != null ? String(n.capacity) : '150',
    minPerOrder: '1',
    maxPerOrder: '8',
    salesStart: '',
    salesEnd: '',
    waitlist: false,
    visibility: n.visibility || 'Public',
    requireApproval: !!n.requireApproval,
    inviteOnly: false,
    showRemaining: true,
    password: '',
    hostName: '',
    refundPolicy: '',
    faq: '',
  }
}

function normFromPayload(channel: ChannelKey, raw: Record<string, unknown>): NormEvent {
  if (channel === 'hightribe') {
    const e = (raw.data as Record<string, unknown>) || raw
    const d = e.dates as Record<string, string> | undefined
    const loc = e.location as Record<string, unknown> | undefined
    const startUtc = d?.starts_at ? stripMs(d.starts_at) : buildDateStr(d?.start_date, d?.start_time)
    const endUtc = d?.ends_at ? stripMs(d.ends_at) : buildDateStr(d?.end_date, d?.end_time)
    const venueLabel = optStr(loc?.location)
    return {
      title: String(e.title || raw.title || ''),
      description: String(e.description || e.overview || ''),
      startUtc, endUtc,
      timezone: String(d?.timezone || e.timezone || 'UTC'),
      coverImage: optStr(e.cover_image),
      isOnline: loc?.type === 'online',
      venueName: venueLabel,
      address: optStr(loc?.address) || venueLabel,
      city: optStr(loc?.city),
      lat: parseCoord(loc?.lat),
      lng: parseCoord(loc?.lng),
      currency: optStr(e.currency),
    }
  }

  if (channel === 'luma') {
    const e = unwrapLumaEvent(raw.event ? raw : { event: raw })
    const norm = lumaEventToNorm(e)
    return {
      title: norm.title,
      description: norm.description,
      startUtc: norm.startUtc,
      endUtc: norm.endUtc,
      timezone: norm.timezone,
      coverImage: norm.coverImage,
      isOnline: norm.isOnline,
      onlineUrl: norm.onlineUrl,
      address: norm.address,
      city: norm.city,
      country: norm.country,
      lat: norm.lat,
      lng: norm.lng,
      requireApproval: !!(e.require_rsvp_approval),
      capacity: typeof e.capacity === 'number' ? e.capacity : undefined,
    }
  }

  const e = raw
  const start = e.start as Record<string, string> | undefined
  const end = e.end as Record<string, string> | undefined
  const name = e.name as { text?: string } | undefined
  const desc = e.description as { text?: string } | undefined
  const logo = e.logo as { original?: { url?: string }; url?: string } | undefined
  const venue = e.venue as Record<string, unknown> | undefined
  const addr = venue?.address as Record<string, unknown> | undefined
  return {
    title: name?.text || String(e.title || e.id || ''),
    description: desc?.text || '',
    startUtc: start?.utc ? stripMs(start.utc) : new Date().toISOString(),
    endUtc: end?.utc ? stripMs(end.utc) : new Date().toISOString(),
    timezone: start?.timezone || 'UTC',
    coverImage: logo?.original?.url || logo?.url,
    isOnline: !!(e.online_event),
    venueName: optStr(venue?.name),
    address: optStr(addr?.address_1) || optStr(addr?.localized_address_display),
    city: optStr(addr?.city),
    country: optStr(addr?.country),
    lat: parseCoord(venue?.latitude) ?? parseCoord(addr?.latitude),
    lng: parseCoord(venue?.longitude) ?? parseCoord(addr?.longitude),
    currency: optStr(e.currency),
    visibility: e.listed ? 'Public' : 'Unlisted',
  }
}

/** Load edit form data from MySQL cache (sync events first if missing). */
export async function loadEventFormData(channel: ChannelKey, eventId: string | number): Promise<EventFormData> {
  const stored = await getStoredEvent(channel as ChannelName, String(eventId))
  if (!stored) {
    throw new Error('Event not in database. Open Events and use Sync for this channel first.')
  }
  const norm = normFromPayload(channel, stored.payload)
  if (!norm.title && stored.title) norm.title = stored.title
  return normToForm(norm)
}

export { normToForm }
