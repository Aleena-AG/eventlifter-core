import { NextRequest, NextResponse } from 'next/server'
import { proxyToBackend } from '@/lib/backend-client'
import { isErrorResponse, requireSubscribedSession } from '@/lib/server/session'

export const runtime = 'nodejs'

/**
 * Prefer remote /api/v1/dashboard/stats when it exists.
 * Today the remote returns 404 — client falls back to deriveDashboardStats()
 * from GET bookings + GET registry + GET events/:channel.
 */
export async function GET(req: NextRequest) {
  const session = await requireSubscribedSession(req)
  if (isErrorResponse(session)) return session

  const res = await proxyToBackend(req, 'dashboard/stats')
  if (res.status === 200) return res

  // Signal missing remote stats API; frontend derives KPIs from bookings/registry.
  return NextResponse.json(
    {
      success: false,
      derivedRequired: true,
      message: 'Dashboard stats are not available on the remote API yet',
      code: 'DASHBOARD_STATS_MISSING',
    },
    { status: 404 },
  )
}
