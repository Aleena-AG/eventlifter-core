import { NextRequest, NextResponse } from 'next/server'
import { loadSettings } from '@/app/api/settings/route'
import { handleBookingWebhook } from '@/lib/ticket-sync'
import { saveWebhookLog } from '@/lib/server/webhook-log'

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
  const started = Date.now()
  const path = '/api/webhooks/hightribe'
  let payload: Record<string, unknown> = {}
  let statusCode = 500
  let outcome = 'error'
  let responseBody: Record<string, unknown> = {}
  let errorMessage: string | undefined

  try {
    const authError = verifyWebhookSecret(req)
    if (authError) {
      statusCode = 401
      outcome = 'unauthorized'
      responseBody = { ok: false, error: 'invalid webhook secret' }
      return authError
    }

    payload = await req.json() as Record<string, unknown>
    const eventId = String(payload.event_id || payload.eventId || '')
    const email = String(payload.email || payload.guest_email || '')
    const name = String(payload.name || payload.guest_name || email.split('@')[0] || 'Guest')
    const registeredAt = String(
      payload.registered_at || payload.registeredAt || payload.booking_date || '',
    ) || undefined

    if (!eventId || !email) {
      statusCode = 200
      outcome = 'skipped'
      responseBody = { ok: true, skipped: 'missing event_id or email' }
      return NextResponse.json(responseBody)
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
      statusCode = 200
      outcome = 'skipped'
      responseBody = {
        ok: true,
        skipped: 'event not in your synced events yet',
        eventId,
        hint: 'Sync events for this channel once so we can match the booking to your account.',
      }
      return NextResponse.json(responseBody)
    }

    if (!master) {
      statusCode = 200
      outcome = 'ok'
      responseBody = {
        ok: true,
        bookingSaved,
        eventId,
        attendee: { name, email, eventId },
      }
      return NextResponse.json(responseBody)
    }

    statusCode = 200
    outcome = 'ok'
    responseBody = {
      ok: true,
      masterId: master.id,
      synced,
      bookingSaved,
      attendee: { name, email, eventId },
    }
    return NextResponse.json(responseBody)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    errorMessage = msg
    statusCode = 500
    outcome = 'error'
    responseBody = { ok: false, error: msg }
    return NextResponse.json(responseBody, { status: 500 })
  } finally {
    void saveWebhookLog({
      channel: 'hightribe',
      path,
      statusCode,
      outcome,
      payload,
      headers: req.headers,
      response: responseBody,
      error: errorMessage,
      durationMs: Date.now() - started,
    })
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
