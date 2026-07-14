import { NextRequest, NextResponse } from 'next/server'
import { proxyToBackend } from '@/lib/backend-client'
import { isErrorResponse, requireSubscribedSession } from '@/lib/server/session'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const session = await requireSubscribedSession(req)
  if (isErrorResponse(session)) return session

  // Remote API may not expose this yet — forward and surface the response.
  const res = await proxyToBackend(req, 'dashboard/stats')
  if (res.status !== 404) return res

  return NextResponse.json({
    error: 'Dashboard stats are not available on the remote API yet',
    events: [],
    bookings: [],
    channels: {},
  }, { status: 503 })
}
