import { NextRequest, NextResponse } from 'next/server'
import { loadSettings } from '@/app/api/settings/route'
import { handleBookingWebhook } from '@/lib/ticket-sync'

const EB_BASE = 'https://www.eventbriteapi.com/v3'

/** Eventbrite order / attendee webhook */
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json() as Record<string, unknown>
    const apiUrl = String(payload.api_url || '')
    const config = payload.config as Record<string, unknown> | undefined
    const action = String(config?.action || payload.action || '')

    // Eventbrite webhook verification ping
    if (action === 'test') {
      return NextResponse.json({ ok: true, message: 'webhook test received' })
    }

    let eventId = ''
    let email = ''
    let name = ''

    if (apiUrl.includes('/orders/')) {
      const token = loadSettings().eventbrite.privateToken
      const orderRes = await fetch(apiUrl, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null)
      if (orderRes?.ok) {
        const order = await orderRes.json() as Record<string, unknown>
        eventId = String((order.event_id as string) || '')
      }
    }

    const attendee = payload.attendee as Record<string, unknown> | undefined
    if (attendee) {
      eventId = eventId || String(attendee.event_id || '')
      const profile = attendee.profile as Record<string, unknown> | undefined
      email = String(profile?.email || '')
      name = String(profile?.name || '')
    }

    if (!eventId) {
      const match = apiUrl.match(/events\/(\d+)/)
      if (match) eventId = match[1]
    }

    if (!eventId || !email) {
      return NextResponse.json({ ok: true, skipped: 'could not parse eventbrite payload', action })
    }

    const { master, synced, bookingSaved } = await handleBookingWebhook('eventbrite', eventId, {
      email,
      name,
      externalId: attendee?.id ? String(attendee.id) : undefined,
    })
    return NextResponse.json({ ok: true, masterId: master?.id, synced, bookingSaved })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
