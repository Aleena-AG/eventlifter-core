import { NextRequest, NextResponse } from 'next/server'
import { config } from '../../../../backend/src/config'
import { runDbHealthCheck } from '@/lib/server/db-health'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const token = process.env.DB_HEALTH_TOKEN
  if (!token) {
    return NextResponse.json(
      { ok: false, error: 'DB_HEALTH_TOKEN is not set on the server' },
      { status: 503 },
    )
  }

  const provided = req.nextUrl.searchParams.get('token')
  if (!provided || provided !== token) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  if (!config.healthToken && token) {
    // allow when only env token matches query
  }

  const result = await runDbHealthCheck()
  return NextResponse.json(result, { status: result.ok ? 200 : 503 })
}
