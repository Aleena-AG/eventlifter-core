import { NextRequest, NextResponse } from 'next/server'
import { deleteChannelEvent } from '@/lib/server/channel-events'
import { parseChannel } from '@/lib/server/channels'
import { isErrorResponse, requireSubscribedSession } from '@/lib/server/session'

export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ channel: string; externalId: string }> }

/** Remove a single stored event from our DB / local store (not the remote channel API). */
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const session = await requireSubscribedSession(req)
  if (isErrorResponse(session)) return session

  const { channel: raw, externalId } = await ctx.params
  const channel = parseChannel(raw)
  if (!channel) return NextResponse.json({ error: 'invalid channel' }, { status: 400 })
  if (!externalId?.trim()) return NextResponse.json({ error: 'missing event id' }, { status: 400 })

  try {
    const ok = await deleteChannelEvent(channel, session.user.id, externalId)
    return NextResponse.json({ ok })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'delete failed' },
      { status: 500 },
    )
  }
}
