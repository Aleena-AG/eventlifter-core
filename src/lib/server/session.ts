import { NextResponse } from 'next/server'
import { getAccountView, resolveSession, type UserRow } from '../../../backend/src/services/auth'

export type SessionContext = { user: UserRow; token: string }

export function isErrorResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse
}

export async function requireSession(req: Request): Promise<SessionContext | NextResponse> {
  const header = req.headers.get('authorization')
  if (!header?.trim()) {
    return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 })
  }

  const user = await resolveSession(header)
  if (!user) {
    return NextResponse.json({ status: false, message: 'Session expired' }, { status: 401 })
  }

  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : header.trim()
  return { user, token }
}

export async function assertEwentcastBillingAccess(userId: number): Promise<NextResponse | null> {
  const account = await getAccountView(userId)
  if (account.auth_source !== 'ewentcast_signup') {
    return NextResponse.json(
      {
        status: false,
        code: 'BILLING_NOT_AVAILABLE',
        message: 'Billing is only available for Ewentcast accounts.',
      },
      { status: 403 },
    )
  }
  return null
}

export async function assertEwentcastSubscription(userId: number): Promise<NextResponse | null> {
  const account = await getAccountView(userId)
  if (account.auth_source === 'ewentcast_signup' && !account.subscription_active) {
    return NextResponse.json(
      {
        status: false,
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'Your free trial has ended. Upgrade to Pro to continue.',
      },
      { status: 402 },
    )
  }
  return null
}

export async function requireSubscribedSession(req: Request): Promise<SessionContext | NextResponse> {
  const session = await requireSession(req)
  if (isErrorResponse(session)) return session

  const denied = await assertEwentcastSubscription(session.user.id)
  if (denied) return denied

  return session
}
