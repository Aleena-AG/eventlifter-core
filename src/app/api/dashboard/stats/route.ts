import { NextRequest, NextResponse } from 'next/server'
import { getDashboardStatsForUser } from '../../../../backend/src/services/dashboard'
import { isErrorResponse, requireSubscribedSession } from '@/lib/server/session'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const session = await requireSubscribedSession(req)
  if (isErrorResponse(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
