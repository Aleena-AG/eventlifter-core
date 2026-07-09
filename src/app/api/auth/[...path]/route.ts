import { NextRequest, NextResponse } from 'next/server'
import {
  deleteSession,
  getMe,
  loginUser,
  registerUser,
  requestPasswordReset,
  resetPassword,
} from '../../../../../backend/src/services/auth'
import {
  connectHightribeAccount,
  disconnectHightribeAccount,
  loginHightribeAccount,
  loginHightribeWithToken,
} from '../../../../../backend/src/services/hightribe-connect'
import { isErrorResponse, requireSession } from '@/lib/server/session'

export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ path: string[] }> }

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params
  const sub = path.join('/')

  if (sub === 'me') {
    try {
      const session = await requireSession(req)
      if (isErrorResponse(session)) return session

      const me = await getMe(session.token)
      if (!me) {
        return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 })
      }
      return NextResponse.json({
        status: true,
        user: me.user,
        ewentcast: me.account,
        ht_link_token: me.ht_link_token,
      })
    } catch (err) {
      console.error('[GET /api/auth/me]', err instanceof Error ? err.message : err)
      return NextResponse.json(
        { status: false, message: 'Service temporarily unavailable' },
        { status: 503 },
      )
    }
  }

  return NextResponse.json({ status: false, message: 'Not found' }, { status: 404 })
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const { path } = await ctx.params
    const sub = path.join('/')
    const body = await req.json().catch(() => ({})) as Record<string, unknown>

    if (sub === 'register') {
      const name = String(body.name || '')
      const email = String(body.email || '')
      const password = String(body.password || '')
      if (!name || !email || !password) {
        return NextResponse.json({ status: false, message: 'All fields are required' }, { status: 422 })
      }
      if (password.length < 8) {
        return NextResponse.json(
          { status: false, message: 'Password must be at least 8 characters' },
          { status: 422 },
        )
      }
      const result = await registerUser({ name, email, password })
      return NextResponse.json({
        status: true,
        token: result.token,
        user: result.user,
        ewentcast: result.account,
      })
    }

    if (sub === 'login') {
      const email = String(body.email || '')
      const password = String(body.password || '')
      if (!email || !password) {
        return NextResponse.json(
          { status: false, message: 'Email and password are required' },
          { status: 422 },
        )
      }
      const result = await loginUser(email, password)
      return NextResponse.json({
        status: true,
        token: result.token,
        user: result.user,
        ewentcast: result.account,
      })
    }

    if (sub === 'logout') {
      const session = await requireSession(req)
      if (isErrorResponse(session)) return session
      await deleteSession(session.token)
      return NextResponse.json({ status: true })
    }

    if (sub === 'forgot-password') {
      const email = String(body.email || '')
      if (!email) {
        return NextResponse.json({ status: false, message: 'Email is required' }, { status: 422 })
      }
      const result = await requestPasswordReset(email)
      return NextResponse.json({ status: true, ...result })
    }

    if (sub === 'reset-password') {
      const token = String(body.token || '')
      const password = String(body.password || '')
      if (!token || !password) {
        return NextResponse.json(
          { status: false, message: 'Token and password are required' },
          { status: 422 },
        )
      }
      await resetPassword(token, password)
      return NextResponse.json({ status: true, message: 'Password updated. You can sign in now.' })
    }

    if (sub === 'login-hightribe') {
      const email = String(body.email || '')
      const password = String(body.password || '')
      if (!email || !password) {
        return NextResponse.json(
          { status: false, message: 'Email and password are required' },
          { status: 422 },
        )
      }
      const result = await loginHightribeAccount(email, password)
      return NextResponse.json({
        status: true,
        token: result.token,
        user: result.user,
        ewentcast: result.account,
        ht_link_token: result.ht_link_token,
      })
    }

    if (sub === 'login-hightribe-token') {
      const headerAuth = req.headers.get('authorization') || ''
      const htToken =
        String(body.ht_token || '') ||
        (headerAuth.startsWith('Bearer ') ? headerAuth.slice(7) : '')
      if (!htToken) {
        return NextResponse.json(
          { status: false, message: 'HighTribe token is required' },
          { status: 422 },
        )
      }
      const result = await loginHightribeWithToken(htToken)
      return NextResponse.json({
        status: true,
        token: result.token,
        user: result.user,
        ewentcast: result.account,
        ht_link_token: result.ht_link_token,
      })
    }

    if (sub === 'connect-hightribe') {
      const session = await requireSession(req)
      if (isErrorResponse(session)) return session
      const email = String(body.email || '')
      const password = String(body.password || '')
      if (!email || !password) {
        return NextResponse.json(
          { status: false, message: 'Email and password are required' },
          { status: 422 },
        )
      }
      const result = await connectHightribeAccount(session.user.id, email, password)
      return NextResponse.json({
        status: true,
        message: 'HighTribe connected successfully.',
        ewentcast: result.account,
        ht_link_token: result.ht_link_token,
      })
    }

    if (sub === 'disconnect-hightribe') {
      const session = await requireSession(req)
      if (isErrorResponse(session)) return session
      const account = await disconnectHightribeAccount(session.user.id)
      return NextResponse.json({
        status: true,
        message: 'HighTribe disconnected.',
        ewentcast: account,
      })
    }

    return NextResponse.json({ status: false, message: 'Not found' }, { status: 404 })
  } catch (err) {
    const raw = err instanceof Error ? err.message : 'Request failed'
    const message = /ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|Too many connections/i.test(raw)
      ? 'Database connection failed. Please try again in a moment.'
      : raw
    if (message.includes('already exists')) {
      return NextResponse.json({ status: false, message }, { status: 422 })
    }
    if (message.includes('Invalid') || message.includes('Login failed') || message.includes('login failed')) {
      return NextResponse.json({ status: false, message }, { status: 401 })
    }
    if (message.includes('subscription')) {
      return NextResponse.json({ status: false, message }, { status: 402 })
    }
    if (message.includes('Token') || message.includes('Reset')) {
      return NextResponse.json({ status: false, message }, { status: 400 })
    }
    return NextResponse.json({ status: false, message }, { status: 500 })
  }
}
