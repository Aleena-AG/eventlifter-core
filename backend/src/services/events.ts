import type { RowDataPacket } from 'mysql2'
import { getPool, query } from '../db/pool'

export type ChannelName = 'luma' | 'eventbrite' | 'hightribe'

const TABLE: Record<ChannelName, string> = {
  luma: 'luma_events',
  eventbrite: 'eventbrite_events',
  hightribe: 'hightribe_events',
}

export interface StoredEvent {
  id: number
  user_id: number
  external_id: string
  title: string
  start_at: string | null
  end_at: string | null
  timezone: string | null
  url: string | null
  cover_url: string | null
  status: string | null
  payload: Record<string, unknown>
  synced_at: string
}

function toIso(v: Date | string | null | undefined): string | null {
  if (!v) return null
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString()
}

function mapRow(row: RowDataPacket): StoredEvent {
  const payload = typeof row.payload_json === 'string'
    ? JSON.parse(row.payload_json)
    : row.payload_json

  return {
    id: Number(row.id),
    user_id: Number(row.user_id),
    external_id: String(row.external_id),
    title: String(row.title || ''),
    start_at: toIso(row.start_at),
    end_at: toIso(row.end_at),
    timezone: row.timezone ? String(row.timezone) : null,
    url: row.url ? String(row.url) : null,
    cover_url: row.cover_url ? String(row.cover_url) : null,
    status: row.status ? String(row.status) : null,
    payload: payload as Record<string, unknown>,
    synced_at: toIso(row.synced_at) || new Date().toISOString(),
  }
}

export async function listChannelEvents(
  channel: ChannelName,
  userId: number,
): Promise<StoredEvent[]> {
  const table = TABLE[channel]
  const rows = await query<RowDataPacket[]>(
    `SELECT * FROM ${table} WHERE user_id = ? ORDER BY start_at DESC, updated_at DESC`,
    [userId],
  )
  return rows.map(mapRow)
}

export async function upsertChannelEvents(
  channel: ChannelName,
  userId: number,
  events: Array<Record<string, unknown>>,
): Promise<{ upserted: number }> {
  const pool = getPool()
  const now = new Date()
  let upserted = 0

  for (const raw of events) {
    const n = normalizeEvent(channel, raw)
    if (!n.external_id) continue

    if (channel === 'luma') {
      await pool.query(
        `INSERT INTO luma_events (
          user_id, external_id, title, start_at, end_at, timezone, url, cover_url,
          location_json, meeting_url, status, payload_json, synced_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          title = VALUES(title), start_at = VALUES(start_at), end_at = VALUES(end_at),
          timezone = VALUES(timezone), url = VALUES(url), cover_url = VALUES(cover_url),
          location_json = VALUES(location_json), meeting_url = VALUES(meeting_url),
          status = VALUES(status), payload_json = VALUES(payload_json),
          synced_at = VALUES(synced_at), updated_at = VALUES(updated_at)`,
        [
          userId, n.external_id, n.title, n.start_at, n.end_at, n.timezone, n.url, n.cover_url,
          n.location_json, n.meeting_url, n.status, JSON.stringify(raw), now, now, now,
        ],
      )
    } else if (channel === 'eventbrite') {
      await pool.query(
        `INSERT INTO eventbrite_events (
          user_id, external_id, title, start_at, end_at, timezone, url, cover_url,
          is_free, status, payload_json, synced_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          title = VALUES(title), start_at = VALUES(start_at), end_at = VALUES(end_at),
          timezone = VALUES(timezone), url = VALUES(url), cover_url = VALUES(cover_url),
          is_free = VALUES(is_free), status = VALUES(status), payload_json = VALUES(payload_json),
          synced_at = VALUES(synced_at), updated_at = VALUES(updated_at)`,
        [
          userId, n.external_id, n.title, n.start_at, n.end_at, n.timezone, n.url, n.cover_url,
          n.is_free, n.status, JSON.stringify(raw), now, now, now,
        ],
      )
    } else {
      await pool.query(
        `INSERT INTO hightribe_events (
          user_id, external_id, title, start_at, end_at, timezone, url, cover_url,
          location, status, payload_json, synced_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          title = VALUES(title), start_at = VALUES(start_at), end_at = VALUES(end_at),
          timezone = VALUES(timezone), url = VALUES(url), cover_url = VALUES(cover_url),
          location = VALUES(location), status = VALUES(status), payload_json = VALUES(payload_json),
          synced_at = VALUES(synced_at), updated_at = VALUES(updated_at)`,
        [
          userId, n.external_id, n.title, n.start_at, n.end_at, n.timezone, n.url, n.cover_url,
          n.location, n.status, JSON.stringify(raw), now, now, now,
        ],
      )
    }

    upserted++
  }

  return { upserted }
}

function normalizeEvent(channel: ChannelName, raw: Record<string, unknown>) {
  if (channel === 'luma') {
    const event = (raw.event as Record<string, unknown>) || raw
    return {
      external_id: String(event.api_id || raw.api_id || ''),
      title: String(event.name || raw.name || ''),
      start_at: parseDate(event.start_at || raw.start_at),
      end_at: parseDate(event.end_at || raw.end_at),
      timezone: String(event.timezone || raw.timezone || '') || null,
      url: String(event.url || raw.url || '') || null,
      cover_url: String(event.cover_url || raw.cover_url || '') || null,
      location_json: event.geo_address_json || raw.geo_address_json
        ? JSON.stringify(event.geo_address_json || raw.geo_address_json)
        : null,
      meeting_url: String(event.meeting_url || raw.meeting_url || '') || null,
      is_free: null as number | null,
      location: null as string | null,
      status: String(event.status || raw.status || '') || null,
    }
  }

  if (channel === 'eventbrite') {
    const name = raw.name as { text?: string } | undefined
    const start = raw.start as { utc?: string } | undefined
    const end = raw.end as { utc?: string } | undefined
    const logo = raw.logo as { original?: { url?: string } } | undefined
    return {
      external_id: String(raw.id || ''),
      title: String(name?.text || ''),
      start_at: parseDate(start?.utc),
      end_at: parseDate(end?.utc),
      timezone: null,
      url: String(raw.url || '') || null,
      cover_url: String(logo?.original?.url || '') || null,
      location_json: null,
      meeting_url: null,
      is_free: raw.is_free ? 1 : 0,
      location: null,
      status: String(raw.status || '') || null,
    }
  }

  return {
    external_id: String(raw.id || raw.event_id || ''),
    title: String(raw.title || raw.name || ''),
    start_at: parseDate(htStartAt(raw)),
    end_at: parseDate(htEndAt(raw)),
    timezone: String(raw.timezone || '') || null,
    url: String(raw.url || '') || null,
    cover_url: String(raw.cover_url || raw.image || '') || null,
    location_json: null,
    meeting_url: null,
    is_free: null,
    location: String(raw.location || raw.venue || '') || null,
    status: String(raw.status || '') || null,
  }
}

function parseDate(v: unknown): Date | null {
  if (!v) return null
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d
}

function htStartAt(raw: Record<string, unknown>): unknown {
  const dates = raw.dates as { starts_at?: string; start_date?: string; start_time?: string } | undefined
  if (dates?.starts_at) return dates.starts_at
  if (dates?.start_date) {
    return dates.start_time ? `${dates.start_date}T${dates.start_time}` : dates.start_date
  }
  return raw.start_date || raw.start_at || raw.start
}

function htEndAt(raw: Record<string, unknown>): unknown {
  const dates = raw.dates as { ends_at?: string; end_date?: string; end_time?: string } | undefined
  if (dates?.ends_at) return dates.ends_at
  if (dates?.end_date) {
    return dates.end_time ? `${dates.end_date}T${dates.end_time}` : dates.end_date
  }
  return raw.end_date || raw.end_at || raw.end
}

export async function deleteChannelEvent(
  channel: ChannelName,
  userId: number,
  externalId: string,
): Promise<boolean> {
  const table = TABLE[channel]
  const [result] = await getPool().query(
    `DELETE FROM ${table} WHERE user_id = ? AND external_id = ?`,
    [userId, externalId],
  )
  return (result as { affectedRows: number }).affectedRows > 0
}
