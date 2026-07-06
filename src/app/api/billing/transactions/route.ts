import { NextRequest, NextResponse } from 'next/server'
import {
  isStripeConfigured,
  listBillingInvoices,
} from '@/lib/server/stripe-billing'
import { isErrorResponse, requireSession } from '@/lib/server/session'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const session = await requireSession(req)
  if (isErrorResponse(session)) {
    return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 })
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { status: false, message: 'Stripe billing is not configured.', transactions: [] },
      { status: 503 },
    )
  }

  try {
    const transactions = await listBillingInvoices(session.user.id)
    return NextResponse.json({ status: true, transactions })
  } catch (err) {
    return NextResponse.json(
      {
        status: false,
        message: err instanceof Error ? err.message : 'Could not load billing history',
        transactions: [],
      },
      { status: 500 },
    )
  }
}
