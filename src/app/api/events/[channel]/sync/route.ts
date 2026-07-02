import { NextRequest, NextResponse } from 'next/server'
import { listChannelEvents, upsertChannelEvents } from '../../../../../../backend/src/services/events'
import { parseChannel } from '@/lib/server/channels'
import { isErrorResponse, requireSession } from '@/lib/server/session'

export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ channel: string }> }

export async function POST(req: NextRequest, ctx: RouteContext) {
  const session = await requireSession(req)
  if (isErrorResponse(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { channel: raw } = await ctx.params
  const channel = parseChannel(raw)
  if (!channel) return NextResponse.json({ error: 'invalid channel' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as { events?: Array<Record<string, unknown>> }
  if (!Array.isArray(body.events)) {
    return NextResponse.json({ error: 'events array required' }, { status: 400 })
  }

  try {
    const result = await upsertChannelEvents(channel, session.user.id, body.events)
    const events = await listChannelEvents(channel, session.user.id)
    return NextResponse.json({ ...result, events })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'sync failed' },
      { status: 500 },
    )
  }
}
