import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'

function isServerlessDeploy(): boolean {
  return process.cwd() === '/var/task' || process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME != null
}

export function getDbPath(): string {
  if (process.env.DATA_DIR) {
    const dir = path.resolve(process.env.DATA_DIR)
    fs.mkdirSync(dir, { recursive: true })
    return path.join(dir, 'ewentcast.db')
  }
  if (isServerlessDeploy()) {
    fs.mkdirSync('/tmp', { recursive: true })
    return '/tmp/ewentcast.db'
  }
  const dir = path.join(process.cwd(), 'data')
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'ewentcast.db')
}

declare global {
  // eslint-disable-next-line no-var
  var __ewentcastDb: Database.Database | undefined
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ewentcast_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      auth_source TEXT NOT NULL DEFAULT 'signup',
      ht_user_id TEXT,
      ht_token TEXT,
      ht_connected_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ewentcast_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      plan TEXT NOT NULL DEFAULT 'pro_monthly_20',
      status TEXT NOT NULL DEFAULT 'trialing',
      trial_ends_at TEXT,
      current_period_end TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES ewentcast_users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ewentcast_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES ewentcast_users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_token ON ewentcast_sessions(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON ewentcast_sessions(user_id);
  `)
}

export function getDb(): Database.Database {
  if (global.__ewentcastDb) return global.__ewentcastDb
  const db = new Database(getDbPath())
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  initSchema(db)
  global.__ewentcastDb = db
  return db
}
