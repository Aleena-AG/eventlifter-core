import { NextRequest } from 'next/server'
import { proxyToBackend } from '@/lib/backend-client'
import { isErrorResponse, requireSubscribedSession } from '@/lib/server/session'

export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ channel: string }> }

export async function GET(req: NextRequest, ctx: RouteContext) {
  const session = await requireSubscribedSession(req)
  if (isErrorResponse(session)) return session

  const { channel } = await ctx.params
  return proxyToBackend(req, `events/${encodeURIComponent(channel)}`)
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const session = await requireSubscribedSession(req)
  if (isErrorResponse(session)) return session

  const { channel } = await ctx.params
  return proxyToBackend(req, `events/${encodeURIComponent(channel)}`)
}
