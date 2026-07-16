'use client'

import { extractRegistryMasterId, unwrapApiData } from '@/lib/api-response'
import { channelFetch } from '@/lib/channel-fetch'
import { normalizeTimeZone, zonedDateTimeToUtcIso } from '@/lib/event-datetime'
import type { ChannelKey } from '@/lib/types'

/**
 * Registry REST (proxied under /api/registry → /api/v1/registry):
 *
 *   GET    /registry                              listRegistry()
 *   GET    /registry/:id                          getRegistryById(id)
 *   POST   /registry                              createRegistryMaster(...)
 *   PATCH  /registry/:id                          updateRegistryMaster(id, ...)
 *                                                 → also pushes to linked HT / Luma / EB
 *   POST   /registry/:id/propagate                propagateRegistryMaster(id)
 *                                                 → push linked channels (no field change)
 *   DELETE /registry/:id                          deleteRegistryMaster(id)
 *   POST   /registry/:id/channels                 linkRegistryChannel(id, ref)
 *   DELETE /registry/:id/channels/:channel        unlinkRegistryChannel(id, channel)
 *   GET    /registry/:id/attendees                listRegistryAttendees(id)
 *   POST   /registry/:id/attendees                registerAttendee(id, { email, name, source })
 *   POST   /registry/attendees/by-channel         registerAttendeeByChannel(...)
 *
 * Master fields: title, capacity, category, timezone, format, startAt, endAt,
 * location, details.tickets (sales window — not event WHEN).
 *
 * Linked edits require channelRefs on the master:
 *   hightribe → HT event id, luma → evt-…, eventbrite → EB event id.
 * Without a link, only the channel that was edited updates.
 */

export type RegistryChannelRef = {
  channel: ChannelKey
  eventId: string
  ticketId?: string
  url?: string
}

/** Per-channel result from PATCH registry / HT update / propagate. */
export type RegistryChannelUpdate = {
  ok: boolean
  message?: string
  eventId?: string
  url?: string
}

export type RegistryUpdateResult = {
  data: Record<string, unknown>
  channelUpdates: Partial<Record<ChannelKey, RegistryChannelUpdate>>
}

export type RegistryMasterWrite = {
  title?: string
  capacity?: number
  category?: string
  timezone?: string
  format?: string
  startAt?: string
  endAt?: string
  location?: {
    venue_name?: string
    city?: string
    country?: string
    address?: string
    region?: string
    postal_code?: string
    latitude?: number | null
    longitude?: number | null
  }
  details?: {
    tickets?: Array<{
      name?: string
      start_date?: string
      end_date?: string
      price?: number
      currency?: string
      quantity?: number
    }>
  }
  channelRefs?: RegistryChannelRef[]
}

function formFormatToApi(fmt: string): string {
  const s = String(fmt || '').toLowerCase()
  if (s.includes('hybrid')) return 'hybrid'
  if (s.includes('online')) return 'online'
  return 'in_person'
}

/** Build PATCH/POST master body from wizard form (EventFormData-shaped). */
export function buildRegistryMasterWriteFromForm(
  ev: Record<string, unknown>,
): RegistryMasterWrite {
  const tz = normalizeTimeZone(String(ev.timezone || 'UTC'))
  const date = String(ev.date || '').trim()
  const time = String(ev.time || '00:00').trim()
  const endDate = String(ev.endDate || date).trim()
  const endTime = String(ev.endTime || time).trim()
  const salesStart = String(ev.salesStart || '').trim()
  const salesEnd = String(ev.salesEnd || '').trim()
  const capacity = parseInt(String(ev.capacity || ''), 10)
  const price = parseFloat(String(ev.price || ''))
  const lat = parseFloat(String(ev.lat || ''))
  const lng = parseFloat(String(ev.lng || ''))
  const ticketName = String(ev.htTicketName || 'General Admission').trim() || 'General Admission'

  const write: RegistryMasterWrite = {
    title: String(ev.title || 'Untitled').trim() || 'Untitled',
    capacity: Number.isFinite(capacity) && capacity > 0 ? capacity : 150,
    category: String(ev.category || '').trim() || undefined,
    timezone: tz,
    format: formFormatToApi(String(ev.format || 'In person')),
  }

  if (date) {
    write.startAt = zonedDateTimeToUtcIso(date, time || '00:00', tz)
    write.endAt = zonedDateTimeToUtcIso(endDate || date, endTime || time || '00:00', tz)
  }

  write.location = {
    venue_name: String(ev.venue || '').trim() || undefined,
    city: String(ev.city || '').trim() || undefined,
    country: String(ev.country || '').trim() || undefined,
    address: String(ev.address || '').trim() || undefined,
    region: String(ev.region || '').trim() || undefined,
    postal_code: String(ev.postal || '').trim() || undefined,
    latitude: Number.isFinite(lat) ? lat : null,
    longitude: Number.isFinite(lng) ? lng : null,
  }

  write.details = {
    tickets: [{
      name: ticketName,
      ...(salesStart ? { start_date: salesStart } : {}),
      ...(salesEnd ? { end_date: salesEnd } : {}),
      ...(Number.isFinite(price) ? { price } : {}),
      currency: String(ev.currency || 'USD') || 'USD',
      ...(Number.isFinite(capacity) && capacity > 0 ? { quantity: capacity } : {}),
    }],
  }

  return write
}

function serializeRegistryMasterBody(input: RegistryMasterWrite): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (typeof input.title === 'string') body.title = input.title
  if (typeof input.capacity === 'number' && Number.isFinite(input.capacity)) {
    body.capacity = input.capacity
  }
  if (typeof input.category === 'string') body.category = input.category
  if (typeof input.timezone === 'string') body.timezone = input.timezone
  if (typeof input.format === 'string') body.format = input.format
  if (typeof input.startAt === 'string') body.startAt = input.startAt
  if (typeof input.endAt === 'string') body.endAt = input.endAt
  if (input.location) body.location = input.location
  if (input.details) body.details = input.details
  if (input.channelRefs) {
    body.channelRefs = input.channelRefs.map((ref) => ({
      channel: ref.channel,
      eventId: ref.eventId,
      ...(ref.ticketId ? { ticketId: ref.ticketId } : {}),
      ...(ref.url ? { url: ref.url } : {}),
    }))
  }
  return body
}

function registryAuthHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...extra,
  }
}

async function parseRegistryError(res: Response): Promise<string> {
  const raw = await res.json().catch(() => ({})) as { error?: string; message?: string }
  return raw.message || raw.error || `Registry error ${res.status}`
}

const CHANNEL_KEYS: ChannelKey[] = ['hightribe', 'luma', 'eventbrite']

/** Pull per-channel ok/error from PATCH / HT update / propagate responses. */
export function parseRegistryChannelUpdates(
  raw: unknown,
): Partial<Record<ChannelKey, RegistryChannelUpdate>> {
  const root = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const data = unwrapApiData<Record<string, unknown>>(root)
  const source =
    (root.channelUpdates as unknown)
    || (data as { channelUpdates?: unknown }).channelUpdates
    || (root.updates as unknown)
    || (data as { updates?: unknown }).updates
    || null

  const out: Partial<Record<ChannelKey, RegistryChannelUpdate>> = {}
  if (!source || typeof source !== 'object') return out

  if (Array.isArray(source)) {
    for (const item of source) {
      if (!item || typeof item !== 'object') continue
      const row = item as Record<string, unknown>
      const ch = String(row.channel || '').toLowerCase() as ChannelKey
      if (!CHANNEL_KEYS.includes(ch)) continue
      const ok = row.ok !== false && row.success !== false && !row.error
      out[ch] = {
        ok,
        message: String(row.message || row.error || (ok ? '' : 'Update failed') || '') || undefined,
        eventId: row.eventId != null ? String(row.eventId) : undefined,
        url: row.url != null ? String(row.url) : undefined,
      }
    }
    return out
  }

  for (const ch of CHANNEL_KEYS) {
    const row = (source as Record<string, unknown>)[ch]
    if (row == null) continue
    if (typeof row === 'boolean') {
      out[ch] = { ok: row }
      continue
    }
    if (typeof row !== 'object') continue
    const rec = row as Record<string, unknown>
    const ok = rec.ok !== false && rec.success !== false && !rec.error
    out[ch] = {
      ok,
      message: String(rec.message || rec.error || (ok ? '' : 'Update failed') || '') || undefined,
      eventId: rec.eventId != null ? String(rec.eventId) : undefined,
      url: rec.url != null ? String(rec.url) : undefined,
    }
  }
  return out
}

/** Build channelRefs from edit targets, merging existing master links. */
export function buildChannelRefsFromTargets(
  targets: Partial<Record<ChannelKey, string | number>>,
  existing?: Partial<Record<ChannelKey, { eventId?: string; ticketId?: string; url?: string }>>,
): RegistryChannelRef[] {
  const refs: RegistryChannelRef[] = []
  for (const ch of CHANNEL_KEYS) {
    const id = targets[ch] ?? existing?.[ch]?.eventId
    if (id == null || id === '') continue
    refs.push({
      channel: ch,
      eventId: String(id),
      ...(existing?.[ch]?.ticketId ? { ticketId: existing[ch]!.ticketId } : {}),
      ...(existing?.[ch]?.url ? { url: existing[ch]!.url } : {}),
    })
  }
  return refs
}

/** GET /api/registry — list masters */
export async function listRegistry(): Promise<unknown> {
  try {
    const res = await channelFetch('/api/registry', { headers: registryAuthHeaders() })
    if (!res.ok) throw new Error(await parseRegistryError(res))
    const raw = await res.json().catch(() => ({}))
    return unwrapApiData(raw)
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e))
  }
}

/** GET /api/registry/:id */
export async function getRegistryById(masterId: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await channelFetch(`/api/registry/${encodeURIComponent(masterId)}`, {
      headers: registryAuthHeaders(),
    })
    if (!res.ok) return null
    const raw = await res.json().catch(() => null)
    if (!raw) return null
    return unwrapApiData(raw)
  } catch {
    return null
  }
}

/** POST /api/registry — create master (+ optional extended fields / channelRefs). */
export async function createRegistryMaster(input: RegistryMasterWrite & {
  title: string
  capacity: number
}): Promise<string> {
  const body = serializeRegistryMasterBody(input)
  if (!body.title) body.title = input.title
  if (body.capacity == null) body.capacity = input.capacity

  try {
    const res = await channelFetch('/api/registry', {
      method: 'POST',
      headers: registryAuthHeaders(),
      body: JSON.stringify(body),
    })
    const raw = await res.json().catch(() => ({})) as { error?: string; message?: string }
    const id = extractRegistryMasterId(raw)
    if (!res.ok || !id) {
      throw new Error(raw.message || raw.error || `Registry create failed (HTTP ${res.status})`)
    }
    return id
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e))
  }
}

/** @deprecated Use createRegistryMaster */
export async function createRegistryWithChannelRefs(input: {
  title: string
  capacity: number
  channelRefs: RegistryChannelRef[]
}): Promise<string> {
  return createRegistryMaster(input)
}

/**
 * PATCH /api/registry/:id — edit master.
 * Omit channelRefs to leave links unchanged; pass channelRefs to replace the full list.
 * Event WHEN = startAt/endAt; ticket sales window = details.tickets[].start_date/end_date.
 * When channelRefs are linked, the backend also pushes updates to HT / Luma / Eventbrite.
 */
export async function updateRegistryMaster(
  masterId: string,
  input: RegistryMasterWrite,
): Promise<RegistryUpdateResult> {
  const body = serializeRegistryMasterBody(input)
  try {
    const res = await channelFetch(`/api/registry/${encodeURIComponent(masterId)}`, {
      method: 'PATCH',
      headers: registryAuthHeaders(),
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(await parseRegistryError(res))
    const raw = await res.json().catch(() => ({}))
    return {
      data: unwrapApiData(raw) as Record<string, unknown>,
      channelUpdates: parseRegistryChannelUpdates(raw),
    }
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e))
  }
}

/**
 * POST /api/registry/:id/propagate — push linked channel copies without changing master fields.
 */
export async function propagateRegistryMaster(
  masterId: string,
): Promise<RegistryUpdateResult> {
  try {
    const res = await channelFetch(`/api/registry/${encodeURIComponent(masterId)}/propagate`, {
      method: 'POST',
      headers: registryAuthHeaders(),
      body: JSON.stringify({}),
    })
    if (!res.ok) throw new Error(await parseRegistryError(res))
    const raw = await res.json().catch(() => ({}))
    return {
      data: unwrapApiData(raw) as Record<string, unknown>,
      channelUpdates: parseRegistryChannelUpdates(raw),
    }
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e))
  }
}

/** POST /api/registry/:id/channels — link one channel. */
export async function linkRegistryChannel(
  masterId: string,
  ref: RegistryChannelRef,
): Promise<void> {
  try {
    const res = await channelFetch(`/api/registry/${encodeURIComponent(masterId)}/channels`, {
      method: 'POST',
      headers: registryAuthHeaders(),
      body: JSON.stringify({
        channel: ref.channel,
        eventId: ref.eventId,
        ...(ref.ticketId ? { ticketId: ref.ticketId } : {}),
        ...(ref.url ? { url: ref.url } : {}),
      }),
    })
    if (!res.ok) throw new Error(await parseRegistryError(res))
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e))
  }
}

/**
 * Prefer PATCH with channelRefs (full replace).
 * Falls back to per-channel POST /channels when PATCH is missing.
 */
export async function updateRegistryChannelRefs(
  masterId: string,
  input: {
    title?: string
    capacity?: number
    channelRefs: RegistryChannelRef[]
  },
): Promise<void> {
  try {
    await updateRegistryMaster(masterId, {
      ...(typeof input.title === 'string' ? { title: input.title } : {}),
      ...(typeof input.capacity === 'number' ? { capacity: input.capacity } : {}),
      channelRefs: input.channelRefs,
    })
    return
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!/HTTP 404|HTTP 405|not found|Route /i.test(msg) && !msg.includes('404') && !msg.includes('405')) {
      throw e
    }
  }

  for (const ref of input.channelRefs) {
    await linkRegistryChannel(masterId, ref)
  }
}

/** DELETE /api/registry/:id */
export async function deleteRegistryMaster(masterId: string): Promise<void> {
  try {
    const res = await channelFetch(`/api/registry/${encodeURIComponent(masterId)}`, {
      method: 'DELETE',
      headers: registryAuthHeaders(),
    })
    if (!res.ok) throw new Error(await parseRegistryError(res))
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e))
  }
}

/** @deprecated Use deleteRegistryMaster */
export const deleteRegistryById = deleteRegistryMaster

/** DELETE /api/registry/:id/channels/:channel */
export async function unlinkRegistryChannel(
  masterId: string,
  channel: ChannelKey,
): Promise<void> {
  try {
    const res = await channelFetch(
      `/api/registry/${encodeURIComponent(masterId)}/channels/${encodeURIComponent(channel)}`,
      { method: 'DELETE', headers: registryAuthHeaders() },
    )
    if (!res.ok) throw new Error(await parseRegistryError(res))
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e))
  }
}

/** GET /api/registry/:id/attendees */
export async function listRegistryAttendees(masterId: string): Promise<unknown> {
  try {
    const res = await channelFetch(`/api/registry/${encodeURIComponent(masterId)}/attendees`, {
      headers: registryAuthHeaders(),
    })
    if (!res.ok) throw new Error(await parseRegistryError(res))
    const raw = await res.json().catch(() => ({}))
    return unwrapApiData(raw)
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e))
  }
}

/** POST /api/registry/:id/attendees */
export async function registerAttendee(
  masterId: string,
  attendee: {
    email: string
    name: string
    source: ChannelKey
    registeredAt?: string
  },
): Promise<Record<string, unknown>> {
  try {
    const res = await channelFetch(`/api/registry/${encodeURIComponent(masterId)}/attendees`, {
      method: 'POST',
      headers: registryAuthHeaders(),
      body: JSON.stringify({
        email: attendee.email.toLowerCase().trim(),
        name: attendee.name,
        source: attendee.source,
        ...(attendee.registeredAt ? { registeredAt: attendee.registeredAt } : {}),
      }),
    })
    if (!res.ok) throw new Error(await parseRegistryError(res))
    const raw = await res.json().catch(() => ({}))
    return unwrapApiData(raw)
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e))
  }
}

/** @deprecated Use registerAttendee */
export const registerRegistryAttendee = registerAttendee

/** POST /api/registry/attendees/by-channel */
export async function registerAttendeeByChannel(input: {
  channel: ChannelKey
  eventId: string
  email: string
  name?: string
  registeredAt?: string
  externalId?: string
}): Promise<Record<string, unknown>> {
  try {
    const res = await channelFetch('/api/registry/attendees/by-channel', {
      method: 'POST',
      headers: registryAuthHeaders(),
      body: JSON.stringify({
        channel: input.channel,
        eventId: input.eventId,
        email: input.email.toLowerCase().trim(),
        ...(input.name ? { name: input.name } : {}),
        ...(input.registeredAt ? { registeredAt: input.registeredAt } : {}),
        ...(input.externalId ? { externalId: input.externalId } : {}),
      }),
    })
    if (!res.ok) throw new Error(await parseRegistryError(res))
    const raw = await res.json().catch(() => ({}))
    return unwrapApiData(raw)
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e))
  }
}
