import { NextRequest, NextResponse } from 'next/server'
import { syncAllChannels } from '@/lib/server/channel-sync'

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    const result = await syncAllChannels(authHeader)
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    method: 'POST',
    description: 'Pull latest data from connected channels into SQLite cache',
    headers: { Authorization: 'Bearer {HighTribe token} — required for HighTribe sync' },
  })
}
