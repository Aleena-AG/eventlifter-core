import type { ChannelKey } from '@/lib/types'
import { backendJson } from '@/lib/backend-client'

export interface ChannelRef {
  eventId: string
  ticketId?: string
  url?: string
}

export interface AttendeeRecord {
  email: string
  name: string
  source: ChannelKey
  registeredAt: string
  merged?: boolean
}

export interface MasterEventRecord {
  id: string
  title: string
  capacity: number
  sold: number
  channels: Partial<Record<ChannelKey, ChannelRef>>
  attendees: AttendeeRecord[]
  createdAt: string
  updatedAt: string
}

export async function listMasterEvents(): Promise<MasterEventRecord[]> {
  const data = await backendJson<{ events: MasterEventRecord[] }>('/api/registry')
  return data.events
}

export async function getMasterEvent(id: string): Promise<MasterEventRecord | null> {
  try {
    return await backendJson<MasterEventRecord>('/api/registry', {
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
  const data = await backendJson<{
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
  return backendJson<MasterEventRecord>('/api/registry', {
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
  return backendJson<MasterEventRecord>('/api/registry', {
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
    return await backendJson<MasterEventRecord>('/api/registry', {
      method: 'POST',
      body: JSON.stringify({ action: 'link', masterId, channel, ref }),
    })
  } catch {
    return null
  }
}

export async function deleteMasterEvent(id: string): Promise<boolean> {
  await backendJson('/api/registry', {
    method: 'POST',
    body: JSON.stringify({ action: 'delete', masterId: id }),
  })
  return true
}

export async function removeChannelFromMaster(
  masterId: string,
  channel: ChannelKey,
): Promise<MasterEventRecord | null> {
  const data = await backendJson<{ ok: boolean; master: MasterEventRecord | null }>('/api/registry', {
    method: 'POST',
    body: JSON.stringify({ action: 'unlink', masterId, channel }),
  })
  return data.master
}
