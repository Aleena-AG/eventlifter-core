import { NextRequest, NextResponse } from 'next/server'
import { handleBookingWebhook } from '@/lib/ticket-sync'

/** Luma guest registration webhook */
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json() as Record<string, unknown>
    const event = payload.event as Record<string, unknown> | undefined
    const guest = payload.guest as Record<string, unknown> | undefined
    const data = payload.data as Record<string, unknown> | undefined

    const eventId = String(
      event?.api_id || data?.event_api_id || payload.event_api_id || '',
    )
    const email = String(guest?.email || data?.email || payload.email || '')
    const name = String(guest?.name || data?.name || payload.name || email.split('@')[0] || 'Guest')

    if (!eventId || !email) {
      return NextResponse.json({ ok: true, skipped: 'missing event or email' })
    }

    const { master, synced } = await handleBookingWebhook('luma', eventId, { email, name })
    return NextResponse.json({ ok: true, masterId: master?.id, synced })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
