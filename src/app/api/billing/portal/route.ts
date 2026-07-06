import { NextRequest, NextResponse } from 'next/server'
import { appUrlFromRequest } from '@/lib/app-url'
import {
  createBillingPortalSession,
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

  const body = await req.json().catch(() => ({})) as { return_url?: string }
  const returnUrl = body.return_url || `${appUrlFromRequest(req)}/settings`

  try {
    const portalUrl = await createBillingPortalSession(session.user.id, returnUrl)
    return NextResponse.json({ status: true, portal_url: portalUrl })
  } catch (err) {
    return NextResponse.json(
      {
        status: false,
        message: err instanceof Error ? err.message : 'Could not open billing portal',
      },
      { status: 500 },
    )
  }
}
