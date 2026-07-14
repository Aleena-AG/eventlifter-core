import { NextRequest, NextResponse } from 'next/server'
import { proxyToBackend } from '@/lib/backend-client'
import { deriveDashboardStatsFromApis } from '@/lib/server/derive-dashboard-stats'
import { isErrorResponse, requireSubscribedSession } from '@/lib/server/session'

export const runtime = 'nodejs'

/**
 * Prefer remote /api/v1/dashboard/stats when it exists.
 * Otherwise derive KPIs from bookings + registry + channel events and return 200.
 */
export async function GET(req: NextRequest) {
  const session = await requireSubscribedSession(req)
  if (isErrorResponse(session)) return session

  const auth = req.headers.get('authorization') || `Bearer ${session.token}`

  const res = await proxyToBackend(req, 'dashboard/stats')
  if (res.status === 200) return res

  try {
    const derived = await deriveDashboardStatsFromApis(auth)
    return NextResponse.json(derived, { status: 200 })
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        message: e instanceof Error ? e.message : 'Failed to derive dashboard stats',
        code: 'DASHBOARD_STATS_DERIVE_FAILED',
      },
      { status: 502 },
    )
  }
}
