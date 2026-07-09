import { lumaEventToNorm, unwrapLumaEvent, isLumaDescriptionSentinel } from '@/lib/luma-event-utils'
import { channelFetch } from '@/lib/channel-fetch'
import { getStoredEvent, type ChannelName } from '@/lib/channel-events-store'
import { canonicalizeCountry, COUNTRIES } from '@/components/ewentcast/location-data'
import type { ChannelKey } from '@/lib/types'
import type { EventFormData } from '@/lib/publish-event'

function stripMs(s: string): string {
  return s.replace(/\.\d{3}Z$/, 'Z')
}

function optStr(v: unknown): string | undefined {
  const s = v != null ? String(v).trim() : ''
  return s || undefined
}

/** Strip Eventbrite HTML (description endpoint / structured content) to plain form text. */
function htmlToPlainText(html: string): string {
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
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

const COUNTRY_NAME_SET = new Set(COUNTRIES.map(c => c.name.toLowerCase()))

/** Pull venue / street / city / region / postal / country from a free-form address. */
function inferPlaceFromAddress(address?: string): {
  venueName?: string
  street?: string
  city?: string
  country?: string
  region?: string
  postal?: string
} {
  if (!address) return {}
  // Normalize "MN 55070" / "CA 90210" into separate region + postal tokens
  const normalized = address.replace(
    /\b([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)\b/g,
    '$1, $2',
  )
  const parts = normalized.split(',').map(p => p.trim()).filter(Boolean)
  if (!parts.length) return {}

  let country: string | undefined
  let countryIdx = -1
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i]
    const canon = canonicalizeCountry(part)
    const looksLikeCode = /^[A-Za-z]{2}$/.test(part)
    if (looksLikeCode || (canon && canon !== part)) {
      country = canon
      countryIdx = i
      break
    }
    const byName = canonicalizeCountry(part)
    if (byName && COUNTRY_NAME_SET.has(byName.toLowerCase())) {
      country = byName
      countryIdx = i
      break
    }
  }

  let postal: string | undefined
  let postalIdx = -1
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i]
    // US ZIP, CA/UK-ish postal, or bare 4–10 digit codes
    if (/^\d{5}(-\d{4})?$/.test(part) || /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(part) || /^\d{4,10}$/.test(part)) {
      postal = part
      postalIdx = i
      break
    }
  }

  const knownCities = [
    'Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar', 'Quetta',
    'Dubai', 'Abu Dhabi', 'London', 'New York', 'Los Angeles', 'Chicago', 'Toronto', 'Sydney',
    'Melbourne', 'Singapore', 'Berlin', 'Paris', 'Saint Francis', 'San Francisco', 'Venice',
    'Denver', 'Austin', 'Seattle', 'Boston', 'Miami', 'Houston', 'Dallas', 'Phoenix', 'Atlanta',
  ]
  const REGION_NAMES = new Set([
    'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'delaware',
    'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky',
    'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi',
    'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey', 'new mexico',
    'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania',
    'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas', 'utah', 'vermont',
    'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming', 'district of columbia',
    'punjab', 'sindh', 'balochistan', 'khyber pakhtunkhwa', 'islamabad capital territory',
    'england', 'scotland', 'wales', 'northern ireland', 'ontario', 'quebec', 'british columbia',
    'alberta', 'dubai', 'abu dhabi',
  ])
  const looksLikeRegion = (part: string) =>
    /^[A-Za-z]{2}$/.test(part) || REGION_NAMES.has(part.toLowerCase())

  let city: string | undefined
  let cityIdx = -1
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    const hit = knownCities.find(c =>
      c.toLowerCase() === part.toLowerCase()
      || part.toLowerCase().startsWith(c.toLowerCase() + ' '),
    )
    if (hit) { city = hit; cityIdx = i; break }
  }
  if (!city) {
    // Prefer "…, City, Region, Country" → city is two before country when the
    // token before country looks like a state/region.
    let candidateIdx = countryIdx > 0 ? countryIdx - 1 : parts.length >= 2 ? parts.length - 2 : -1
    if (candidateIdx === postalIdx) candidateIdx -= 1
    if (candidateIdx >= 0 && looksLikeRegion(parts[candidateIdx]) && candidateIdx - 1 !== postalIdx) {
      const prev = parts[candidateIdx - 1]
      if (prev && !/^\d/.test(prev) && canonicalizeCountry(prev) === prev && !looksLikeRegion(prev)) {
        candidateIdx -= 1
      }
    }
    const candidate = candidateIdx >= 0 ? parts[candidateIdx] : undefined
    if (
      candidate
      && candidate.length < 40
      && !/^\d/.test(candidate)
      && canonicalizeCountry(candidate) === candidate
      && !looksLikeRegion(candidate)
      && !COUNTRY_NAME_SET.has(candidate.toLowerCase())
    ) {
      city = candidate
      cityIdx = candidateIdx
    }
  }

  // Region / state: only tokens between city and country (never venue/street).
  let region: string | undefined
  if (countryIdx > 0) {
    const from = cityIdx >= 0 ? cityIdx + 1 : Math.max(0, countryIdx - 2)
    for (let i = countryIdx - 1; i >= from; i--) {
      if (i === cityIdx || i === postalIdx) continue
      const part = parts[i]
      if (!part || part === city || part === postal) continue
      if (/\d/.test(part)) continue
      if (looksLikeRegion(part) || (part.length >= 3 && part.length < 40 && !/^\d/.test(part))) {
        region = part
        break
      }
    }
  }

  // Venue = first segment when it looks like a place name (no leading street number)
  // and there is a following street-like segment.
  let venueName: string | undefined
  let street: string | undefined
  if (parts.length >= 2) {
    const first = parts[0]
    const second = parts[1]
    const firstLooksLikeVenue = first.length > 2 && !/^\d/.test(first) && !/^(apt|suite|unit)\b/i.test(first)
    const secondLooksLikeStreet = /^\d/.test(second) || /\b(st|street|ave|avenue|rd|road|blvd|lane|ln|dr|drive|way|court|ct)\b/i.test(second)
    if (firstLooksLikeVenue && secondLooksLikeStreet) {
      venueName = first
      street = second
    } else if (/^\d/.test(first) || /\b(st|street|ave|avenue|rd|road|blvd|lane|ln|dr|drive|way|court|ct)\b/i.test(first)) {
      street = first
    }
  }

  return { venueName, street, city, country, region, postal }
}

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
  if (Number.isNaN(d.getTime())) return { date: '', time: '' }
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    })
    const parts = fmt.formatToParts(d)
    const get = (t: string) => parts.find(p => p.type === t)?.value || ''
    // Some runtimes emit "24:00" for midnight — normalize for <input type="time">.
    let hour = get('hour')
    if (hour === '24') hour = '00'
    return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${hour}:${get('minute')}` }
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
  summary?: string
  description: string
  startUtc: string
  endUtc: string
  timezone: string
  coverImage?: string
  isOnline: boolean
  venueName?: string
  address?: string
  city?: string
  region?: string
  postal?: string
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
  salesStartUtc?: string
  salesEndUtc?: string
  minPerOrder?: number
  maxPerOrder?: number
  htTicketId?: string
  htTicketName?: string
}

function scrubFormText(value: unknown): string {
  const s = value != null ? String(value).trim() : ''
  if (!s || isLumaDescriptionSentinel(s)) return ''
  return s
}

function normToForm(n: NormEvent): EventFormData {
  const tz = n.timezone || 'UTC'
  const start = utcParts(n.startUtc, tz)
  const end = utcParts(n.endUtc, tz)
  let format = 'In person'
  if (n.isOnline && (n.venueName || n.address || n.city)) format = 'Hybrid'
  else if (n.isOnline) format = 'Online'

  const inferred = inferPlaceFromAddress(n.address)
  const venue = n.venueName || inferred.venueName || ''
  // Prefer a clean street line when the stored address is a full "venue, street, city…" blob
  let address = n.address || ''
  if (inferred.street && address.includes(',')) {
    const looksLikeBlob = !n.venueName || address.toLowerCase().startsWith(String(n.venueName).toLowerCase() + ',')
    if (looksLikeBlob) address = inferred.street
  }

  const salesStart = n.salesStartUtc ? utcParts(n.salesStartUtc, tz).date : ''
  const salesEnd = n.salesEndUtc ? utcParts(n.salesEndUtc, tz).date : ''

  return {
    title: n.title,
    summary: scrubFormText(n.summary),
    // Never show Luma's ONLY_MD / ONLY_HTML sentinel in the Description field
    description: scrubFormText(n.description),
    coverUrl: n.coverImage || '',
    category: 'Music',
    tags: '',
    date: start.date,
    time: start.time,
    endDate: end.date,
    endTime: end.time,
    timezone: tz,
    format,
    venue,
    address,
    city: n.city || inferred.city || '',
    region: n.region || inferred.region || '',
    postal: n.postal || inferred.postal || '',
    country: canonicalizeCountry(n.country) || inferred.country || '',
    lat: n.lat != null ? String(n.lat) : '',
    lng: n.lng != null ? String(n.lng) : '',
    onlineUrl: n.onlineUrl || '',
    ticketType: n.ticketType || (n.ticketPrice != null && n.ticketPrice > 0 ? 'Paid' : n.ticketPrice === 0 ? 'Free' : ''),
    price: n.ticketPrice != null ? String(n.ticketPrice) : '',
    currency: 'USD',
    capacity: n.capacity != null ? String(n.capacity) : '150',
    minPerOrder: n.minPerOrder != null ? String(n.minPerOrder) : '1',
    maxPerOrder: n.maxPerOrder != null ? String(n.maxPerOrder) : '8',
    // Fall back to the event day range so edit isn't blank when channels omit sales window.
    salesStart: salesStart || start.date,
    salesEnd: salesEnd || end.date,
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
    const venueLabel = optStr(loc?.venue_name) || optStr(loc?.location)
    const ticketsRaw = (Array.isArray(e.tickets) ? e.tickets : Array.isArray(raw.tickets) ? raw.tickets : []) as Array<Record<string, unknown>>
    const ticket = ticketsRaw[0]
    const ticketSetting = (e.ticket_setting || e.ticketSetting || {}) as Record<string, unknown>
    const rawPrice = ticket ? parseMoney(ticket.price) : undefined
    // Prefer base ticket.price for edit — don't guess Free when price is missing.
    const effectivePrice = rawPrice
    const ticketQty = ticket ? parseInt(String(ticket.quantity ?? ''), 10) : undefined
    const address = optStr(loc?.address) || venueLabel
    const inferred = inferPlaceFromAddress(address)
    // When HT stores venue in `location` and street in `address`, keep them separate.
    const venueName =
      optStr(loc?.venue_name)
      || (optStr(loc?.location) && optStr(loc?.address) && optStr(loc?.location) !== optStr(loc?.address)
        ? optStr(loc?.location)
        : undefined)
      || inferred.venueName
    const city = optStr(loc?.city) || inferred.city
    const country = canonicalizeCountry(optStr(loc?.country)) || inferred.country
    const region = optStr(loc?.region) || optStr(loc?.state) || inferred.region
    const postal = optStr(loc?.postal) || optStr(loc?.postal_code) || optStr(loc?.zip) || inferred.postal
    return {
      title: String(e.title || raw.title || ''),
      summary: optStr(e.summary) || optStr(e.short_description) || optStr(e.overview) || undefined,
      description: (() => {
        const rawDesc = String(e.description || '').trim()
        if (rawDesc && !isLumaDescriptionSentinel(rawDesc)) return rawDesc
        // Don't fall back to overview/summary here — that belongs in Summary
        return ''
      })(),
      startUtc, endUtc,
      timezone: String(d?.timezone || e.timezone || raw.timezone || 'UTC'),
      coverImage: hightribeCoverUrl(e, raw),
      isOnline: loc?.type === 'online',
      venueName,
      address: optStr(loc?.address) || inferred.street || address,
      city,
      region,
      postal,
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
      salesStartUtc: ticket
        ? (() => {
            const s = optStr(ticket.sales_start) || optStr(ticket.start_sale_date) || optStr(ticket.valid_start_at)
            return s ? stripMs(s) : undefined
          })()
        : undefined,
      salesEndUtc: ticket
        ? (() => {
            const s = optStr(ticket.sales_end) || optStr(ticket.end_sale_date) || optStr(ticket.valid_end_at)
            return s ? stripMs(s) : undefined
          })()
        : undefined,
      minPerOrder: parseInt(String(ticketSetting.min_qty ?? ticketSetting.minQty ?? ''), 10) || undefined,
      maxPerOrder: parseInt(String(ticketSetting.max_qty ?? ticketSetting.maxQty ?? ''), 10) || undefined,
      htTicketId: ticket?.id != null ? String(ticket.id) : undefined,
      htTicketName: ticket?.name != null ? String(ticket.name) : undefined,
    }
  }

  if (channel === 'luma') {
    const e = unwrapLumaEvent(raw.event ? raw : { event: raw })
    const norm = lumaEventToNorm(e)
    const geo = (e.geo_address_json || {}) as Record<string, unknown>
    const inferred = inferPlaceFromAddress(norm.address)
    const ticketTypes = (
      Array.isArray(e.ticket_types) ? e.ticket_types
        : Array.isArray(raw.ticket_types) ? raw.ticket_types
          : Array.isArray((raw.data as Record<string, unknown> | undefined)?.ticket_types)
            ? (raw.data as { ticket_types: Array<Record<string, unknown>> }).ticket_types
            : []
    ) as Array<Record<string, unknown>>
    const ticket = ticketTypes[0]
    let ticketPrice: number | undefined
    let ticketType: string | undefined
    if (ticket) {
      const typeStr = String(ticket.type || '').toLowerCase()
      const cents = parseMoney(ticket.cents ?? ticket.price_cents ?? ticket.amount_cents)
      const major = parseMoney(ticket.price ?? ticket.amount)
      if (cents != null) ticketPrice = cents / 100
      else if (major != null) ticketPrice = major
      if (ticket.is_free === true || typeStr === 'free' || (ticketPrice != null && ticketPrice <= 0)) {
        ticketType = 'Free'
        ticketPrice = 0
      } else if (ticketPrice != null && ticketPrice > 0) {
        ticketType = 'Paid'
      } else if (typeStr === 'paid' || typeStr === 'fixed') {
        ticketType = 'Paid'
      }
    }
    const hosts = Array.isArray(e.hosts) ? e.hosts
      : Array.isArray(raw.hosts) ? raw.hosts
        : []
    return {
      title: norm.title,
      summary: optStr(e.summary) || optStr(e.short_description) || undefined,
      description: norm.description,
      startUtc: norm.startUtc,
      endUtc: norm.endUtc,
      timezone: norm.timezone || String(raw.timezone || e.timezone || 'UTC'),
      coverImage: norm.coverImage,
      isOnline: norm.isOnline,
      onlineUrl: norm.onlineUrl,
      venueName: norm.venueName || optStr(geo.description) || inferred.venueName,
      address: inferred.street || norm.address,
      city: norm.city || optStr(geo.city) || inferred.city,
      region: norm.region || optStr(geo.region) || optStr(geo.state) || inferred.region,
      postal: norm.postal || optStr(geo.postal) || optStr(geo.postal_code) || optStr(geo.zip) || inferred.postal,
      country: canonicalizeCountry(norm.country) || inferred.country,
      lat: norm.lat,
      lng: norm.lng,
      requireApproval: !!(e.require_rsvp_approval),
      capacity: typeof e.capacity === 'number' ? e.capacity : undefined,
      status: mapPublishStatus(String(e.status || raw.status || '')),
      visibility: mapVisibility(String(e.visibility || raw.visibility || '')),
      hostName: pickHostName(e.host, e.host_name, e.organizer, hosts, e.hosts, raw.host, raw.hosts),
      ticketType,
      ticketPrice,
      salesStartUtc: ticket
        ? (() => {
            const s = optStr(ticket.valid_start_at) || optStr(ticket.sales_start)
            return s ? stripMs(s) : undefined
          })()
        : undefined,
      salesEndUtc: ticket
        ? (() => {
            const s = optStr(ticket.valid_end_at) || optStr(ticket.sales_end)
            return s ? stripMs(s) : undefined
          })()
        : undefined,
    }
  }

  const e = raw
  const start = e.start as Record<string, string> | undefined
  const end = e.end as Record<string, string> | undefined
  const name = e.name as { text?: string } | undefined
  const desc = e.description as { text?: string; html?: string } | undefined
  const summaryObj = e.summary as { text?: string; html?: string } | undefined
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
  // On modern Eventbrite events, `description` on the event object is only the
  // short teaser (same as `summary`). Full body lives at /events/{id}/description/
  // (summary + structured content) or in structured_content modules.
  const shortTeaser =
    optStr(typeof e.summary === 'string' ? e.summary : undefined)
    || optStr(summaryObj?.text)
    || (summaryObj?.html ? htmlToPlainText(summaryObj.html) : undefined)
    || optStr(desc?.text)
    || (desc?.html ? htmlToPlainText(desc.html) : undefined)
  const fullFromPayload = optStr(e._full_description as string | undefined)
  // Prefer full body; if EB returns summary+body HTML, drop a leading summary
  // duplicate so the Description field isn't just the teaser twice.
  let descText = fullFromPayload || ''
  if (descText && shortTeaser) {
    const trimmed = descText.trim()
    const teaser = shortTeaser.trim()
    if (trimmed === teaser) {
      // /description/ sometimes only echoes the summary when no modules exist.
      descText = teaser
    } else if (trimmed.toLowerCase().startsWith(teaser.toLowerCase())) {
      descText = trimmed.slice(teaser.length).replace(/^\s+/, '')
    }
  }
  if (!descText) descText = shortTeaser || ''
  return {
    title: name?.text || String(e.title || e.id || ''),
    summary: shortTeaser || undefined,
    description: descText,
    startUtc: start?.utc ? stripMs(start.utc) : new Date().toISOString(),
    endUtc: end?.utc ? stripMs(end.utc) : new Date().toISOString(),
    timezone: start?.timezone || String(e.timezone || 'UTC'),
    coverImage: logo?.original?.url || logo?.url,
    isOnline: !!(e.online_event),
    venueName: optStr(venue?.name) || inferred.venueName,
    address: optStr(addr?.address_1) || inferred.street || address,
    city: optStr(addr?.city) || inferred.city,
    region: optStr(addr?.region) || optStr(addr?.state) || inferred.region,
    postal: optStr(addr?.postal_code) || optStr(addr?.postal) || optStr(addr?.zip) || inferred.postal,
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
    salesStartUtc: tc
      ? (() => {
          const s = optStr(tc.sales_start)
          return s ? stripMs(s) : undefined
        })()
      : undefined,
    salesEndUtc: tc
      ? (() => {
          const s = optStr(tc.sales_end)
          return s ? stripMs(s) : undefined
        })()
      : undefined,
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
      entries?: Array<Record<string, unknown>>
      data?: {
        ticket_types?: Array<Record<string, unknown>>
        entries?: Array<Record<string, unknown>>
      }
    }
    const list =
      raw.ticket_types
      || raw.entries
      || raw.data?.ticket_types
      || raw.data?.entries
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
    const salesStart = optStr(ticket.sales_start) || optStr(ticket.start_sale_date) || optStr(ticket.valid_start_at)
    const salesEnd = optStr(ticket.sales_end) || optStr(ticket.end_sale_date) || optStr(ticket.valid_end_at)
    if (salesStart) norm.salesStartUtc = stripMs(salesStart)
    if (salesEnd) norm.salesEndUtc = stripMs(salesEnd)
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
    const ebStart = optStr(ticket.sales_start)
    const ebEnd = optStr(ticket.sales_end)
    if (ebStart) norm.salesStartUtc = stripMs(ebStart)
    if (ebEnd) norm.salesEndUtc = stripMs(ebEnd)
    return
  }
  // luma
  if (ticket.name != null || ticket.label != null) {
    norm.htTicketName = String(ticket.name || ticket.label)
  }
  const typeStr = String(ticket.type || '').toLowerCase()
  const cents = parseMoney(ticket.cents ?? ticket.price_cents ?? ticket.amount_cents)
  const major = parseMoney(ticket.price ?? ticket.amount)
  let p: number | undefined
  if (cents != null) p = cents / 100
  else if (major != null) p = major
  if (ticket.is_free === true || typeStr === 'free' || (p != null && p <= 0)) {
    norm.ticketType = 'Free'
    norm.ticketPrice = 0
  } else if (p != null && p > 0) {
    norm.ticketType = 'Paid'
    norm.ticketPrice = p
  } else if (typeStr === 'paid' || typeStr === 'fixed') {
    norm.ticketType = 'Paid'
    if (p != null) norm.ticketPrice = p
  }
  const qty = parseInt(String(
    ticket.max_capacity ?? ticket.capacity ?? ticket.quantity ?? '',
  ), 10)
  if (Number.isFinite(qty) && qty > 0) norm.capacity = qty
  const salesStart = optStr(ticket.valid_start_at) || optStr(ticket.sales_start)
  const salesEnd = optStr(ticket.valid_end_at) || optStr(ticket.sales_end)
  if (salesStart) norm.salesStartUtc = stripMs(salesStart)
  if (salesEnd) norm.salesEndUtc = stripMs(salesEnd)
}

function mergeStoredMeta(norm: NormEvent, stored: Awaited<ReturnType<typeof getStoredEvent>>) {
  if (!stored) return
  if (!norm.title && stored.title) norm.title = stored.title
  if (!norm.coverImage && stored.cover_url) norm.coverImage = stored.cover_url
  if (stored.timezone && (!norm.timezone || norm.timezone === 'UTC')) {
    norm.timezone = stored.timezone
  }
  if (stored.start_at && (!norm.startUtc || Number.isNaN(new Date(norm.startUtc).getTime()))) {
    norm.startUtc = stripMs(stored.start_at)
  }
  if (stored.end_at && (!norm.endUtc || Number.isNaN(new Date(norm.endUtc).getTime()))) {
    norm.endUtc = stripMs(stored.end_at)
  }
  // Prefer richer text from our last publish snapshot when the live channel
  // payload is missing it (common for Luma: description="ONLY_MD", no summary).
  const payload = (stored.payload || {}) as Record<string, unknown>
  if (!norm.summary) {
    norm.summary =
      optStr(payload.summary)
      || optStr(payload.short_description)
      || optStr(payload.overview)
      || (typeof payload.summary === 'object' && payload.summary
        ? optStr((payload.summary as { text?: string }).text)
        : undefined)
  }
  const payloadDesc =
    optStr(payload.description_md)
    || optStr(payload._full_description)
    || (typeof payload.description === 'string' && !isLumaDescriptionSentinel(payload.description)
      ? optStr(payload.description)
      : undefined)
    || (typeof payload.description === 'object' && payload.description
      ? optStr((payload.description as { text?: string }).text)
        || ((payload.description as { html?: string }).html
          ? htmlToPlainText(String((payload.description as { html?: string }).html))
          : undefined)
      : undefined)
  if ((!norm.description || isLumaDescriptionSentinel(norm.description)) && payloadDesc) {
    norm.description = payloadDesc
  }

  // Keep venue / place fields the user just saved when the live channel API
  // omits them (common on Luma update + HT location shape quirks).
  const loc = (payload.location && typeof payload.location === 'object')
    ? payload.location as Record<string, unknown>
    : null
  const geo = (payload.geo_address_json && typeof payload.geo_address_json === 'object')
    ? payload.geo_address_json as Record<string, unknown>
    : null
  const venue = (payload.venue && typeof payload.venue === 'object')
    ? payload.venue as Record<string, unknown>
    : null
  const venueAddr = (venue?.address && typeof venue.address === 'object')
    ? venue.address as Record<string, unknown>
    : null

  if (!norm.venueName) {
    norm.venueName =
      optStr(loc?.venue_name)
      || optStr(geo?.description)
      || optStr(venue?.name)
      || (optStr(loc?.location) && optStr(loc?.address) && optStr(loc?.location) !== optStr(loc?.address)
        ? optStr(loc?.location)
        : undefined)
  }
  if (!norm.address) {
    norm.address =
      optStr(loc?.address)
      || optStr(venueAddr?.address_1)
      || optStr(geo?.address)
  }
  if (!norm.city) {
    norm.city = optStr(loc?.city) || optStr(venueAddr?.city) || optStr(geo?.city)
  }
  if (!norm.region) {
    norm.region =
      optStr(loc?.region) || optStr(loc?.state)
      || optStr(venueAddr?.region) || optStr(venueAddr?.state)
      || optStr(geo?.region) || optStr(geo?.state)
  }
  if (!norm.postal) {
    norm.postal =
      optStr(loc?.postal) || optStr(loc?.postal_code) || optStr(loc?.zip)
      || optStr(venueAddr?.postal_code) || optStr(venueAddr?.postal)
      || optStr(geo?.postal) || optStr(geo?.postal_code)
  }
  if (!norm.country) {
    norm.country = canonicalizeCountry(
      optStr(loc?.country) || optStr(venueAddr?.country) || optStr(geo?.country),
    )
  }
  if (norm.lat == null) {
    norm.lat =
      parseCoord(loc?.lat)
      ?? parseCoord(geo?.latitude)
      ?? parseCoord(venue?.latitude)
      ?? parseCoord(venueAddr?.latitude)
      ?? parseCoord(payload.geo_latitude)
  }
  if (norm.lng == null) {
    norm.lng =
      parseCoord(loc?.lng)
      ?? parseCoord(geo?.longitude)
      ?? parseCoord(venue?.longitude)
      ?? parseCoord(venueAddr?.longitude)
      ?? parseCoord(payload.geo_longitude)
  }
}

async function enrichTickets(norm: NormEvent, channel: ChannelKey, eventId: string | number) {
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

/** Full HTML description (summary + structured content) as plain text. */
async function loadEventbriteFullDescription(eventId: string | number): Promise<string | null> {
  try {
    const res = await channelFetch(`/api/eventbrite/events/${eventId}/description/`)
    if (res.ok) {
      const data = await res.json() as { description?: string }
      const html = optStr(data.description)
      if (html) return htmlToPlainText(html)
    }
  } catch {
    // fall through to structured content
  }

  // Fallback: pull text modules from structured content when /description/ is empty.
  try {
    const res = await channelFetch(
      `/api/eventbrite/events/${eventId}/structured_content/?purpose=listing`,
    )
    if (!res.ok) return null
    const data = await res.json() as {
      modules?: Array<{ type?: string; data?: { body?: { text?: string } } }>
    }
    const parts = (data.modules || [])
      .filter(m => m?.type === 'text')
      .map(m => optStr(m.data?.body?.text))
      .filter(Boolean) as string[]
    if (!parts.length) return null
    return htmlToPlainText(parts.join('\n\n'))
  } catch {
    return null
  }
}

async function loadEventbriteEventFresh(eventId: string | number): Promise<Record<string, unknown> | null> {
  try {
    const res = await channelFetch(`/api/eventbrite/events/${eventId}?expand=venue`)
    if (!res.ok) return null
    const raw = await res.json() as Record<string, unknown>
    const fullDesc = await loadEventbriteFullDescription(eventId)
    if (fullDesc) raw._full_description = fullDesc
    return raw
  } catch {
    return null
  }
}

async function loadLumaEventFresh(eventId: string | number): Promise<Record<string, unknown> | null> {
  try {
    const res = await channelFetch(
      `/api/luma/events?api_id=${encodeURIComponent(String(eventId))}`,
    )
    if (!res.ok) return null
    const data = await res.json() as {
      data?: Record<string, unknown>
      event?: Record<string, unknown>
    }
    return data.data || data.event || null
  } catch {
    return null
  }
}

/** Prefer non-empty text / place fields from sibling channel payloads (multi-channel edit). */
function mergeNormTextFields(primary: NormEvent, extra: NormEvent) {
  if (!primary.summary && extra.summary) primary.summary = extra.summary
  const primaryDesc = String(primary.description || '').trim()
  const extraDesc = String(extra.description || '').trim()
  if ((!primaryDesc || isLumaDescriptionSentinel(primaryDesc)) && extraDesc && !isLumaDescriptionSentinel(extraDesc)) {
    primary.description = extraDesc
  }
  if (!primary.venueName && extra.venueName) primary.venueName = extra.venueName
  if (!primary.address && extra.address) primary.address = extra.address
  if (!primary.city && extra.city) primary.city = extra.city
  if (!primary.region && extra.region) primary.region = extra.region
  if (!primary.postal && extra.postal) primary.postal = extra.postal
  if (!primary.country && extra.country) primary.country = extra.country
  if (primary.lat == null && extra.lat != null) primary.lat = extra.lat
  if (primary.lng == null && extra.lng != null) primary.lng = extra.lng
}

async function loadNormForChannel(
  channel: ChannelKey,
  eventId: string | number,
): Promise<NormEvent | null> {
  try {
    if (channel === 'hightribe') {
      const res = await channelFetch(`/api/hightribe/events/${eventId}`)
      if (!res.ok) return null
      const fresh = await res.json() as Record<string, unknown>
      const norm = normFromPayload(channel, fresh)
      await enrichTickets(norm, 'hightribe', eventId)
      const stored = await getStoredEvent(channel as ChannelName, String(eventId))
      mergeStoredMeta(norm, stored)
      return norm
    }
    if (channel === 'eventbrite') {
      const fresh = await loadEventbriteEventFresh(eventId)
      if (!fresh) return null
      const norm = normFromPayload(channel, fresh)
      await enrichTickets(norm, 'eventbrite', eventId)
      const stored = await getStoredEvent(channel as ChannelName, String(eventId))
      mergeStoredMeta(norm, stored)
      return norm
    }
    if (channel === 'luma') {
      const fresh = await loadLumaEventFresh(eventId)
      if (!fresh) return null
      const norm = normFromPayload(channel, fresh)
      await enrichTickets(norm, 'luma', eventId)
      const stored = await getStoredEvent(channel as ChannelName, String(eventId))
      mergeStoredMeta(norm, stored)
      return norm
    }
  } catch {
    return null
  }
  return null
}

export async function loadEventFormData(
  channel: ChannelKey,
  eventId: string | number,
  siblingIds?: Partial<Record<ChannelKey, string | number>>,
): Promise<EventFormData> {
  let norm = await loadNormForChannel(channel, eventId)

  if (!norm) {
    const stored = await getStoredEvent(channel as ChannelName, String(eventId))
    if (!stored) {
      throw new Error('Event not in database. Open Events and use Sync for this channel first.')
    }
    const payload = { ...stored.payload } as Record<string, unknown>
    if (channel === 'eventbrite' && !payload._full_description) {
      const fullDesc = await loadEventbriteFullDescription(eventId)
      if (fullDesc) payload._full_description = fullDesc
    }
    norm = normFromPayload(channel, payload)
    mergeStoredMeta(norm, stored)
    await enrichTickets(norm, channel, eventId)
  }

  // When editing a multi-channel event, fill blank summary/description/place from siblings
  // (e.g. open via Luma → pull Summary / venue from Eventbrite / Hightribe).
  const siblings = siblingIds || {}
  for (const ch of (['hightribe', 'eventbrite', 'luma'] as ChannelKey[])) {
    if (ch === channel) continue
    const sid = siblings[ch]
    if (sid == null || sid === '') continue
    const hasText = !!(norm.summary && norm.description && !isLumaDescriptionSentinel(norm.description))
    const hasPlace = !!(norm.venueName && (norm.address || norm.city))
    if (hasText && hasPlace) break
    const extra = await loadNormForChannel(ch, sid)
    if (extra) mergeNormTextFields(norm, extra)
  }

  return normToForm(norm)
}

export { normToForm }
