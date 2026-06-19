import { NextRequest, NextResponse } from 'next/server'
import { handleBookingWebhook } from '@/lib/ticket-sync'

/** HighTribe event booking webhook (forward from HT backend or manual trigger) */
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json() as Record<string, unknown>
    const eventId = String(payload.event_id || payload.eventId || '')
    const email = String(payload.email || payload.guest_email || '')
    const name = String(payload.name || payload.guest_name || email.split('@')[0] || 'Guest')

    if (!eventId || !email) {
      return NextResponse.json({ ok: true, skipped: 'missing event_id or email' })
    }

    const { master, synced } = await handleBookingWebhook('hightribe', eventId, { email, name })
    return NextResponse.json({ ok: true, masterId: master?.id, synced })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
