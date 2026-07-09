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
  const data = await res.json() as T & { error?: string }
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : `Registry error ${res.status}`)
  }
  return data
}

export async function listMasterEvents(): Promise<MasterEventRecord[]> {
  const data = await registryJson<{ events: MasterEventRecord[] }>('/api/registry')
  return data.events
}

export async function getMasterEvent(id: string): Promise<MasterEventRecord | null> {
  try {
    return await registryJson<MasterEventRecord>('/api/registry', {
      method: 'POST',
      body: JSON.stringify({ masterId: id }),
    })
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
  return registryJson<MasterEventRecord>('/api/registry', {
    method: 'POST',
    body: JSON.stringify({
      action: 'create',
      title: input.title,
      capacity: input.capacity,
    }),
  })
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
    return await registryJson<MasterEventRecord>('/api/registry', {
      method: 'POST',
      body: JSON.stringify({ action: 'link', masterId, channel, ref }),
    })
  } catch {
    return null
  }
}

export async function deleteMasterEvent(id: string): Promise<boolean> {
  await registryJson('/api/registry', {
    method: 'POST',
    body: JSON.stringify({ action: 'delete', masterId: id }),
  })
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
