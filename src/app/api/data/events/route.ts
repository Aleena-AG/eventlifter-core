import { NextRequest, NextResponse } from 'next/server'
import { listChannelEvents } from '@/lib/db/events-store'
import { getSyncMeta } from '@/lib/db/index'
import type { ChannelKey } from '@/lib/types'

export async function GET(req: NextRequest) {
  const channel = req.nextUrl.searchParams.get('channel') as ChannelKey | null
  if (!channel || !['hightribe', 'luma', 'eventbrite'].includes(channel)) {
    return NextResponse.json({ error: 'channel required' }, { status: 400 })
  }

  return NextResponse.json({
    events: listChannelEvents(channel, 200),
    lastSyncedAt: getSyncMeta('last_sync_at'),
  })
}
