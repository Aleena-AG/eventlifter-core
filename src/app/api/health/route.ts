import { NextResponse } from 'next/server'
import { config, dbConfigured, useDatabase } from '../../../../backend/src/config'
import { runDbHealthCheck } from '@/lib/server/db-health'

export const runtime = 'nodejs'

/** Next.js + MySQL health (Vercel — no separate Express). */
export async function GET() {
  if (!useDatabase()) {
    return NextResponse.json({
      ok: true,
      next: true,
      backend: true,
      service: 'ewentcast-api',
      storage: 'local-file',
      database: null,
      store: 'data/local-app-store.json',
    })
  }

  if (!dbConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        next: true,
        backend: false,
        database: config.db.database || null,
        error: 'CHANNEL_MANAGER_DB_* env vars are not set on Vercel',
        hint: 'Add DB env vars in Vercel project settings, then redeploy.',
      },
      { status: 503 },
    )
  }

  const db = await runDbHealthCheck()
  if (!db.ok) {
    return NextResponse.json(
      {
        ok: false,
        next: true,
        backend: false,
        database: config.db.database || null,
        error: db.error,
      },
      { status: 503 },
    )
  }

  return NextResponse.json({
    ok: true,
    next: true,
    backend: true,
    service: 'ewentcast-api',
    storage: 'mysql',
    database: db.database,
  })
}
