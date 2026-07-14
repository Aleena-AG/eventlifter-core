import type { ChannelKey } from '@/lib/types'
import { getAppUrl } from '@/lib/app-url'
import type { AttendeeRecord, ChannelRef, MasterEventRecord } from '@/lib/event-registry-types'

export type { AttendeeRecord, ChannelRef, MasterEventRecord } from '@/lib/event-registry-types'

function registryUrl(path: string): string {
  if (typeof window !== 'undefined') return path
  return `${getAppUrl()}${path}`
}

async function registryJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(registryUrl(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
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

export async function registerAttendee(
  masterId: string,
  attendee: Omit<AttendeeRecord, 'registeredAt'> & { registeredAt?: string },
): Promise<MasterEventRecord | null> {
  return registryJson<MasterEventRecord>('/api/registry', {
    method: 'POST',
    body: JSON.stringify({
      action: 'register_attendee',
      masterId,
      attendee: {
        ...attendee,
        email: attendee.email.toLowerCase().trim(),
        registeredAt: attendee.registeredAt || new Date().toISOString(),
      },
    }),
  }).catch(() => null)
}

export async function linkChannelEvent(
  masterId: string,
  channel: ChannelKey,
  ref: ChannelRef,
): Promise<MasterEventRecord | null> {
  try {
    const { updateRegistryChannelRefs } = await import('@/lib/registry-api')
    const master = await getMasterEvent(masterId)
    await updateRegistryChannelRefs(masterId, {
      title: master?.title,
      capacity: master?.capacity,
      channelRefs: [{
        channel,
        eventId: ref.eventId,
        ...(ref.ticketId ? { ticketId: ref.ticketId } : {}),
        ...(ref.url ? { url: ref.url } : {}),
      }],
    })
    return getMasterEvent(masterId)
  } catch {
    return null
  }
}

export async function deleteMasterEvent(id: string): Promise<boolean> {
  const res = await fetch(registryUrl(`/api/registry/${encodeURIComponent(id)}`), {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  })
  if (!res.ok) {
    // Legacy action-based delete
    await registryJson('/api/registry', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', masterId: id }),
    })
  }
  return true
}

export async function removeChannelFromMaster(
  masterId: string,
  channel: ChannelKey,
): Promise<MasterEventRecord | null> {
  const data = await registryJson<{ ok: boolean; master: MasterEventRecord | null }>('/api/registry', {
    method: 'POST',
    body: JSON.stringify({ action: 'unlink', masterId, channel }),
  })
  return data.master
}
