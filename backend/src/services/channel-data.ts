import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import { getPool, query } from '../db/pool'
import { deleteAllChannelBookings } from './bookings'
import type { ChannelName } from './events'

const EVENT_TABLE: Record<ChannelName, string> = {
  luma: 'luma_events',
  eventbrite: 'eventbrite_events',
  hightribe: 'hightribe_events',
}

export async function deleteAllChannelEvents(
  userId: number,
  channel: ChannelName,
): Promise<number> {
  const table = EVENT_TABLE[channel]
  const [result] = await getPool().query<ResultSetHeader>(
    `DELETE FROM ${table} WHERE user_id = ?`,
    [userId],
  )
  return result.affectedRows
}

async function purgeRegistryForChannel(
  userId: number,
  channel: ChannelName,
  externalEventIds: string[],
): Promise<number> {
  const pool = getPool()
  let linksRemoved = 0

  const masterRows = await query<RowDataPacket[]>(
    `SELECT DISTINCT m.id AS master_id
     FROM master_events m
     INNER JOIN channel_refs c ON c.master_id = m.id
     WHERE c.channel = ? AND (m.user_id = ? OR m.user_id IS NULL)`,
    [channel, userId],
  )
  const masterIds = masterRows.map((r) => String(r.master_id))

  if (masterIds.length > 0) {
    const placeholders = masterIds.map(() => '?').join(',')
    await pool.query(
      `DELETE FROM attendees WHERE source_channel = ? AND master_id IN (${placeholders})`,
      [channel, ...masterIds],
    )
  }

  if (externalEventIds.length > 0) {
    const placeholders = externalEventIds.map(() => '?').join(',')
    const [refResult] = await pool.query<ResultSetHeader>(
      `DELETE FROM channel_refs WHERE channel = ? AND event_id IN (${placeholders})`,
      [channel, ...externalEventIds],
    )
    linksRemoved = refResult.affectedRows
  } else {
    const [refResult] = await pool.query<ResultSetHeader>(
      `DELETE c FROM channel_refs c
       INNER JOIN master_events m ON m.id = c.master_id
       WHERE c.channel = ? AND m.user_id = ?`,
      [channel, userId],
    )
    linksRemoved = refResult.affectedRows
  }

  await pool.query(
    `DELETE m FROM master_events m
     LEFT JOIN channel_refs c ON c.master_id = m.id
     WHERE m.user_id = ? AND c.master_id IS NULL`,
    [userId],
  )

  return linksRemoved
}

export async function purgeChannelData(
  userId: number,
  channel: ChannelName,
): Promise<{
  eventsDeleted: number
  bookingsDeleted: number
  registryLinksRemoved: number
}> {
  const table = EVENT_TABLE[channel]
  const eventRows = await query<RowDataPacket[]>(
    `SELECT external_id FROM ${table} WHERE user_id = ?`,
    [userId],
  )
  const externalIds = eventRows.map((r) => String(r.external_id))

  const registryLinksRemoved = await purgeRegistryForChannel(userId, channel, externalIds)
  const eventsDeleted = await deleteAllChannelEvents(userId, channel)
  const bookingsDeleted = await deleteAllChannelBookings(userId, channel)

  return { eventsDeleted, bookingsDeleted, registryLinksRemoved }
}
