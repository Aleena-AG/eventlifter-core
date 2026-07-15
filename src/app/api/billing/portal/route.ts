import { NextRequest, NextResponse } from 'next/server'
import { proxyToBackend } from '@/lib/backend-client'
import {
  assertEwentcastBillingAccess,
  isErrorResponse,
  requireSession,
} from '@/lib/server/session'

export const runtime = 'nodejs'

async function gate(req: NextRequest) {
  const session = await requireSession(req)
  if (isErrorResponse(session)) {
    return { error: NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 }) }
  }
  const billingDenied = await assertEwentcastBillingAccess(
    session.user.id,
    req.headers.get('authorization'),
  )
  if (billingDenied) return { error: billingDenied }
  return { session }
}

export async function POST(req: NextRequest) {
  const gated = await gate(req)
  if ('error' in gated && gated.error) return gated.error

  const res = await proxyToBackend(req, 'billing/portal')
  return res
}
