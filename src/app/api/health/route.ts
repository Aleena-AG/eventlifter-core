import { NextResponse } from 'next/server'
import { getDbStatus, getDb } from '@/lib/db/index'

export async function GET() {
  const status = getDbStatus()
  let dbOk = false
  let dbError: string | undefined

  try {
    getDb().prepare('SELECT 1 AS ok').get()
    dbOk = true
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e)
  }

  return NextResponse.json({
    ok: dbOk,
    db: { ...status, connected: dbOk, error: dbError },
    hint: !status.exists
      ? 'Database file not created yet — ensure data/ is writable and trigger a sync or save settings.'
      : !status.dirWritable
        ? 'data/ folder is not writable by the Node process — fix chmod/chown.'
        : undefined,
    openLocally: status.exists
      ? 'Stop PM2 before opening in DB Browser (WAL lock). Or run: sqlite3 eventlifter.db \'.backup backup.db\''
      : undefined,
  })
}
