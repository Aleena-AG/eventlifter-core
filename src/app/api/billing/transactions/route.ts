import { NextRequest, NextResponse } from 'next/server'
import {
  getBillingSummary,
  isStripeConfigured,
  listBillingInvoices,
} from '@/lib/server/stripe-billing'
import { getAccountView } from '../../../../../backend/src/services/auth'
import { isErrorResponse, requireSession, assertEwentcastBillingAccess } from '@/lib/server/session'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const session = await requireSession(req)
  if (isErrorResponse(session)) {
    return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 })
  }

  const billingDenied = await assertEwentcastBillingAccess(session.user.id)
  if (billingDenied) return billingDenied

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { status: false, message: 'Stripe billing is not configured.', transactions: [] },
      { status: 503 },
    )
  }

  try {
    const [transactions, account] = await Promise.all([
      listBillingInvoices(session.user.id),
      getAccountView(session.user.id),
    ])

    let billing = {
      current_period_end: null as string | null,
      amount_usd: 20,
      currency: 'usd',
    }
    try {
      billing = await getBillingSummary(session.user.id)
    } catch (summaryErr) {
      console.error('[billing/transactions] summary failed:', summaryErr)
    }

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
