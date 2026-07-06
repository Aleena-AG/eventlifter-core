import { NextRequest, NextResponse } from 'next/server'
import { getAccountView } from '../../../../../backend/src/services/auth'
import { confirmCheckoutSession, isStripeConfigured } from '@/lib/server/stripe-billing'
import { isErrorResponse, requireSession } from '@/lib/server/session'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const session = await requireSession(req)
  if (isErrorResponse(session)) {
    return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 })
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { status: false, message: 'Stripe billing is not configured.' },
      { status: 503 },
    )
  }

  const body = await req.json().catch(() => ({})) as { session_id?: string }
  const sessionId = String(body.session_id || '').trim()
  if (!sessionId) {
    return NextResponse.json({ status: false, message: 'session_id is required' }, { status: 422 })
  }

  try {
    const activated = await confirmCheckoutSession(session.user.id, sessionId)
    const account = await getAccountView(session.user.id)
    return NextResponse.json({
      status: true,
      activated,
      ewentcast: account,
    })
  } catch (err) {
    return NextResponse.json(
      {
        status: false,
        message: err instanceof Error ? err.message : 'Could not confirm payment',
      },
      { status: 500 },
    )
  }
}
