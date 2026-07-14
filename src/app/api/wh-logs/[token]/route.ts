import { NextRequest, NextResponse } from 'next/server'
import { isValidWebhookLogToken, listWebhookLogs } from '@/lib/server/webhook-log'

export const runtime = 'nodejs'

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params
  if (!isValidWebhookLogToken(token)) {
    return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
  }

  const limit = Number(req.nextUrl.searchParams.get('limit') || 150)
  const logs = await listWebhookLogs(limit, token)
  return NextResponse.json({ ok: true, logs })
}
