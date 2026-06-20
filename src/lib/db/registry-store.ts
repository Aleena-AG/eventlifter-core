import type { ChannelKey } from '@/lib/types'
import type { AttendeeRecord, ChannelRef, MasterEventRecord } from '@/lib/event-registry'
import { getDb } from '@/lib/db/index'

function rowToMaster(id: string): MasterEventRecord | undefined {
  const db = getDb()
  const row = db.prepare('SELECT * FROM master_events WHERE id = ?').get(id) as {
    id: string; title: string; capacity: number; sold: number; created_at: string; updated_at: string
  } | undefined
  if (!row) return undefined

  const refs = db.prepare('SELECT * FROM channel_refs WHERE master_id = ?').all(id) as Array<{
    channel: ChannelKey; event_id: string; ticket_id: string | null; url: string | null
  }>
  const attendees = db.prepare('SELECT * FROM attendees WHERE master_id = ? ORDER BY registered_at DESC').all(id) as Array<{
    email: string; name: string; source: ChannelKey; registered_at: string; merged: number
  }>

  const channels: Partial<Record<ChannelKey, ChannelRef>> = {}
  for (const r of refs) {
    channels[r.channel] = {
      eventId: r.event_id,
      ticketId: r.ticket_id || undefined,
      url: r.url || undefined,
    }
  }

  return {
    id: row.id,
    title: row.title,
    capacity: row.capacity,
    sold: row.sold,
    channels,
    attendees: attendees.map(a => ({
      email: a.email,
      name: a.name,
      source: a.source,
      registeredAt: a.registered_at,
      merged: !!a.merged,
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function listMasterEvents(): MasterEventRecord[] {
  const ids = getDb().prepare('SELECT id FROM master_events ORDER BY updated_at DESC').all() as Array<{ id: string }>
  return ids.map(r => rowToMaster(r.id)).filter(Boolean) as MasterEventRecord[]
}

export function getMasterEvent(id: string): MasterEventRecord | undefined {
  return rowToMaster(id)
}

export function findMasterByChannelEvent(channel: ChannelKey, eventId: string): MasterEventRecord | undefined {
  const row = getDb().prepare(`
    SELECT master_id FROM channel_refs WHERE channel = ? AND event_id = ?
  `).get(channel, String(eventId)) as { master_id: string } | undefined
  if (!row) return undefined
  return rowToMaster(row.master_id)
}

export function saveMasterEvent(record: MasterEventRecord): MasterEventRecord {
  const db = getDb()
  record.updatedAt = new Date().toISOString()

  db.prepare(`
    INSERT INTO master_events (id, title, capacity, sold, created_at, updated_at)
    VALUES (@id, @title, @capacity, @sold, @createdAt, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      capacity = excluded.capacity,
      sold = excluded.sold,
      updated_at = excluded.updated_at
  `).run({
    id: record.id,
    title: record.title,
    capacity: record.capacity,
    sold: record.sold,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  })

  db.prepare('DELETE FROM channel_refs WHERE master_id = ?').run(record.id)
  const insertRef = db.prepare(`
    INSERT INTO channel_refs (master_id, channel, event_id, ticket_id, url)
    VALUES (@master_id, @channel, @event_id, @ticket_id, @url)
  `)
  for (const ch of ['hightribe', 'luma', 'eventbrite'] as ChannelKey[]) {
    const ref = record.channels[ch]
    if (!ref?.eventId) continue
    insertRef.run({
      master_id: record.id,
      channel: ch,
      event_id: String(ref.eventId),
      ticket_id: ref.ticketId || null,
      url: ref.url || null,
    })
  }

  return record
}

export function createMasterEvent(input: {
  title: string
  capacity: number
  channels?: Partial<Record<ChannelKey, ChannelRef>>
}): MasterEventRecord {
  const now = new Date().toISOString()
  const record: MasterEventRecord = {
    id: `mst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: input.title,
    capacity: input.capacity,
    sold: 0,
    channels: input.channels || {},
    attendees: [],
    createdAt: now,
    updatedAt: now,
  }
  return saveMasterEvent(record)
}

export function registerAttendee(
  masterId: string,
  attendee: Omit<AttendeeRecord, 'registeredAt'> & { registeredAt?: string },
): MasterEventRecord | null {
  const master = getMasterEvent(masterId)
  if (!master) return null

  const email = attendee.email.toLowerCase().trim()
  const registeredAt = attendee.registeredAt || new Date().toISOString()

  const result = getDb().prepare(`
    INSERT OR IGNORE INTO attendees (master_id, email, name, source, registered_at, merged)
    VALUES (?, ?, ?, ?, ?, 0)
  `).run(masterId, email, attendee.name, attendee.source, registeredAt)

  if (result.changes > 0) {
    const sold = getDb().prepare('SELECT COUNT(*) AS c FROM attendees WHERE master_id = ?').get(masterId) as { c: number }
    getDb().prepare('UPDATE master_events SET sold = ?, updated_at = ? WHERE id = ?').run(sold.c, new Date().toISOString(), masterId)
  }

  return getMasterEvent(masterId)
}

export function linkChannelEvent(
  masterId: string,
  channel: ChannelKey,
  ref: ChannelRef,
): MasterEventRecord | null {
  const master = getMasterEvent(masterId)
  if (!master) return null
  master.channels[channel] = ref
  return saveMasterEvent(master)
}

export function deleteMasterEvent(id: string): boolean {
  const result = getDb().prepare('DELETE FROM master_events WHERE id = ?').run(id)
  return result.changes > 0
}

export function removeChannelFromMaster(masterId: string, channel: ChannelKey): MasterEventRecord | null {
  const master = getMasterEvent(masterId)
  if (!master) return null
  delete master.channels[channel]
  getDb().prepare('DELETE FROM channel_refs WHERE master_id = ? AND channel = ?').run(masterId, channel)
  const remaining = Object.keys(master.channels).length
  if (remaining === 0) {
    deleteMasterEvent(masterId)
    return null
  }
  return saveMasterEvent(master)
}
