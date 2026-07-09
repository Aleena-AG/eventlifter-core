import { lumaEventToNorm, unwrapLumaEvent } from '@/lib/luma-event-utils'
import { channelFetch } from '@/lib/channel-fetch'
import { getStoredEvent, type ChannelName } from '@/lib/channel-events-store'
import { canonicalizeCountry } from '@/components/ewentcast/location-data'
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

function parseMoney(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

function parseEbCost(raw: unknown): number | undefined {
  if (raw == null) return undefined
  const str = String(raw)
  const minorMatch = str.match(/(\d+)\s*$/)
  if (minorMatch && /[A-Z]{3}/i.test(str)) {
    return parseInt(minorMatch[1], 10) / 100
  }
  const major = parseMoney(raw)
  if (major == null) return undefined
  return major > 1000 ? major / 100 : major
}

/** Pull city/country from a free-form address when APIs leave them null. */
function inferPlaceFromAddress(address?: string): { city?: string; country?: string; region?: string } {
  if (!address) return {}
  const parts = address.split(',').map(p => p.trim()).filter(Boolean)
  if (!parts.length) return {}

  let country: string | undefined
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i]
    const canon = canonicalizeCountry(part)
    const looksLikeCode = /^[A-Za-z]{2}$/.test(part)
    if (looksLikeCode || (canon && canon !== part)) {
      country = canon
      break
    }
    const byName = canonicalizeCountry(part)
    if (byName && COUNTRY_NAME_SET.has(byName.toLowerCase())) {
      country = byName
      break
    }
  }

  const knownCities = [
    'Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar', 'Quetta',
    'Dubai', 'Abu Dhabi', 'London', 'New York', 'Los Angeles', 'Chicago', 'Toronto', 'Sydney',
    'Melbourne', 'Singapore', 'Berlin', 'Paris',
  ]
  let city: string | undefined
  for (const part of parts) {
    const hit = knownCities.find(c =>
      c.toLowerCase() === part.toLowerCase()
      || part.toLowerCase().startsWith(c.toLowerCase() + ' '),
    )
    if (hit) { city = hit; break }
  }
  if (!city) {
    const idx = country
      ? parts.findIndex(p => canonicalizeCountry(p) === country)
      : -1
    const candidate = idx > 0 ? parts[idx - 1] : parts.length >= 2 ? parts[parts.length - 2] : undefined
    if (candidate && candidate.length < 40 && !/^\d/.test(candidate) && canonicalizeCountry(candidate) === candidate) {
      city = candidate
    }
  }

  return { city, country }
}

const COUNTRY_NAME_SET = new Set(
  // filled after import — see canonicalizeCountry usage above
  ['pakistan', 'united states', 'united kingdom', 'united arab emirates', 'india', 'canada',
    'australia', 'germany', 'france', 'spain', 'italy', 'netherlands', 'saudi arabia', 'qatar',
    'turkey', 'singapore', 'malaysia', 'indonesia', 'china', 'japan', 'south korea', 'brazil',
    'mexico', 'south africa', 'nigeria', 'egypt', 'bangladesh', 'ireland', 'switzerland',
    'sweden', 'norway', 'denmark', 'belgium', 'portugal', 'poland', 'new zealand'],
)

function mapPublishStatus(raw?: string | null, isPublic?: boolean | null): string {
  const s = String(raw || '').trim().toLowerCase()
  if (/draft|unpublished|pending/.test(s)) return 'Draft'
  if (/published|live|public|active/.test(s)) return 'Published'
  if (isPublic === false) return 'Draft'
  if (isPublic === true) return 'Published'
  return 'Draft'
}

function mapVisibility(raw?: string | null, listed?: boolean | null, isPublic?: boolean | null): string {
  const s = String(raw || '').trim().toLowerCase()
  if (s === 'private' || s === 'member-only' || s === 'member_only' || s === 'members') return 'Private'
  if (s === 'unlisted' || s === 'invite' || s === 'invite-only') return 'Unlisted'
  if (s === 'public') return 'Public'
  if (listed === false || isPublic === false) return 'Unlisted'
  if (listed === true || isPublic === true) return 'Public'
  return 'Public'
}

function pickHostName(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
    if (c && typeof c === 'object') {
      const o = c as Record<string, unknown>
      const nested = optStr(o.name) || optStr(o.full_name) || optStr(o.display_name) || optStr(o.title)
      if (nested) return nested
    }
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
  status?: string
  visibility?: string
  hostName?: string
  ticketType?: string
  ticketPrice?: number
  minPerOrder?: number
  maxPerOrder?: number
  htTicketId?: string
  htTicketName?: string
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
    country: canonicalizeCountry(n.country) || '',
    lat: n.lat != null ? String(n.lat) : '',
    lng: n.lng != null ? String(n.lng) : '',
    onlineUrl: n.onlineUrl || '',
    ticketType: n.ticketType || (n.ticketPrice != null && n.ticketPrice > 0 ? 'Paid' : n.ticketPrice === 0 ? 'Free' : ''),
    price: n.ticketPrice != null ? String(n.ticketPrice) : '',
    currency: 'USD',
    capacity: n.capacity != null ? String(n.capacity) : '150',
    minPerOrder: n.minPerOrder != null ? String(n.minPerOrder) : '1',
    maxPerOrder: n.maxPerOrder != null ? String(n.maxPerOrder) : '8',
    salesStart: '',
    salesEnd: '',
    waitlist: false,
    status: n.status || 'Draft',
    visibility: n.visibility || 'Public',
    requireApproval: !!n.requireApproval,
    inviteOnly: false,
    showRemaining: true,
    password: '',
    hostName: n.hostName || '',
    refundPolicy: '',
    faq: '',
    htTicketId: n.htTicketId || '',
    htTicketName: n.htTicketName || 'General Admission',
  }
}

function hightribeCoverUrl(e: Record<string, unknown>, raw: Record<string, unknown>): string | undefined {
  const direct =
    optStr(e.cover_image) ||
    optStr(e.cover_url) ||
    optStr(raw.cover_image) ||
    optStr(raw.cover_url)
  if (direct) return direct

  const ratios = Array.isArray(e.cover_image_aspect_ratio)
    ? e.cover_image_aspect_ratio
    : Array.isArray(raw.cover_image_aspect_ratio)
      ? raw.cover_image_aspect_ratio
      : []
  for (const item of ratios) {
    if (!item || typeof item !== 'object') continue
    const img = optStr((item as Record<string, unknown>).image)
    if (img) return img
  }
  return undefined
}

function normFromPayload(channel: ChannelKey, raw: Record<string, unknown>): NormEvent {
  if (channel === 'hightribe') {
    const e = (raw.data as Record<string, unknown>) || raw
    const d = e.dates as Record<string, string> | undefined
    const loc = e.location as Record<string, unknown> | undefined
    const startUtc = d?.starts_at ? stripMs(d.starts_at) : buildDateStr(d?.start_date, d?.start_time)
    const endUtc = d?.ends_at ? stripMs(d.ends_at) : buildDateStr(d?.end_date, d?.end_time)
    const venueLabel = optStr(loc?.location) || optStr(loc?.venue_name)
    const ticketsRaw = (Array.isArray(e.tickets) ? e.tickets : Array.isArray(raw.tickets) ? raw.tickets : []) as Array<Record<string, unknown>>
    const ticket = ticketsRaw[0]
    const ticketSetting = (e.ticket_setting || e.ticketSetting || {}) as Record<string, unknown>
    const rawPrice = ticket ? parseMoney(ticket.price) : undefined
    // Prefer base ticket.price for edit — don't guess Free when price is missing.
    const effectivePrice = rawPrice
    const ticketQty = ticket ? parseInt(String(ticket.quantity ?? ''), 10) : undefined
    const address = optStr(loc?.address) || venueLabel
    const inferred = inferPlaceFromAddress(address)
    const city = optStr(loc?.city) || inferred.city
    const country = canonicalizeCountry(optStr(loc?.country)) || inferred.country
    return {
      title: String(e.title || raw.title || ''),
      description: String(e.description || e.overview || ''),
      startUtc, endUtc,
      timezone: String(d?.timezone || e.timezone || raw.timezone || 'UTC'),
      coverImage: hightribeCoverUrl(e, raw),
      isOnline: loc?.type === 'online',
      venueName: venueLabel,
      address,
      city,
      country,
      lat: parseCoord(loc?.lat),
      lng: parseCoord(loc?.lng),
      currency: 'USD',
      capacity: Number.isFinite(ticketQty) && ticketQty! > 0 ? ticketQty : undefined,
      status: mapPublishStatus(
        String(e.publish_status || e.status || raw.publish_status || raw.status || ''),
        typeof e.is_public === 'boolean' ? e.is_public : typeof raw.is_public === 'boolean' ? raw.is_public as boolean : null,
      ),
      visibility: mapVisibility(
        optStr(e.visibility),
        null,
        typeof e.is_public === 'boolean' ? e.is_public : typeof raw.is_public === 'boolean' ? raw.is_public as boolean : null,
      ),
      hostName: pickHostName(
        e.host_name, e.organizer_name, e.host, e.organizer,
        raw.host_name, raw.organizer_name, e.user, e.creator,
      ),
      ticketType: effectivePrice != null && effectivePrice <= 0 ? 'Free' : effectivePrice != null ? 'Paid' : undefined,
      ticketPrice: effectivePrice,
      minPerOrder: parseInt(String(ticketSetting.min_qty ?? ticketSetting.minQty ?? ''), 10) || undefined,
      maxPerOrder: parseInt(String(ticketSetting.max_qty ?? ticketSetting.maxQty ?? ''), 10) || undefined,
      htTicketId: ticket?.id != null ? String(ticket.id) : undefined,
      htTicketName: ticket?.name != null ? String(ticket.name) : undefined,
    }
  }

  if (channel === 'luma') {
    const e = unwrapLumaEvent(raw.event ? raw : { event: raw })
    const norm = lumaEventToNorm(e)
    const inferred = inferPlaceFromAddress(norm.address)
    const ticketTypes = (
      Array.isArray(e.ticket_types) ? e.ticket_types
        : Array.isArray(raw.ticket_types) ? raw.ticket_types
          : []
    ) as Array<Record<string, unknown>>
    const ticket = ticketTypes[0]
    let ticketPrice: number | undefined
    let ticketType: string | undefined
    if (ticket) {
      const cents = parseMoney(ticket.cents ?? ticket.price_cents ?? ticket.amount_cents)
      const major = parseMoney(ticket.price ?? ticket.amount)
      if (cents != null) ticketPrice = cents / 100
      else if (major != null) ticketPrice = major
      if (ticketPrice != null) {
        ticketType = ticketPrice <= 0 || !!ticket.is_free || String(ticket.type || '').toLowerCase() === 'free'
          ? 'Free' : 'Paid'
        if (ticketType === 'Free') ticketPrice = 0
      }
    }
    return {
      title: norm.title,
      description: norm.description,
      startUtc: norm.startUtc,
      endUtc: norm.endUtc,
      timezone: norm.timezone || String(raw.timezone || e.timezone || 'UTC'),
      coverImage: norm.coverImage,
      isOnline: norm.isOnline,
      onlineUrl: norm.onlineUrl,
      address: norm.address,
      city: norm.city || inferred.city,
      country: canonicalizeCountry(norm.country) || inferred.country,
      lat: norm.lat,
      lng: norm.lng,
      requireApproval: !!(e.require_rsvp_approval),
      capacity: typeof e.capacity === 'number' ? e.capacity : undefined,
      status: mapPublishStatus(String(e.status || raw.status || '')),
      visibility: mapVisibility(String(e.visibility || raw.visibility || '')),
      hostName: pickHostName(e.host, e.host_name, e.organizer, e.hosts, raw.host),
      ticketType,
      ticketPrice,
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
  const address = optStr(addr?.address_1) || optStr(addr?.localized_address_display)
  const inferred = inferPlaceFromAddress(address)
  const ticketClasses = (
    Array.isArray(e.ticket_classes) ? e.ticket_classes
      : Array.isArray(e.ticket_class) ? e.ticket_class
        : []
  ) as Array<Record<string, unknown>>
  const tc = ticketClasses[0]
  let ticketPrice: number | undefined
  let ticketType: string | undefined
  if (tc) {
    ticketPrice = parseEbCost(tc.cost ?? tc.actual_cost)
    if (tc.free === true || (ticketPrice != null && ticketPrice <= 0)) {
      ticketType = 'Free'
      ticketPrice = 0
    } else if (ticketPrice != null && ticketPrice > 0) {
      ticketType = 'Paid'
    }
  } else if (typeof e.is_free === 'boolean') {
    ticketType = e.is_free ? 'Free' : undefined
    if (e.is_free) ticketPrice = 0
  }
  const tcQty = tc ? parseInt(String(tc.quantity_total ?? tc.quantity ?? ''), 10) : undefined
  return {
    title: name?.text || String(e.title || e.id || ''),
    description: desc?.text || '',
    startUtc: start?.utc ? stripMs(start.utc) : new Date().toISOString(),
    endUtc: end?.utc ? stripMs(end.utc) : new Date().toISOString(),
    timezone: start?.timezone || String(e.timezone || 'UTC'),
    coverImage: logo?.original?.url || logo?.url,
    isOnline: !!(e.online_event),
    venueName: optStr(venue?.name),
    address,
    city: optStr(addr?.city) || inferred.city,
    country: canonicalizeCountry(optStr(addr?.country)) || inferred.country,
    lat: parseCoord(venue?.latitude) ?? parseCoord(addr?.latitude),
    lng: parseCoord(venue?.longitude) ?? parseCoord(addr?.longitude),
    currency: 'USD',
    status: mapPublishStatus(String(e.status || '')),
    visibility: mapVisibility(null, typeof e.listed === 'boolean' ? e.listed : null),
    hostName: pickHostName(e.organizer, e.organizer_name, e.host, e.host_name),
    capacity: Number.isFinite(tcQty) && tcQty! > 0 ? tcQty : undefined,
    ticketType,
    ticketPrice,
    htTicketName: tc?.name != null ? String(tc.name) : undefined,
  }
}

/** Load edit form data from stored cache; refresh tickets from channel APIs when possible. */
async function loadHightribeTickets(eventId: string | number): Promise<Array<Record<string, unknown>>> {
  try {
    const res = await channelFetch(
      `/api/hightribe/tickets?ticketable_type=event&ticketable_id=${encodeURIComponent(String(eventId))}`,
    )
    if (!res.ok) return []
    const raw = await res.json() as { data?: { tickets?: Array<Record<string, unknown>> } }
    const list = raw.data?.tickets
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

async function loadEventbriteTickets(eventId: string | number): Promise<Array<Record<string, unknown>>> {
  try {
    const res = await channelFetch(`/api/eventbrite/events/${eventId}/ticket_classes`)
    if (!res.ok) return []
    const raw = await res.json() as { ticket_classes?: Array<Record<string, unknown>> }
    return Array.isArray(raw.ticket_classes) ? raw.ticket_classes : []
  } catch {
    return []
  }
}

async function loadLumaTickets(eventId: string | number): Promise<Array<Record<string, unknown>>> {
  try {
    const res = await channelFetch(
      `/api/luma/ticket-types?event_id=${encodeURIComponent(String(eventId))}`,
    )
    if (!res.ok) return []
    const raw = await res.json() as {
      ticket_types?: Array<Record<string, unknown>>
      data?: { ticket_types?: Array<Record<string, unknown>> }
    }
    const list = raw.ticket_types || raw.data?.ticket_types
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function applyTicketToNorm(norm: NormEvent, ticket: Record<string, unknown>, channel: ChannelKey) {
  if (channel === 'hightribe') {
    if (ticket.id != null) norm.htTicketId = String(ticket.id)
    if (ticket.name != null) norm.htTicketName = String(ticket.name)
    const p = parseMoney(ticket.price)
    if (p != null) {
      norm.ticketPrice = p
      norm.ticketType = p <= 0 ? 'Free' : 'Paid'
    }
    const qty = parseInt(String(ticket.quantity ?? ''), 10)
    if (Number.isFinite(qty) && qty > 0) norm.capacity = qty
    return
  }
  if (channel === 'eventbrite') {
    if (ticket.name != null) norm.htTicketName = String(ticket.name)
    const p = parseEbCost(ticket.cost ?? ticket.actual_cost)
    if (ticket.free === true || (p != null && p <= 0)) {
      norm.ticketType = 'Free'
      norm.ticketPrice = 0
    } else if (p != null && p > 0) {
      norm.ticketType = 'Paid'
      norm.ticketPrice = p
    }
    const qty = parseInt(String(ticket.quantity_total ?? ticket.quantity ?? ''), 10)
    if (Number.isFinite(qty) && qty > 0) norm.capacity = qty
    return
  }
  // luma
  if (ticket.name != null || ticket.label != null) {
    norm.htTicketName = String(ticket.name || ticket.label)
  }
  const cents = parseMoney(ticket.cents ?? ticket.price_cents ?? ticket.amount_cents)
  const major = parseMoney(ticket.price ?? ticket.amount)
  let p: number | undefined
  if (cents != null) p = cents / 100
  else if (major != null) p = major
  if (p != null) {
    if (p <= 0 || !!ticket.is_free || String(ticket.type || '').toLowerCase() === 'free') {
      norm.ticketType = 'Free'
      norm.ticketPrice = 0
    } else {
      norm.ticketType = 'Paid'
      norm.ticketPrice = p
    }
  }
  const qty = parseInt(String(ticket.capacity ?? ticket.quantity ?? ''), 10)
  if (Number.isFinite(qty) && qty > 0) norm.capacity = qty
}

function mergeStoredMeta(norm: NormEvent, stored: Awaited<ReturnType<typeof getStoredEvent>>) {
  if (!stored) return
  if (!norm.title && stored.title) norm.title = stored.title
  if (!norm.coverImage && stored.cover_url) norm.coverImage = stored.cover_url
  if (stored.timezone && (!norm.timezone || norm.timezone === 'UTC')) {
    norm.timezone = stored.timezone
  }
}

export async function loadEventFormData(channel: ChannelKey, eventId: string | number): Promise<EventFormData> {
  if (channel === 'hightribe') {
    try {
      const res = await channelFetch(`/api/hightribe/events/${eventId}`)
      if (res.ok) {
        const fresh = await res.json() as Record<string, unknown>
        const norm = normFromPayload(channel, fresh)
        const tickets = await loadHightribeTickets(eventId)
        if (tickets[0]) applyTicketToNorm(norm, tickets[0], 'hightribe')
        const stored = await getStoredEvent(channel as ChannelName, String(eventId))
        mergeStoredMeta(norm, stored)
        return normToForm(norm)
      }
    } catch {
      // fall back to stored copy
    }
  }

  const stored = await getStoredEvent(channel as ChannelName, String(eventId))
  if (!stored) {
    throw new Error('Event not in database. Open Events and use Sync for this channel first.')
  }
  const norm = normFromPayload(channel, stored.payload)
  mergeStoredMeta(norm, stored)

  if (norm.ticketPrice == null) {
    if (channel === 'eventbrite') {
      const tickets = await loadEventbriteTickets(eventId)
      if (tickets[0]) applyTicketToNorm(norm, tickets[0], 'eventbrite')
    } else if (channel === 'luma') {
      const tickets = await loadLumaTickets(eventId)
      if (tickets[0]) applyTicketToNorm(norm, tickets[0], 'luma')
    } else if (channel === 'hightribe') {
      const tickets = await loadHightribeTickets(eventId)
      if (tickets[0]) applyTicketToNorm(norm, tickets[0], 'hightribe')
    }
  }

  return normToForm(norm)
}

export { normToForm }
