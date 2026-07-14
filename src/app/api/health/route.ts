import { NextRequest, NextResponse } from 'next/server'
import { getBackendUrl, backendFetch } from '@/lib/backend-client'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest) {
  try {
    const res = await backendFetch('health')
    const data = await res.json().catch(() => ({}))
    return NextResponse.json({
      ok: res.ok,
      backend: res.ok,
      backendUrl: getBackendUrl(),
      ...(typeof data === 'object' && data ? data : {}),
    }, { status: res.ok ? 200 : 503 })
  } catch (err) {
    return NextResponse.json({
      ok: false,
      backend: false,
      backendUrl: getBackendUrl(),
      error: err instanceof Error ? err.message : 'health check failed',
    }, { status: 503 })
  }
}
