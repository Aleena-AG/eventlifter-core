import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import '../config.js'
import { getPool, query } from './pool'

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations')

function splitSql(sql: string): string[] {
  return sql
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
}

async function ensureMigrationsTable() {
  const pool = getPool()
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id VARCHAR(128) PRIMARY KEY,
      applied_at DATETIME(3) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

async function isApplied(id: string): Promise<boolean> {
  const rows = await query<{ id: string }[]>(
    'SELECT id FROM schema_migrations WHERE id = ? LIMIT 1',
    [id],
  ).catch(() => [] as { id: string }[])
  if (rows.length > 0) return true

  // Legacy single-file migration id
  if (id === '001_registry') {
    const legacy = await query<{ id: string }[]>(
      "SELECT id FROM schema_migrations WHERE id = '001_initial_schema' LIMIT 1",
    ).catch(() => [] as { id: string }[])
    return legacy.length > 0
  }

  return false
}

async function applyMigration(id: string, sql: string) {
  const pool = getPool()
  for (const statement of splitSql(sql)) {
    await pool.query(statement)
  }
  await pool.query(
    'INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)',
    [id, new Date()],
  )
}

async function seedFromJsonIfEmpty() {
  const [{ count }] = await query<{ count: number }[]>(
    'SELECT COUNT(*) AS count FROM master_events',
  )
  if (Number(count) > 0) return { imported: 0 }

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
  const jsonPath = path.join(root, 'data', 'event-registry.json')
  if (!fs.existsSync(jsonPath)) return { imported: 0 }

  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as {
    events: Array<{
      id: string
      title: string
      capacity: number
      sold: number
      channels: Record<string, { eventId: string; ticketId?: string; url?: string }>
      attendees: Array<{ email: string; name: string; source: string; registeredAt: string }>
      createdAt: string
      updatedAt: string
    }>
  }

  const pool = getPool()
  let imported = 0

  for (const evt of raw.events) {
    await pool.query(
      `INSERT INTO master_events (id, user_id, title, capacity, sold, created_at, updated_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?)`,
      [evt.id, evt.title, evt.capacity, evt.sold, new Date(evt.createdAt), new Date(evt.updatedAt)],
    )

    for (const [channel, ref] of Object.entries(evt.channels || {})) {
      if (!['hightribe', 'luma', 'eventbrite'].includes(channel)) continue
      await pool.query(
        `INSERT INTO channel_refs (master_id, channel, event_id, ticket_id, url)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE event_id = VALUES(event_id), ticket_id = VALUES(ticket_id), url = VALUES(url)`,
        [evt.id, channel, ref.eventId || '', ref.ticketId || null, ref.url || null],
      )
    }

    for (const att of evt.attendees || []) {
      if (!['hightribe', 'luma', 'eventbrite'].includes(att.source)) continue
      await pool.query(
        `INSERT IGNORE INTO attendees (master_id, email, name, source_channel, registered_at)
         VALUES (?, ?, ?, ?, ?)`,
        [evt.id, att.email.toLowerCase(), att.name, att.source, new Date(att.registeredAt)],
      )
    }

    imported++
  }

  return { imported }
}

export async function runMigrations(opts?: { seed?: boolean }): Promise<{ applied: string[]; imported: number }> {
  await ensureMigrationsTable()

  const legacy = await query<{ id: string }[]>(
    "SELECT id FROM schema_migrations WHERE id = '001_initial_schema' LIMIT 1",
  ).catch(() => [] as { id: string }[])
  const reg = await query<{ id: string }[]>(
    "SELECT id FROM schema_migrations WHERE id = '001_registry' LIMIT 1",
  ).catch(() => [] as { id: string }[])
  if (legacy.length > 0 && reg.length === 0) {
    await getPool().query(
      'INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)',
      ['001_registry', new Date()],
    )
  }

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()

  const applied: string[] = []

  for (const file of files) {
    const id = file.replace(/\.sql$/, '')
    if (await isApplied(id)) continue

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
    await applyMigration(id, sql)
    applied.push(id)
  }

  await runOptionalAlters()

  const shouldSeed = opts?.seed !== false
  const { imported } = shouldSeed ? await seedFromJsonIfEmpty() : { imported: 0 }
  return { applied, imported }
}

const APP_TABLES = [
  'channel_bookings',
  'luma_events',
  'eventbrite_events',
  'hightribe_events',
  'ht_connections',
  'user_settings',
  'subscriptions',
  'password_reset_tokens',
  'sessions',
  'users',
  'attendees',
  'channel_refs',
  'master_events',
  'app_settings',
  'schema_migrations',
]

/** Drop all app tables and re-run migrations. Use for a clean local/dev database. */
export async function runFreshMigrations(opts?: { seed?: boolean }): Promise<{
  dropped: string[]
  applied: string[]
  imported: number
}> {
  const pool = getPool()
  const dropped: string[] = []

  await pool.query('SET FOREIGN_KEY_CHECKS = 0')
  for (const table of APP_TABLES) {
    await pool.query(`DROP TABLE IF EXISTS \`${table}\``)
    dropped.push(table)
  }
  await pool.query('SET FOREIGN_KEY_CHECKS = 1')

  const { applied, imported } = await runMigrations({ seed: opts?.seed })
  return { dropped, applied, imported }
}

async function runOptionalAlters() {
  const cols = await query<{ COLUMN_NAME: string }[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'master_events' AND COLUMN_NAME = 'user_id'`,
  )
  if (cols.length === 0) {
    await getPool().query(
      'ALTER TABLE master_events ADD COLUMN user_id BIGINT NULL, ADD INDEX idx_master_events_user (user_id)',
    )
  }
}

const thisFile = fileURLToPath(import.meta.url)

if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  runMigrations()
    .then((r) => {
      console.log(JSON.stringify({ ok: true, ...r }))
      process.exit(0)
    })
    .catch((err) => {
      console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }))
      process.exit(1)
    })
}
