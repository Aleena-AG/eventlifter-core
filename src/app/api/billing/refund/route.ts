import { NextRequest, NextResponse } from 'next/server'
import { getAccountView } from '../../../../../backend/src/services/auth'
import {
  getMoneyBackRefundStatus,
  isStripeConfigured,
  processMoneyBackRefund,
} from '@/lib/server/stripe-billing'
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
      { status: false, message: 'Stripe billing is not configured.' },
      { status: 503 },
    )
  }

  try {
    const refund = await getMoneyBackRefundStatus(session.user.id)
    return NextResponse.json({ status: true, refund })
  } catch (err) {
    return NextResponse.json(
      { status: false, message: err instanceof Error ? err.message : 'Could not load refund status' },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req)
  if (isErrorResponse(session)) {
    return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 })
  }

  const billingDenied = await assertEwentcastBillingAccess(session.user.id)
  if (billingDenied) return billingDenied

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { status: false, message: 'Stripe billing is not configured.' },
      { status: 503 },
    )
  }

  try {
    const result = await processMoneyBackRefund(session.user.id)
    const account = await getAccountView(session.user.id)
    return NextResponse.json({
      status: true,
      message: 'Refund processed. Your subscription has been canceled.',
      result,
      ewentcast: account,
    })
  } catch (err) {
    return NextResponse.json(
      { status: false, message: err instanceof Error ? err.message : 'Refund failed' },
      { status: 400 },
    )
  }
}
