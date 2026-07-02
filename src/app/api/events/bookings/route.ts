import { NextRequest, NextResponse } from 'next/server'
import { listAllUserBookings } from '../../../../../backend/src/services/bookings'
import { isErrorResponse, requireSubscribedSession } from '@/lib/server/session'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const session = await requireSubscribedSession(req)
  if (isErrorResponse(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const bookings = await listAllUserBookings(session.user.id)
    return NextResponse.json({ bookings })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'list failed' },
      { status: 500 },
    )
  }
}
