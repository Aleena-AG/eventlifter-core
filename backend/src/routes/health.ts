import { Router } from 'express'
import { config, dbConfigured } from '../config'
import { getPool } from '../db/pool'

export const healthRouter = Router()

healthRouter.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'ewentcast-backend', db: dbConfigured() })
})

healthRouter.get('/db-health', async (req, res) => {
  if (!config.healthToken) {
    return res.status(503).json({ ok: false, error: 'DB_HEALTH_TOKEN is not set' })
  }
  if (req.query.token !== config.healthToken) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' })
  }
  if (!dbConfigured()) {
    return res.status(503).json({ ok: false, error: 'Database env vars are not configured' })
  }

  try {
    const pool = getPool()
    const [rows] = await pool.query<Array<{ db: string; version: string; server_time: Date }>>(
      'SELECT DATABASE() AS db, VERSION() AS version, NOW() AS server_time',
    )
    const [tables] = await pool.query<Array<{ table_count: number }>>(
      'SELECT COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema = ?',
      [config.db.database],
    )
    const [events] = await pool.query<Array<{ event_count: number }>>(
      'SELECT COUNT(*) AS event_count FROM master_events',
    )

    return res.json({
      ok: true,
      host: config.db.host,
      database: rows[0]?.db ?? config.db.database,
      version: rows[0]?.version,
      serverTime: rows[0]?.server_time,
      tableCount: Number(tables[0]?.table_count ?? 0),
      eventCount: Number(events[0]?.event_count ?? 0),
    })
  } catch (err) {
    return res.status(503).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Connection failed',
    })
  }
})
