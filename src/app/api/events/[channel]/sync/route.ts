import { NextRequest, NextResponse } from 'next/server'
import { proxyToBackend } from '@/lib/backend-client'
import { parseChannel } from '@/lib/server/channels'
import { isErrorResponse, requireSubscribedSession } from '@/lib/server/session'

export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ channel: string }> }

export async function POST(req: NextRequest, ctx: RouteContext) {
  const session = await requireSubscribedSession(req)
  if (isErrorResponse(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { channel: raw } = await ctx.params
  const channel = parseChannel(raw)
  if (!channel) return NextResponse.json({ error: 'invalid channel' }, { status: 400 })

  return proxyToBackend(req, `events/${channel}/sync`)
}
