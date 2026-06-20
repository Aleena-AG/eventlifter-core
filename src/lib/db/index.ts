import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

let db: Database.Database | null = null

/** Override on production: DATA_DIR=/var/www/eventlifter-core/data */
const DB_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), 'data')
const DB_PATH = path.join(DB_DIR, 'eventlifter.db')

export function getDbPaths() {
  return {
    dir: DB_DIR,
    file: DB_PATH,
    wal: `${DB_PATH}-wal`,
    shm: `${DB_PATH}-shm`,
  }
}

export function getDbStatus() {
  const paths = getDbPaths()
  let dirWritable = false
  let fileReadable = false
  try {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true })
    fs.accessSync(DB_DIR, fs.constants.W_OK)
    dirWritable = true
  } catch {
    dirWritable = false
  }
  if (fs.existsSync(DB_PATH)) {
    try {
      fs.accessSync(DB_PATH, fs.constants.R_OK)
      fileReadable = true
    } catch {
      fileReadable = false
    }
  }
  return {
    ...paths,
    cwd: process.cwd(),
    dirExists: fs.existsSync(DB_DIR),
    exists: fs.existsSync(DB_PATH),
    dirWritable,
    fileReadable,
    sizeBytes: fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0,
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS master_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 150,
  sold INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS channel_refs (
  master_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  event_id TEXT NOT NULL,
  ticket_id TEXT,
  url TEXT,
  PRIMARY KEY (master_id, channel),
  FOREIGN KEY (master_id) REFERENCES master_events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_channel_refs_lookup ON channel_refs(channel, event_id);

CREATE TABLE IF NOT EXISTS attendees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  master_id TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  source TEXT NOT NULL,
  registered_at TEXT NOT NULL,
  merged INTEGER DEFAULT 0,
  UNIQUE(master_id, email),
  FOREIGN KEY (master_id) REFERENCES master_events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  event_title TEXT NOT NULL,
  event_external_id TEXT,
  registered_at TEXT NOT NULL,
  status TEXT,
  ticket_count INTEGER,
  source TEXT NOT NULL DEFAULT 'api',
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bookings_registered ON bookings(registered_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_channel ON bookings(channel);

CREATE TABLE IF NOT EXISTS channel_events (
  channel TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  start_utc TEXT,
  price_label TEXT,
  payload TEXT,
  synced_at TEXT NOT NULL,
  PRIMARY KEY (channel, external_id)
);

CREATE TABLE IF NOT EXISTS channel_stats (
  channel TEXT PRIMARY KEY,
  events_count INTEGER DEFAULT 0,
  tickets_sold INTEGER DEFAULT 0,
  bookings_count INTEGER DEFAULT 0,
  synced_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`

function migrateFromJson(database: Database.Database) {
  const row = database.prepare('SELECT COUNT(*) AS c FROM master_events').get() as { c: number }
  if (row.c > 0) return

  const jsonPath = path.join(DB_DIR, 'event-registry.json')
  if (!fs.existsSync(jsonPath)) return

  try {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as {
      events?: Array<{
        id: string
        title: string
        capacity: number
        sold: number
        channels?: Record<string, { eventId: string; ticketId?: string; url?: string }>
        attendees?: Array<{ email: string; name: string; source: string; registeredAt: string; merged?: boolean }>
        createdAt: string
        updatedAt: string
      }>
    }

    const insertMaster = database.prepare(`
      INSERT INTO master_events (id, title, capacity, sold, created_at, updated_at)
      VALUES (@id, @title, @capacity, @sold, @created_at, @updated_at)
    `)
    const insertRef = database.prepare(`
      INSERT INTO channel_refs (master_id, channel, event_id, ticket_id, url)
      VALUES (@master_id, @channel, @event_id, @ticket_id, @url)
    `)
    const insertAttendee = database.prepare(`
      INSERT OR IGNORE INTO attendees (master_id, email, name, source, registered_at, merged)
      VALUES (@master_id, @email, @name, @source, @registered_at, @merged)
    `)

    const tx = database.transaction(() => {
      for (const ev of data.events || []) {
        insertMaster.run({
          id: ev.id,
          title: ev.title,
          capacity: ev.capacity,
          sold: ev.sold,
          created_at: ev.createdAt,
          updated_at: ev.updatedAt,
        })
        for (const [channel, ref] of Object.entries(ev.channels || {})) {
          if (!ref?.eventId) continue
          insertRef.run({
            master_id: ev.id,
            channel,
            event_id: String(ref.eventId),
            ticket_id: ref.ticketId || null,
            url: ref.url || null,
          })
        }
        for (const a of ev.attendees || []) {
          insertAttendee.run({
            master_id: ev.id,
            email: a.email.toLowerCase().trim(),
            name: a.name,
            source: a.source,
            registered_at: a.registeredAt,
            merged: a.merged ? 1 : 0,
          })
        }
      }
    })
    tx()
  } catch {
    // ignore corrupt JSON
  }
}

export function getDb(): Database.Database {
  if (db) return db

  try {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true })
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    db.exec(SCHEMA)
    migrateFromJson(db)
    return db
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`SQLite failed at ${DB_PATH} (cwd=${process.cwd()}): ${msg}`)
  }
}

export function getSyncMeta(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM sync_meta WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSyncMeta(key: string, value: string) {
  getDb().prepare(`
    INSERT INTO sync_meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value)
}
