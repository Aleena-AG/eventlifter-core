import { NextRequest, NextResponse } from 'next/server'
import { proxyToBackend } from '@/lib/backend-client'
import {
  assertEwentcastBillingAccess,
  isErrorResponse,
  requireSession,
} from '@/lib/server/session'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const session = await requireSession(req)
  if (isErrorResponse(session)) {
    return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 })
  }

  const billingDenied = await assertEwentcastBillingAccess(
    session.user.id,
    req.headers.get('authorization'),
  )
  if (billingDenied) return billingDenied

  const res = await proxyToBackend(req, 'billing/confirm')
  if (res.status !== 404) return res
  return NextResponse.json(
    { status: false, message: 'Billing is not available on the remote API yet.' },
    { status: 503 },
  )
}
