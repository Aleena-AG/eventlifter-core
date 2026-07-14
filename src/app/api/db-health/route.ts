import { NextRequest, NextResponse } from 'next/server'
import { getBackendUrl, backendFetch } from '@/lib/backend-client'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const expected = process.env.DB_HEALTH_TOKEN
  if (expected && token !== expected) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const res = await backendFetch('health')
    const data = await res.json().catch(() => ({}))
    return NextResponse.json({
      ok: res.ok,
      backendUrl: getBackendUrl(),
      note: 'Database health is owned by the remote API',
      ...(typeof data === 'object' && data ? data : {}),
    }, { status: res.ok ? 200 : 503 })
  } catch (err) {
    return NextResponse.json({
      ok: false,
      backendUrl: getBackendUrl(),
      error: err instanceof Error ? err.message : 'unreachable',
    }, { status: 503 })
  }
}
