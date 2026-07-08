import { NextRequest, NextResponse } from 'next/server'
import { getDashboardStatsForUser } from '@/lib/server/dashboard-stats'
import { isErrorResponse, requireSubscribedSession } from '@/lib/server/session'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const session = await requireSubscribedSession(req)
  if (isErrorResponse(session)) return session

  try {
    const stats = await getDashboardStatsForUser(session.user.id)
    return NextResponse.json(stats)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'stats failed' },
      { status: 500 },
    )
  }
}
