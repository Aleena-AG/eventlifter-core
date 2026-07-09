import { NextRequest, NextResponse } from 'next/server'
import { loadSettings } from '@/app/api/settings/route'
import { handleBookingWebhook } from '@/lib/ticket-sync'

function verifyWebhookSecret(req: NextRequest): NextResponse | null {
  const secret = loadSettings().hightribe.webhookSecret?.trim()
  if (!secret) return null

  const header =
    req.headers.get('x-webhook-secret')
    || req.headers.get('x-channel-manager-secret')
    || ''

  if (header !== secret) {
    return NextResponse.json({ ok: false, error: 'invalid webhook secret' }, { status: 401 })
  }

  return null
}

/** Hightribe event booking webhook — called from Hightribe Laravel backend on approval */
export async function POST(req: NextRequest) {
  try {
    const authError = verifyWebhookSecret(req)
    if (authError) return authError

    const payload = await req.json() as Record<string, unknown>
    const eventId = String(payload.event_id || payload.eventId || '')
    const email = String(payload.email || payload.guest_email || '')
    const name = String(payload.name || payload.guest_name || email.split('@')[0] || 'Guest')
    const registeredAt = String(
      payload.registered_at || payload.registeredAt || payload.booking_date || '',
    ) || undefined

    if (!eventId || !email) {
      return NextResponse.json({ ok: true, skipped: 'missing event_id or email' })
    }

    const { master, synced, bookingSaved } = await handleBookingWebhook('hightribe', eventId, {
      email,
      name,
      registeredAt,
      externalId: payload.booking_id || payload.id
        ? String(payload.booking_id || payload.id)
        : undefined,
    })

    if (!master && !bookingSaved) {
      return NextResponse.json({
        ok: true,
        skipped: 'event not in your synced events yet',
        eventId,
        hint: 'Sync events for this channel once so we can match the booking to your account.',
      })
    }

    if (!master) {
      return NextResponse.json({
        ok: true,
        bookingSaved,
        eventId,
        attendee: { name, email, eventId },
      })
    }

    return NextResponse.json({
      ok: true,
      masterId: master.id,
      synced,
      bookingSaved,
      attendee: { name, email, eventId },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    channel: 'hightribe',
    method: 'POST',
    expected: {
      event_id: 'Hightribe event ID',
      email: 'guest email',
      name: 'guest name (optional)',
      registered_at: 'ISO timestamp (optional)',
    },
    headers: {
      'X-Webhook-Secret': 'required when Hightribe.webhookSecret is set in settings.json',
    },
  })
}
