import { inferTimezoneFromEvent } from '@/lib/eventbrite-timezone'
import { canonicalizeCountry, COUNTRIES } from '@/components/ewentcast/location-data'

const COUNTRY_NAME_SET = new Set(COUNTRIES.map(c => c.name.toLowerCase()))

function isKnownCountry(raw: string): string | undefined {
  const canon = canonicalizeCountry(raw)
  if (!canon) return undefined
  if (COUNTRY_NAME_SET.has(canon.toLowerCase())) return canon
  if (/^[A-Za-z]{2}$/.test(raw.trim())) return canon
  return undefined
}

function stripMs(s: string): string {
  return s.replace(/\.\d{3}Z$/, 'Z')
}

/** Match Luma event ids across `id`, `api_id`, and list entry shapes. */
export function lumaEventRecordId(e: Record<string, unknown>): string {
  return String(e.id || e.api_id || '')
}

/** Normalise a hosted-calendar list entry to id + display fields. */
export function lumaHostedEventRef(entry: unknown): { id: string; name: string; start_at: string } {
  const top = (entry && typeof entry === 'object') ? entry as Record<string, unknown> : {}
  const ev = unwrapLumaEvent(entry)
  return {
    id: lumaEventRecordId(ev) || lumaEventRecordId(top),
    name: lumaName(ev) || 'Untitled',
    start_at: String(ev.start_at || top.start_at || ''),
  }
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
      description_md: inner.description_md ?? payload.description_md,
      cover_url: inner.cover_url ?? payload.cover_url,
      geo_address_json: inner.geo_address_json ?? payload.geo_address_json,
      geo_latitude: inner.geo_latitude ?? payload.geo_latitude,
      geo_longitude: inner.geo_longitude ?? payload.geo_longitude,
      coordinate: inner.coordinate ?? payload.coordinate,
      meeting_url: inner.meeting_url ?? payload.meeting_url,
      start_at: inner.start_at ?? payload.start_at,
      end_at: inner.end_at ?? payload.end_at,
      timezone: inner.timezone ?? inner.time_zone ?? payload.timezone ?? payload.time_zone,
      hosts: inner.hosts ?? payload.hosts,
      ticket_types: inner.ticket_types ?? payload.ticket_types,
    }
  }
  return payload
}

function inferPlaceFromAddress(address?: string): {
  venueName?: string
  street?: string
  city?: string
  country?: string
  region?: string
  postal?: string
} {
  if (!address) return {}
  const normalized = address.replace(
    /\b([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)\b/g,
    '$1, $2',
  )
  const parts = normalized.split(',').map(p => p.trim()).filter(Boolean)
  if (!parts.length) return {}

  let country: string | undefined
  let countryIdx = -1
  for (let i = parts.length - 1; i >= 0; i--) {
    const known = isKnownCountry(parts[i])
    if (known) {
      country = known
      countryIdx = i
      break
    }
  }

  let postal: string | undefined
  let postalIdx = -1
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i]
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
    'alberta',
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
  if (!city && countryIdx > 0) {
    let candidateIdx = countryIdx - 1
    if (candidateIdx === postalIdx) candidateIdx -= 1
    if (candidateIdx >= 0 && looksLikeRegion(parts[candidateIdx]) && candidateIdx - 1 !== postalIdx) {
      const prev = parts[candidateIdx - 1]
      if (prev && !/^\d/.test(prev) && !isKnownCountry(prev) && !looksLikeRegion(prev)) {
        candidateIdx -= 1
      }
    }
    const candidate = candidateIdx >= 0 ? parts[candidateIdx] : undefined
    if (
      candidate
      && candidate.length < 40
      && !/^\d/.test(candidate)
      && !isKnownCountry(candidate)
      && !looksLikeRegion(candidate)
    ) {
      city = candidate
      cityIdx = candidateIdx
    }
  }

  let region: string | undefined
  if (countryIdx > 0) {
    const from = cityIdx >= 0 ? cityIdx + 1 : Math.max(0, countryIdx - 2)
    for (let i = countryIdx - 1; i >= from; i--) {
      if (i === cityIdx || i === postalIdx) continue
      const part = parts[i]
      if (!part || /\d/.test(part)) continue
      if (looksLikeRegion(part) || (part.length >= 3 && part.length < 40)) {
        region = part
        break
      }
    }
  }

  let venueName: string | undefined
  let street: string | undefined
  if (parts.length >= 2) {
    const first = parts[0]
    const second = parts[1]
    const firstLooksLikeVenue = first.length > 2 && !/^\d/.test(first)
    const secondLooksLikeStreet = /^\d/.test(second)
      || /\b(st|street|ave|avenue|rd|road|blvd|lane|ln|dr|drive|way|court|ct)\b/i.test(second)
    if (firstLooksLikeVenue && secondLooksLikeStreet) {
      venueName = first
      street = second
    } else if (/^\d/.test(first) || /\b(st|street|ave|avenue|rd|road|blvd|lane|ln|dr|drive|way|court|ct)\b/i.test(first)) {
      street = first
    }
  }

  return { venueName, street, city, country, region, postal }
}

function parseLatLng(...candidates: unknown[]): number | undefined {
  for (const v of candidates) {
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim()) {
      const n = parseFloat(v)
      if (Number.isFinite(n)) return n
    }
  }
  return undefined
}

/** Normalise Luma event fields for cross-channel publish / edit forms. */
export function lumaEventToNorm(e: Record<string, unknown>) {
  const geo = (e.geo_address_json || {}) as Record<string, unknown>
  const startAt = e.start_at ? stripMs(String(e.start_at)) : new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  const endAt = e.end_at
    ? stripMs(String(e.end_at))
    : new Date(Date.now() + 3600_000).toISOString().replace(/\.\d{3}Z$/, 'Z')
  const desc = e.description ?? e.description_md ?? e.description_html ?? ''
  const address = geo.address != null ? String(geo.address).trim() || undefined
    : geo.full_address != null ? String(geo.full_address).trim() || undefined : undefined
  const inferred = inferPlaceFromAddress(address)
  const city = geo.city != null ? String(geo.city).trim() || undefined : undefined
  const region = geo.region != null ? String(geo.region).trim() || undefined
    : geo.state != null ? String(geo.state).trim() || undefined : undefined
  const postal = geo.postal != null ? String(geo.postal).trim() || undefined
    : geo.postal_code != null ? String(geo.postal_code).trim() || undefined
      : geo.zip != null ? String(geo.zip).trim() || undefined : undefined
  const countryRaw = geo.country != null ? String(geo.country).trim() || undefined : undefined
  const coord = (e.coordinate && typeof e.coordinate === 'object')
    ? e.coordinate as Record<string, unknown>
    : null
  return {
    title: lumaName(e),
    description: String(desc || ''),
    startUtc: startAt,
    endUtc: endAt,
    timezone: inferTimezoneFromEvent(e, geo),
    coverImage: e.cover_url != null ? String(e.cover_url).trim() || undefined : undefined,
    isOnline: !!(e.meeting_url),
    onlineUrl: e.meeting_url != null ? String(e.meeting_url).trim() || undefined : undefined,
    venueName: (geo.description != null ? String(geo.description).trim() || undefined : undefined)
      || inferred.venueName,
    address: inferred.street || address,
    city: city || inferred.city,
    region: region || inferred.region,
    postal: postal || inferred.postal,
    country: canonicalizeCountry(countryRaw) || inferred.country,
    lat: parseLatLng(geo.latitude, e.geo_latitude, coord?.latitude, coord?.lat),
    lng: parseLatLng(geo.longitude, e.geo_longitude, coord?.longitude, coord?.lng),
    capacity: typeof e.capacity === 'number' && e.capacity > 0 ? e.capacity : undefined,
  }
}
