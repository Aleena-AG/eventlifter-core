import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import { useDatabase } from '../config'
import { getPool, query } from '../db/pool'
import { localDeleteAllBookings, localListBookings, localUpsertBookings } from '../db/local-store'
import type { ChannelName } from './events'

export interface StoredBooking {
  id: number
  user_id: number
  channel: ChannelName
  external_id: string
  event_external_id: string | null
  event_title: string
  guest_name: string
  guest_email: string
  status: string | null
  ticket_count: number | null
  registered_at: string
  payload: Record<string, unknown>
  synced_at: string
}

function toIso(v: Date | string | null | undefined): string | null {
  if (!v) return null
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString()
}

const LIST_COLUMNS = `id, user_id, channel, external_id, event_external_id, event_title,
  guest_name, guest_email, status, ticket_count, registered_at, synced_at, payload_json`

function mapRowLite(row: RowDataPacket): StoredBooking {
  return {
    id: Number(row.id),
    user_id: Number(row.user_id),
    channel: row.channel as ChannelName,
    external_id: String(row.external_id),
    event_external_id: row.event_external_id ? String(row.event_external_id) : null,
    event_title: String(row.event_title || ''),
    guest_name: String(row.guest_name || ''),
    guest_email: String(row.guest_email || ''),
    status: row.status ? String(row.status) : null,
    ticket_count: row.ticket_count != null ? Number(row.ticket_count) : null,
    registered_at: toIso(row.registered_at) || new Date().toISOString(),
    payload: {},
    synced_at: toIso(row.synced_at) || new Date().toISOString(),
  }
}

function mapRow(row: RowDataPacket): StoredBooking {
  const payload = typeof row.payload_json === 'string'
    ? JSON.parse(row.payload_json)
    : row.payload_json

  return {
    id: Number(row.id),
    user_id: Number(row.user_id),
    channel: row.channel as ChannelName,
    external_id: String(row.external_id),
    event_external_id: row.event_external_id ? String(row.event_external_id) : null,
    event_title: String(row.event_title || ''),
    guest_name: String(row.guest_name || ''),
    guest_email: String(row.guest_email || ''),
    status: row.status ? String(row.status) : null,
    ticket_count: row.ticket_count != null ? Number(row.ticket_count) : null,
    registered_at: toIso(row.registered_at) || new Date().toISOString(),
    payload: (payload || {}) as Record<string, unknown>,
    synced_at: toIso(row.synced_at) || new Date().toISOString(),
  }
}

function normalizeBooking(
  channel: ChannelName,
  raw: Record<string, unknown>,
): {
  external_id: string
  event_external_id: string | null
  event_title: string
  guest_name: string
  guest_email: string
  status: string | null
  ticket_count: number | null
  registered_at: Date
} | null {
  const externalId = String(raw.id || raw.external_id || '').trim()
  const email = String(raw.email || raw.guest_email || '').trim().toLowerCase()
  if (!externalId || !email) return null

  const registeredAt = raw.registered_at || raw.registeredAt
  const registered = registeredAt ? new Date(String(registeredAt)) : new Date()
  if (Number.isNaN(registered.getTime())) return null

  return {
    external_id: externalId.slice(0, 191),
    event_external_id: raw.event_external_id || raw.eventExternalId
      ? String(raw.event_external_id || raw.eventExternalId).slice(0, 128)
      : null,
    event_title: String(raw.event_title || raw.eventTitle || 'Untitled').slice(0, 500),
    guest_name: String(raw.name || raw.guest_name || raw.guestName || email.split('@')[0] || 'Guest').slice(0, 500),
    guest_email: email.slice(0, 320),
    status: raw.status ? String(raw.status).slice(0, 64) : null,
    ticket_count: typeof raw.ticket_count === 'number'
      ? raw.ticket_count
      : typeof raw.ticketCount === 'number'
        ? raw.ticketCount
        : null,
    registered_at: registered,
  }
}

const UPSERT_SQL = `INSERT INTO channel_bookings (
  user_id, channel, external_id, event_external_id, event_title,
  guest_name, guest_email, status, ticket_count, registered_at,
  payload_json, synced_at, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE
  event_external_id = VALUES(event_external_id),
  event_title = VALUES(event_title),
  guest_name = VALUES(guest_name),
  guest_email = VALUES(guest_email),
  status = VALUES(status),
  ticket_count = VALUES(ticket_count),
  registered_at = VALUES(registered_at),
  payload_json = VALUES(payload_json),
  synced_at = VALUES(synced_at),
  updated_at = VALUES(updated_at)`

function mapLocalLite(row: import('../db/local-store').LocalBookingRow): StoredBooking {
  return {
    id: row.id,
    user_id: row.user_id,
    channel: row.channel,
    external_id: row.external_id,
    event_external_id: row.event_external_id,
    event_title: row.event_title,
    guest_name: row.guest_name,
    guest_email: row.guest_email,
    status: row.status,
    ticket_count: row.ticket_count,
    registered_at: row.registered_at,
    payload: row.payload_json || {},
    synced_at: row.synced_at,
  }
}

export async function listAllUserBookings(userId: number): Promise<StoredBooking[]> {
  if (!useDatabase()) {
    return localListBookings(userId).map(mapLocalLite)
  }
  const rows = await query<RowDataPacket[]>(
    `SELECT ${LIST_COLUMNS} FROM channel_bookings WHERE user_id = ? ORDER BY registered_at DESC`,
    [userId],
  )
  return rows.map(mapRow)
}

export async function listChannelBookings(
  channel: ChannelName,
  userId: number,
): Promise<StoredBooking[]> {
  if (!useDatabase()) {
    return localListBookings(userId).filter((b) => b.channel === channel).map(mapLocalLite)
  }
  const rows = await query<RowDataPacket[]>(
    `SELECT ${LIST_COLUMNS} FROM channel_bookings
     WHERE user_id = ? AND channel = ?
     ORDER BY registered_at DESC`,
    [userId, channel],
  )
  return rows.map(mapRow)
}

export async function upsertWebhookBooking(input: {
  userId: number
  channel: ChannelName
  externalId: string
  eventExternalId: string
  eventTitle: string
  guestName: string
  guestEmail: string
  registeredAt: Date
  status?: string
}): Promise<boolean> {
  if (!useDatabase()) {
    const now = new Date().toISOString()
    localUpsertBookings(input.userId, input.channel, [{
      external_id: input.externalId.slice(0, 191),
      event_external_id: input.eventExternalId.slice(0, 128),
      event_title: input.eventTitle.slice(0, 500),
      guest_name: input.guestName.slice(0, 500),
      guest_email: input.guestEmail.toLowerCase().slice(0, 320),
      status: (input.status || 'confirmed').slice(0, 64),
      ticket_count: 1,
      registered_at: input.registeredAt.toISOString(),
      payload_json: {
        _source: 'webhook',
        channel: input.channel,
        event_id: input.eventExternalId,
        email: input.guestEmail,
        name: input.guestName,
        registered_at: input.registeredAt.toISOString(),
      },
      synced_at: now,
    }])
    return true
  }

  const now = new Date()
  const payload = {
    _source: 'webhook',
    channel: input.channel,
    event_id: input.eventExternalId,
    email: input.guestEmail,
    name: input.guestName,
    registered_at: input.registeredAt.toISOString(),
  }

  const [result] = await getPool().query<ResultSetHeader>(UPSERT_SQL, [
    input.userId,
    input.channel,
    input.externalId.slice(0, 191),
    input.eventExternalId.slice(0, 128),
    input.eventTitle.slice(0, 500),
    input.guestName.slice(0, 500),
    input.guestEmail.toLowerCase().slice(0, 320),
    (input.status || 'confirmed').slice(0, 64),
    1,
    input.registeredAt,
    JSON.stringify(payload),
    now,
    now,
    now,
  ])

  return result.affectedRows > 0
}

export async function upsertChannelBookings(
  channel: ChannelName,
  userId: number,
  bookings: Array<Record<string, unknown>>,
): Promise<{ upserted: number }> {
  if (!useDatabase()) {
    const now = new Date().toISOString()
    const rows = bookings.map((raw) => {
      const n = normalizeBooking(channel, raw)
      if (!n) return null
      return {
        external_id: n.external_id,
        event_external_id: n.event_external_id,
        event_title: n.event_title,
        guest_name: n.guest_name,
        guest_email: n.guest_email,
        status: n.status,
        ticket_count: n.ticket_count,
        registered_at: n.registered_at.toISOString(),
        payload_json: raw,
        synced_at: now,
      }
    }).filter((r): r is NonNullable<typeof r> => r != null)
    const upserted = localUpsertBookings(userId, channel, rows)
    return { upserted }
  }

  const pool = getPool()
  const now = new Date()
  let upserted = 0

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    for (const raw of bookings) {
      const n = normalizeBooking(channel, raw)
      if (!n) continue

      await conn.query(UPSERT_SQL, [
        userId, channel, n.external_id, n.event_external_id, n.event_title,
        n.guest_name, n.guest_email, n.status, n.ticket_count, n.registered_at,
        JSON.stringify(raw), now, now, now,
      ])
      upserted++
    }
    await conn.commit()
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }

  return { upserted }
}

export async function deleteAllChannelBookings(
  userId: number,
  channel: ChannelName,
): Promise<number> {
  if (!useDatabase()) {
    return localDeleteAllBookings(userId, channel)
  }
  const [result] = await getPool().query<ResultSetHeader>(
    'DELETE FROM channel_bookings WHERE user_id = ? AND channel = ?',
    [userId, channel],
  )
  return result.affectedRows
}
