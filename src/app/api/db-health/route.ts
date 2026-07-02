import { NextRequest, NextResponse } from 'next/server'
import { getBackendUrl } from '@/lib/backend-client'

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

  try {
    const res = await fetch(
      `${getBackendUrl()}/db-health?token=${encodeURIComponent(token)}`,
      { cache: 'no-store' },
    )
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Backend unavailable' },
      { status: 503 },
    )
  }
}
