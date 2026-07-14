import { NextRequest } from 'next/server'
import { proxyToBackend } from '@/lib/backend-client'
import { assertEwentcastSubscription, isErrorResponse, requireSession } from '@/lib/server/session'

export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ channel: string }> }

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const session = await requireSession(req)
  if (isErrorResponse(session)) return session

  const denied = await assertEwentcastSubscription(
    session.user.id,
    req.headers.get('authorization'),
  )
  if (denied) return denied

  const { channel } = await ctx.params
  return proxyToBackend(req, `settings/${encodeURIComponent(channel)}`)
}
