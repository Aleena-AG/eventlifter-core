import { NextResponse } from 'next/server'
import { backendJson } from '@/lib/backend-client'

export type UserRow = {
  id: number
  name: string
  email: string
  auth_source?: string
  [key: string]: unknown
}

export type EwentcastAccount = {
  auth_source?: string
  subscription_active?: boolean
  [key: string]: unknown
}

export type SessionContext = { user: UserRow; token: string; account?: EwentcastAccount }

type MeResponse = {
  status?: boolean
  user?: UserRow
  ewentcast?: EwentcastAccount
  message?: string
}

export function isErrorResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse
}

async function fetchMe(authorization: string): Promise<MeResponse | null> {
  try {
    return await backendJson<MeResponse>('auth/me', {
      headers: { Authorization: authorization },
    })
  } catch {
    return null
  }
}

export async function requireSession(req: Request): Promise<SessionContext | NextResponse> {
  const header = req.headers.get('authorization')
  if (!header?.trim()) {
    return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 })
  }

  try {
    const me = await fetchMe(header)
    if (!me?.user) {
      return NextResponse.json({ status: false, message: 'Session expired' }, { status: 401 })
    }

    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : header.trim()
    return { user: me.user, token, account: me.ewentcast }
  } catch (err) {
    console.error('[requireSession]', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { status: false, message: 'Service temporarily unavailable' },
      { status: 503 },
    )
  }
}

export async function getAccountView(userId: number, authorization?: string | null): Promise<EwentcastAccount> {
  if (authorization?.trim()) {
    const me = await fetchMe(authorization)
    if (me?.ewentcast) return me.ewentcast
  }
  return { auth_source: 'ewentcast_signup', subscription_active: true }
}

export async function assertEwentcastBillingAccess(
  userId: number,
  authorization?: string | null,
): Promise<NextResponse | null> {
  const account = await getAccountView(userId, authorization)
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

export async function assertEwentcastSubscription(
  userId: number,
  authorization?: string | null,
): Promise<NextResponse | null> {
  const account = await getAccountView(userId, authorization)
  if (account.auth_source === 'ewentcast_signup' && account.subscription_active === false) {
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

  const denied = await assertEwentcastSubscription(
    session.user.id,
    req.headers.get('authorization'),
  )
  if (denied) return denied

  return session
}
