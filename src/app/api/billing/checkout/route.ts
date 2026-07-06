import { NextRequest, NextResponse } from 'next/server'
import { appUrlFromRequest } from '@/lib/app-url'
import {
  createCheckoutSession,
  isStripeConfigured,
} from '@/lib/server/stripe-billing'
import { isErrorResponse, requireSession } from '@/lib/server/session'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const session = await requireSession(req)
  if (isErrorResponse(session)) {
    return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 })
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { status: false, message: 'Stripe billing is not configured on this server.' },
      { status: 503 },
    )
  }

  const body = await req.json().catch(() => ({})) as {
    success_url?: string
    cancel_url?: string
  }
  const origin = appUrlFromRequest(req)
  const successUrl = body.success_url || `${origin}/subscribe?success=1`
  const cancelUrl = body.cancel_url || `${origin}/subscribe?canceled=1`

  try {
    const checkoutUrl = await createCheckoutSession(
      session.user.id,
      successUrl,
      cancelUrl,
    )
    return NextResponse.json({ status: true, checkout_url: checkoutUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Checkout failed'
    const status = message.includes('already active') ? 409 : 500
    return NextResponse.json({ status: false, message }, { status })
  }
}
