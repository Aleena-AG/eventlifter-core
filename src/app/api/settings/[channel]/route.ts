import { NextRequest, NextResponse } from 'next/server'
import { clearChannelSettings, toPublicSettingsView } from '../../../../../backend/src/services/user-settings'
import { isErrorResponse, requireSession } from '@/lib/server/session'

export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ channel: string }> }

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const session = await requireSession(req)
  if (isErrorResponse(session)) return session

  const { channel } = await ctx.params
  if (channel !== 'luma' && channel !== 'eventbrite' && channel !== 'hightribe') {
    return NextResponse.json({ error: 'invalid channel' }, { status: 400 })
  }

  try {
    const updated = await clearChannelSettings(session.user.id, channel)
    return NextResponse.json({ ok: true, settings: toPublicSettingsView(updated) })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'clear failed' },
      { status: 500 },
    )
  }
}
