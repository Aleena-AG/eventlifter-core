import { NextRequest, NextResponse } from 'next/server'
import {
  listChannelEvents,
} from '../../../../../backend/src/services/events'
import { purgeChannelData } from '../../../../../backend/src/services/channel-data'
import { parseChannel } from '@/lib/server/channels'
import { isErrorResponse, requireSession } from '@/lib/server/session'

export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ channel: string }> }

export async function GET(req: NextRequest, ctx: RouteContext) {
  const session = await requireSession(req)
  if (isErrorResponse(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { channel: raw } = await ctx.params
  const channel = parseChannel(raw)
  if (!channel) return NextResponse.json({ error: 'invalid channel' }, { status: 400 })

  try {
    const events = await listChannelEvents(channel, session.user.id)
    return NextResponse.json({ events })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'list failed' },
      { status: 500 },
    )
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const session = await requireSession(req)
  if (isErrorResponse(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { channel: raw } = await ctx.params
  const channel = parseChannel(raw)
  if (!channel) return NextResponse.json({ error: 'invalid channel' }, { status: 400 })

  try {
    const result = await purgeChannelData(session.user.id, channel)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'purge failed' },
      { status: 500 },
    )
  }
}
