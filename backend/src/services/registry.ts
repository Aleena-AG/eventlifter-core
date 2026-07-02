import type { ResultSetHeader } from 'mysql2'
import type { RowDataPacket } from 'mysql2'
import { getPool, query } from '../db/pool.js'
import type { AttendeeRecord, ChannelKey, ChannelRef, MasterEventRecord } from '../types.js'

type MasterRow = RowDataPacket & {
  id: string
  title: string
  capacity: number
  sold: number
  created_at: Date
  updated_at: Date
}

type ChannelRow = RowDataPacket & {
  master_id: string
  channel: ChannelKey
  event_id: string
  ticket_id: string | null
  url: string | null
}

type AttendeeRow = RowDataPacket & {
  email: string
  name: string
  source_channel: ChannelKey
  registered_at: Date
}

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString()
}

async function loadChannels(masterIds: string[]): Promise<Map<string, Partial<Record<ChannelKey, ChannelRef>>>> {
  const map = new Map<string, Partial<Record<ChannelKey, ChannelRef>>>()
  if (masterIds.length === 0) return map

  const placeholders = masterIds.map(() => '?').join(',')
  const rows = await query<ChannelRow[]>(
    `SELECT master_id, channel, event_id, ticket_id, url
     FROM channel_refs WHERE master_id IN (${placeholders})`,
    masterIds,
  )

  for (const row of rows) {
    const channels = map.get(row.master_id) || {}
    channels[row.channel] = {
      eventId: row.event_id,
      ticketId: row.ticket_id || undefined,
      url: row.url || undefined,
    }
    map.set(row.master_id, channels)
  }
  return map
}

async function loadAttendees(masterIds: string[]): Promise<Map<string, AttendeeRecord[]>> {
  const map = new Map<string, AttendeeRecord[]>()
  if (masterIds.length === 0) return map

  const placeholders = masterIds.map(() => '?').join(',')
  const rows = await query<AttendeeRow[]>(
    `SELECT master_id, email, name, source_channel, registered_at
     FROM attendees WHERE master_id IN (${placeholders})
     ORDER BY registered_at ASC`,
    masterIds,
  )

  for (const row of rows) {
    const list = map.get(row.master_id) || []
    list.push({
      email: row.email,
      name: row.name,
      source: row.source_channel,
      registeredAt: toIso(row.registered_at),
    })
    map.set(row.master_id, list)
  }
  return map
}

async function assembleMasters(rows: MasterRow[]): Promise<MasterEventRecord[]> {
  const ids = rows.map(r => r.id)
  const [channelsMap, attendeesMap] = await Promise.all([
    loadChannels(ids),
    loadAttendees(ids),
  ])

  return rows.map(row => ({
    id: row.id,
    title: row.title,
    capacity: row.capacity,
    sold: row.sold,
    channels: channelsMap.get(row.id) || {},
    attendees: attendeesMap.get(row.id) || [],
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }))
}

export async function listMasterEvents(): Promise<MasterEventRecord[]> {
  const rows = await query<MasterRow[]>(
    'SELECT id, title, capacity, sold, created_at, updated_at FROM master_events ORDER BY updated_at DESC',
  )
  return assembleMasters(rows)
}

export async function getMasterEvent(id: string): Promise<MasterEventRecord | null> {
  const rows = await query<MasterRow[]>(
    'SELECT id, title, capacity, sold, created_at, updated_at FROM master_events WHERE id = ? LIMIT 1',
    [id],
  )
  if (!rows[0]) return null
  const [master] = await assembleMasters(rows)
  return master
}

export async function findMasterByChannelEvent(
  channel: ChannelKey,
  eventId: string,
): Promise<MasterEventRecord | null> {
  const rows = await query<MasterRow[]>(
    `SELECT m.id, m.title, m.capacity, m.sold, m.created_at, m.updated_at
     FROM master_events m
     INNER JOIN channel_refs c ON c.master_id = m.id
     WHERE c.channel = ? AND c.event_id = ?
     LIMIT 1`,
    [channel, String(eventId)],
  )
  if (!rows[0]) return null
  const [master] = await assembleMasters(rows)
  return master
}

export async function createMasterEvent(input: {
  title: string
  capacity: number
  channels?: Partial<Record<ChannelKey, ChannelRef>>
}): Promise<MasterEventRecord> {
  const now = new Date()
  const id = `mst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const pool = getPool()

  await pool.query(
    `INSERT INTO master_events (id, title, capacity, sold, created_at, updated_at)
     VALUES (?, ?, ?, 0, ?, ?)`,
    [id, input.title, input.capacity, now, now],
  )

  for (const [channel, ref] of Object.entries(input.channels || {})) {
    if (!ref || !['hightribe', 'luma', 'eventbrite'].includes(channel)) continue
    await pool.query(
      `INSERT INTO channel_refs (master_id, channel, event_id, ticket_id, url)
       VALUES (?, ?, ?, ?, ?)`,
      [id, channel, ref.eventId || '', ref.ticketId || null, ref.url || null],
    )
  }

  return (await getMasterEvent(id))!
}

export async function linkChannelEvent(
  masterId: string,
  channel: ChannelKey,
  ref: ChannelRef,
): Promise<MasterEventRecord | null> {
  const master = await getMasterEvent(masterId)
  if (!master) return null

  await getPool().query(
    `INSERT INTO channel_refs (master_id, channel, event_id, ticket_id, url)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE event_id = VALUES(event_id), ticket_id = VALUES(ticket_id), url = VALUES(url)`,
    [masterId, channel, ref.eventId, ref.ticketId || null, ref.url || null],
  )

  await getPool().query('UPDATE master_events SET updated_at = ? WHERE id = ?', [new Date(), masterId])
  return getMasterEvent(masterId)
}

export async function registerAttendee(
  masterId: string,
  attendee: Omit<AttendeeRecord, 'registeredAt'> & { registeredAt?: string },
): Promise<MasterEventRecord | null> {
  const master = await getMasterEvent(masterId)
  if (!master) return null

  const email = attendee.email.toLowerCase().trim()
  const registeredAt = attendee.registeredAt ? new Date(attendee.registeredAt) : new Date()
  const pool = getPool()

  const [result] = await pool.query<ResultSetHeader>(
    `INSERT IGNORE INTO attendees (master_id, email, name, source_channel, registered_at)
     VALUES (?, ?, ?, ?, ?)`,
    [masterId, email, attendee.name, attendee.source, registeredAt],
  )

  if (result.affectedRows > 0) {
    await pool.query(
      `UPDATE master_events
       SET sold = (SELECT COUNT(*) FROM attendees WHERE master_id = ?), updated_at = ?
       WHERE id = ?`,
      [masterId, new Date(), masterId],
    )
  }

  return getMasterEvent(masterId)
}

export async function deleteMasterEvent(id: string): Promise<boolean> {
  const [result] = await getPool().query<ResultSetHeader>(
    'DELETE FROM master_events WHERE id = ?',
    [id],
  )
  return result.affectedRows > 0
}

export async function removeChannelFromMaster(
  masterId: string,
  channel: ChannelKey,
): Promise<MasterEventRecord | null> {
  const master = await getMasterEvent(masterId)
  if (!master) return null

  await getPool().query('DELETE FROM channel_refs WHERE master_id = ? AND channel = ?', [masterId, channel])

  const remaining = await query<{ count: number }[]>(
    'SELECT COUNT(*) AS count FROM channel_refs WHERE master_id = ?',
    [masterId],
  )

  if (Number(remaining[0]?.count) === 0) {
    await deleteMasterEvent(masterId)
    return null
  }

  await getPool().query('UPDATE master_events SET updated_at = ? WHERE id = ?', [new Date(), masterId])
  return getMasterEvent(masterId)
}
