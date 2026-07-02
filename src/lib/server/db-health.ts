import type { RowDataPacket } from 'mysql2'
import { config, dbConfigured } from '../../../backend/src/config'
import { getPool } from '../../../backend/src/db/pool'

export async function runDbHealthCheck() {
  if (!dbConfigured()) {
    return { ok: false as const, error: 'Database env vars are not configured' }
  }

  try {
    const pool = getPool()
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT DATABASE() AS db, VERSION() AS version, NOW() AS server_time',
    )
    const [tables] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema = ?',
      [config.db.database],
    )
    const [events] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS event_count FROM master_events',
    )

    const row = rows[0] as { db?: string; version?: string; server_time?: Date }
    return {
      ok: true as const,
      host: config.db.host,
      database: row?.db ?? config.db.database,
      version: row?.version,
      serverTime: row?.server_time,
      tableCount: Number((tables[0] as { table_count?: number })?.table_count ?? 0),
      eventCount: Number((events[0] as { event_count?: number })?.event_count ?? 0),
    }
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Connection failed',
    }
  }
}
