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
  const data = await registryJson<{ events?: MasterEventRecord[] } | MasterEventRecord[]>('/api/registry')
  if (Array.isArray(data)) return data
  return data.events || []
}

/** GET /api/v1/registry/:id */
export async function getMasterEvent(id: string): Promise<MasterEventRecord | null> {
  try {
    return await registryJson<MasterEventRecord>(`/api/registry/${encodeURIComponent(id)}`)
  } catch {
    return null
  }
}

export async function findMasterByChannelEvent(
  channel: ChannelKey,
  eventId: string,
): Promise<MasterEventRecord | null> {
  const data = await registryJson<{
    master: { id: string; title: string } | null
    links: Partial<Record<ChannelKey, { eventId: string; url?: string }>>
  }>(`/api/registry?channel=${encodeURIComponent(channel)}&eventId=${encodeURIComponent(eventId)}`)

  if (!data.master?.id) return null
  return getMasterEvent(data.master.id)
}

export async function createMasterEvent(input: {
  title: string
  capacity: number
  channels?: Partial<Record<ChannelKey, ChannelRef>>
}): Promise<MasterEventRecord> {
  const { createRegistryWithChannelRefs } = await import('@/lib/registry-api')
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

  const id = await createRegistryWithChannelRefs({
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
    const { registerRegistryAttendee } = await import('@/lib/registry-api')
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
  const { deleteRegistryById } = await import('@/lib/registry-api')
  await deleteRegistryById(id)
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
