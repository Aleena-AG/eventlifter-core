import { NextRequest, NextResponse } from 'next/server'
import {
  getBillingSummary,
  isStripeConfigured,
  listBillingInvoices,
} from '@/lib/server/stripe-billing'
import { getAccountView } from '../../../../../backend/src/services/auth'
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
    const [transactions, billing, account] = await Promise.all([
      listBillingInvoices(session.user.id),
      getBillingSummary(session.user.id),
      getAccountView(session.user.id),
    ])
    return NextResponse.json({
      status: true,
      transactions,
      billing,
      ewentcast: account,
    })
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
