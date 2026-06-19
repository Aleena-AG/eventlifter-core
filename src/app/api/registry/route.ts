import { NextRequest, NextResponse } from 'next/server'
import {
  listMasterEvents, getMasterEvent, createMasterEvent, linkChannelEvent,
  findMasterByChannelEvent, deleteMasterEvent, removeChannelFromMaster,
} from '@/lib/event-registry'
import type { ChannelKey } from '@/lib/types'

export async function GET(req: NextRequest) {
  const channel = req.nextUrl.searchParams.get('channel') as ChannelKey | null
  const eventId = req.nextUrl.searchParams.get('eventId')

  if (channel && eventId) {
    const master = findMasterByChannelEvent(channel, eventId)
    if (!master) {
      return NextResponse.json({ master: null, links: {} })
    }
    const links: Partial<Record<ChannelKey, { eventId: string; url?: string }>> = {}
    for (const ch of ['hightribe', 'luma', 'eventbrite'] as ChannelKey[]) {
      const ref = master.channels[ch]
      if (ref?.eventId) links[ch] = { eventId: ref.eventId, url: ref.url }
    }
    return NextResponse.json({ master: { id: master.id, title: master.title }, links })
  }

  return NextResponse.json({ events: listMasterEvents() })
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    action?: string
    masterId?: string
    title?: string
    capacity?: number
    channel?: ChannelKey
    ref?: { eventId: string; ticketId?: string; url?: string }
  }

  if (body.action === 'create') {
    const master = createMasterEvent({
      title: body.title || 'Untitled',
      capacity: body.capacity || 150,
    })
    return NextResponse.json(master)
  }

  if (body.action === 'link' && body.masterId && body.channel && body.ref) {
    const master = linkChannelEvent(body.masterId, body.channel, body.ref)
    if (!master) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json(master)
  }

  if (body.masterId) {
    const master = getMasterEvent(body.masterId)
    if (!master) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json(master)
  }

  if (body.action === 'unlink' && body.masterId && body.channel) {
    const master = removeChannelFromMaster(body.masterId, body.channel)
    return NextResponse.json({ ok: true, master })
  }

  if (body.action === 'delete' && body.masterId) {
    deleteMasterEvent(body.masterId)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'invalid request' }, { status: 400 })
}
