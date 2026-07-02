import { NextRequest, NextResponse } from 'next/server'
import type { ChannelKey } from '@/lib/types'
import {
  createMasterEvent,
  deleteMasterEvent,
  findMasterByChannelEvent,
  getMasterEvent,
  linkChannelEvent,
  listMasterEvents,
  registerAttendee,
  removeChannelFromMaster,
} from '../../../../backend/src/services/registry'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const channel = req.nextUrl.searchParams.get('channel') as ChannelKey | null
    const eventId = req.nextUrl.searchParams.get('eventId')

    if (channel && eventId) {
      const master = await findMasterByChannelEvent(channel, eventId)
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

    const events = await listMasterEvents()
    return NextResponse.json({ events })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'registry list failed' },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      action?: string
      masterId?: string
      title?: string
      capacity?: number
      channel?: ChannelKey
      ref?: { eventId: string; ticketId?: string; url?: string }
      attendee?: { email: string; name: string; source: ChannelKey; registeredAt?: string }
    }

    if (body.action === 'create') {
      const master = await createMasterEvent({
        title: body.title || 'Untitled',
        capacity: body.capacity || 150,
      })
      return NextResponse.json(master)
    }

    if (body.action === 'link' && body.masterId && body.channel && body.ref) {
      const master = await linkChannelEvent(body.masterId, body.channel, body.ref)
      if (!master) return NextResponse.json({ error: 'not found' }, { status: 404 })
      return NextResponse.json(master)
    }

    if (body.action === 'register_attendee' && body.masterId && body.attendee) {
      const master = await registerAttendee(body.masterId, body.attendee)
      if (!master) return NextResponse.json({ error: 'not found' }, { status: 404 })
      return NextResponse.json(master)
    }

    if (body.masterId) {
      const master = await getMasterEvent(body.masterId)
      if (!master) return NextResponse.json({ error: 'not found' }, { status: 404 })
      return NextResponse.json(master)
    }

    if (body.action === 'unlink' && body.masterId && body.channel) {
      const master = await removeChannelFromMaster(body.masterId, body.channel)
      return NextResponse.json({ ok: true, master })
    }

    if (body.action === 'delete' && body.masterId) {
      await deleteMasterEvent(body.masterId)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'invalid request' }, { status: 400 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'registry write failed' },
      { status: 500 },
    )
  }
}
