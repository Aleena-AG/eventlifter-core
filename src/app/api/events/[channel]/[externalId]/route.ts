import { NextRequest, NextResponse } from 'next/server'
import { proxyToBackend } from '@/lib/backend-client'
import { parseChannel } from '@/lib/server/channels'
import { isErrorResponse, requireSubscribedSession } from '@/lib/server/session'

export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ channel: string; externalId: string }> }

export async function GET(req: NextRequest, ctx: RouteContext) {
  const session = await requireSubscribedSession(req)
  if (isErrorResponse(session)) return session

  const { channel: raw, externalId } = await ctx.params
  const channel = parseChannel(raw)
  if (!channel) return NextResponse.json({ error: 'invalid channel' }, { status: 400 })
  if (!externalId?.trim()) return NextResponse.json({ error: 'missing event id' }, { status: 400 })

  return proxyToBackend(req, `events/${channel}/${encodeURIComponent(externalId)}`)
}

/** Remove a single stored event from the remote API (not the channel provider). */
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const session = await requireSubscribedSession(req)
  if (isErrorResponse(session)) return session

  const { channel: raw, externalId } = await ctx.params
  const channel = parseChannel(raw)
  if (!channel) return NextResponse.json({ error: 'invalid channel' }, { status: 400 })
  if (!externalId?.trim()) return NextResponse.json({ error: 'missing event id' }, { status: 400 })

  return proxyToBackend(req, `events/${channel}/${encodeURIComponent(externalId)}`)
}
