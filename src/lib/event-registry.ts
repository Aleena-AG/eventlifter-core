import type { ChannelKey } from '@/lib/types'
import { getAppUrl } from '@/lib/app-url'
import { authHeader } from '@/lib/auth'
import type { AttendeeRecord, ChannelRef, MasterEventRecord } from '@/lib/event-registry-types'

export type { AttendeeRecord, ChannelRef, MasterEventRecord } from '@/lib/event-registry-types'

function registryUrl(path: string): string {
  if (typeof window !== 'undefined') return path
  return `${getAppUrl()}${path}`
}

function withAuthHeaders(init?: RequestInit): HeadersInit {
  const auth = typeof window !== 'undefined' ? authHeader() : ''
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(auth ? { Authorization: auth } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  }
}

function asChannelKey(raw: unknown): ChannelKey | null {
  const s = String(raw || '')
  if (s === 'hightribe' || s === 'luma' || s === 'eventbrite') return s
  return null
}

/**
 * Remote registry may return channels as:
 *   - channels/links object map
 *   - channelRefs / channel_refs array
 * Missing channels would crash dashboard merge — always normalize to a map.
 */
export function normalizeMasterEvent(raw: unknown): MasterEventRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = String(row.id || '').trim()
  if (!id) return null

  const channels: Partial<Record<ChannelKey, ChannelRef>> = {}

  const absorbMap = (map: unknown) => {
    if (!map || typeof map !== 'object' || Array.isArray(map)) return
    for (const [chRaw, refRaw] of Object.entries(map as Record<string, unknown>)) {
      const ch = asChannelKey(chRaw)
      if (!ch || !refRaw || typeof refRaw !== 'object') continue
      const ref = refRaw as Record<string, unknown>
      const eventId = String(ref.eventId || ref.event_id || '').trim()
      if (!eventId) continue
      channels[ch] = {
        eventId,
        ...(ref.ticketId || ref.ticket_id
          ? { ticketId: String(ref.ticketId || ref.ticket_id) }
          : {}),
        ...(ref.url ? { url: String(ref.url) } : {}),
      }
    }
  }

  absorbMap(row.channels)
  absorbMap(row.links)

  const refs = row.channelRefs || row.channel_refs
  if (Array.isArray(refs)) {
    for (const item of refs) {
      if (!item || typeof item !== 'object') continue
      const ref = item as Record<string, unknown>
      const ch = asChannelKey(ref.channel)
      const eventId = String(ref.eventId || ref.event_id || '').trim()
      if (!ch || !eventId) continue
      channels[ch] = {
        eventId,
        ...(ref.ticketId || ref.ticket_id
          ? { ticketId: String(ref.ticketId || ref.ticket_id) }
          : {}),
        ...(ref.url ? { url: String(ref.url) } : {}),
      }
    }
  }

  const locRaw = row.location ?? row.locationJson ?? row.location_json
  let location: MasterEventRecord['location']
  if (locRaw && typeof locRaw === 'object' && !Array.isArray(locRaw)) {
    const loc = locRaw as Record<string, unknown>
    location = {
      venue_name: typeof loc.venue_name === 'string' ? loc.venue_name : undefined,
      city: typeof loc.city === 'string' ? loc.city : undefined,
      country: typeof loc.country === 'string' ? loc.country : undefined,
      address: typeof loc.address === 'string' ? loc.address : undefined,
      region: typeof loc.region === 'string' ? loc.region : undefined,
      postal_code: typeof loc.postal_code === 'string'
        ? loc.postal_code
        : typeof loc.postal === 'string' ? loc.postal : undefined,
      latitude: typeof loc.latitude === 'number' ? loc.latitude : loc.latitude == null ? null : undefined,
      longitude: typeof loc.longitude === 'number' ? loc.longitude : loc.longitude == null ? null : undefined,
    }
  }

  // Backend Prisma field is detailsJson; older proxies may send details.
  const detailsRaw = row.details ?? row.detailsJson ?? row.details_json
  let details: MasterEventRecord['details']
  if (detailsRaw && typeof detailsRaw === 'object' && !Array.isArray(detailsRaw)) {
    const ticketsRaw = (detailsRaw as { tickets?: unknown }).tickets
    if (Array.isArray(ticketsRaw)) {
      details = {
        tickets: ticketsRaw
          .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
          .map((t) => ({
            name: typeof t.name === 'string' ? t.name : undefined,
            start_date: typeof t.start_date === 'string' ? t.start_date : undefined,
            end_date: typeof t.end_date === 'string' ? t.end_date : undefined,
            price: typeof t.price === 'number' ? t.price : undefined,
            currency: typeof t.currency === 'string' ? t.currency : undefined,
            quantity: typeof t.quantity === 'number' ? t.quantity : undefined,
          })),
      }
    }
  }

  return {
    id,
    title: String(row.title || 'Untitled'),
    capacity: Number(row.capacity) || 0,
    sold: Number(row.sold) || 0,
    channels,
    attendees: Array.isArray(row.attendees) ? (row.attendees as AttendeeRecord[]) : [],
    createdAt: String(row.createdAt || row.created_at || new Date().toISOString()),
    updatedAt: String(row.updatedAt || row.updated_at || new Date().toISOString()),
    ...(typeof row.category === 'string' && row.category ? { category: row.category } : {}),
    ...(typeof row.timezone === 'string' && row.timezone ? { timezone: row.timezone } : {}),
    ...(typeof row.format === 'string' && row.format ? { format: row.format } : {}),
    ...(typeof row.startAt === 'string' && row.startAt
      ? { startAt: row.startAt }
      : typeof row.start_at === 'string' && row.start_at
        ? { startAt: row.start_at }
        : {}),
    ...(typeof row.endAt === 'string' && row.endAt
      ? { endAt: row.endAt }
      : typeof row.end_at === 'string' && row.end_at
        ? { endAt: row.end_at }
        : {}),
    ...(location ? { location } : {}),
    ...(details ? { details } : {}),
  }
}

function normalizeMasterList(raw: unknown): MasterEventRecord[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { events?: unknown }).events)
      ? (raw as { events: unknown[] }).events
      : []
  return list.map(normalizeMasterEvent).filter((m): m is MasterEventRecord => !!m)
}

async function registryJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(registryUrl(path), {
    ...init,
    headers: withAuthHeaders(init),
    cache: 'no-store',
  })
  const raw = await res.json() as { error?: string; message?: string }
  if (!res.ok) {
    throw new Error(
      typeof raw.message === 'string'
        ? raw.message
        : typeof raw.error === 'string'
          ? raw.error
          : `Registry error ${res.status}`,
    )
  }
  const { unwrapApiData } = await import('@/lib/api-response')
  return unwrapApiData(raw) as T
}

export async function listMasterEvents(): Promise<MasterEventRecord[]> {
  const data = await registryJson<unknown>('/api/registry')
  return normalizeMasterList(data)
}

/** GET /api/v1/registry/:id */
export async function getMasterEvent(id: string): Promise<MasterEventRecord | null> {
  try {
    const data = await registryJson<unknown>(`/api/registry/${encodeURIComponent(id)}`)
    return normalizeMasterEvent(data)
  } catch {
    return null
  }
}

/**
 * PATCH /api/v1/registry/:id — edit Ewentcast master only.
 * Pass channelRefs to replace the full channel link list.
 */
export async function updateMasterEvent(
  id: string,
  input: {
    title?: string
    capacity?: number
    channels?: Partial<Record<ChannelKey, ChannelRef>>
  },
): Promise<MasterEventRecord | null> {
  try {
    const { updateRegistryMaster } = await import('@/lib/registry-api')
    const payload: {
      title?: string
      capacity?: number
      channelRefs?: Array<{
        channel: ChannelKey
        eventId: string
        ticketId?: string
        url?: string
      }>
    } = {}
    if (typeof input.title === 'string') payload.title = input.title
    if (typeof input.capacity === 'number') payload.capacity = input.capacity
    if (input.channels) {
      payload.channelRefs = Object.entries(input.channels)
        .filter((entry): entry is [ChannelKey, ChannelRef] => {
          const ref = entry[1]
          return !!ref?.eventId
        })
        .map(([channel, ref]) => ({
          channel,
          eventId: ref.eventId,
          ...(ref.ticketId ? { ticketId: ref.ticketId } : {}),
          ...(ref.url ? { url: ref.url } : {}),
        }))
    }
    await updateRegistryMaster(id, payload)
    return getMasterEvent(id)
  } catch {
    return null
  }
}

export async function findMasterByChannelEvent(
  channel: ChannelKey,
  eventId: string,
): Promise<MasterEventRecord | null> {
  try {
    const data = await registryJson<{
      master: { id: string; title: string } | null
      links: Partial<Record<ChannelKey, { eventId: string; url?: string }>>
    }>(`/api/registry?channel=${encodeURIComponent(channel)}&eventId=${encodeURIComponent(eventId)}`)

    if (data?.master?.id) return getMasterEvent(data.master.id)
  } catch {
    // Fall through — scan list if query endpoint unavailable
  }

  // Fallback: list masters and match channelRefs locally
  try {
    const list = await listMasterEvents()
    const eid = String(eventId)
    const hit = list.find((m) => m.channels?.[channel]?.eventId === eid)
    return hit || null
  } catch {
    return null
  }
}

export async function createMasterEvent(input: {
  title: string
  capacity: number
  channels?: Partial<Record<ChannelKey, ChannelRef>>
}): Promise<MasterEventRecord> {
  const { createRegistryMaster } = await import('@/lib/registry-api')
  const channelRefs = Object.entries(input.channels || {})
    .filter((entry): entry is [ChannelKey, ChannelRef] => {
      const ref = entry[1]
      return !!ref?.eventId
    })
    .map(([channel, ref]) => ({
      channel,
      eventId: ref.eventId,
      ...(ref.ticketId ? { ticketId: ref.ticketId } : {}),
      ...(ref.url ? { url: ref.url } : {}),
    }))

  const id = await createRegistryMaster({
    title: input.title,
    capacity: input.capacity,
    channelRefs,
  })
  const master = await getMasterEvent(id)
  if (!master) {
    return {
      id,
      title: input.title,
      capacity: input.capacity,
      sold: 0,
      channels: input.channels || {},
      attendees: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  }
  return master
}

/** POST /api/v1/registry/:id/attendees */
export async function registerAttendee(
  masterId: string,
  attendee: Omit<AttendeeRecord, 'registeredAt'> & { registeredAt?: string },
): Promise<MasterEventRecord | null> {
  try {
    const { registerAttendee: registerRegistryAttendee } = await import('@/lib/registry-api')
    await registerRegistryAttendee(masterId, {
      email: attendee.email,
      name: attendee.name,
      source: attendee.source,
      registeredAt: attendee.registeredAt,
    })
    return getMasterEvent(masterId)
  } catch {
    return null
  }
}

/** POST /api/v1/registry/:id/channels */
export async function linkChannelEvent(
  masterId: string,
  channel: ChannelKey,
  ref: ChannelRef,
): Promise<MasterEventRecord | null> {
  try {
    const { linkRegistryChannel } = await import('@/lib/registry-api')
    await linkRegistryChannel(masterId, {
      channel,
      eventId: ref.eventId,
      ...(ref.ticketId ? { ticketId: ref.ticketId } : {}),
      ...(ref.url ? { url: ref.url } : {}),
    })
    return getMasterEvent(masterId)
  } catch {
    return null
  }
}

/** DELETE /api/v1/registry/:id */
export async function deleteMasterEvent(id: string): Promise<boolean> {
  const { deleteRegistryMaster } = await import('@/lib/registry-api')
  await deleteRegistryMaster(id)
  return true
}

/** DELETE /api/v1/registry/:id/channels/:channel */
export async function removeChannelFromMaster(
  masterId: string,
  channel: ChannelKey,
): Promise<MasterEventRecord | null> {
  try {
    const { unlinkRegistryChannel } = await import('@/lib/registry-api')
    await unlinkRegistryChannel(masterId, channel)
    return getMasterEvent(masterId)
  } catch {
    return null
  }
}
