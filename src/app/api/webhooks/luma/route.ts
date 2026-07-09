import { NextRequest, NextResponse } from 'next/server'
import { handleBookingWebhook } from '@/lib/ticket-sync'
import { saveWebhookLog } from '@/lib/server/webhook-log'

/** Luma guest registration webhook */
export async function POST(req: NextRequest) {
  const started = Date.now()
  const path = '/api/webhooks/luma'
  let payload: Record<string, unknown> = {}
  let statusCode = 500
  let outcome = 'error'
  let responseBody: Record<string, unknown> = {}
  let errorMessage: string | undefined

  try {
    payload = await req.json() as Record<string, unknown>
    const event = payload.event as Record<string, unknown> | undefined
    const guest = payload.guest as Record<string, unknown> | undefined
    const data = payload.data as Record<string, unknown> | undefined

    const eventId = String(
      event?.api_id || data?.event_api_id || payload.event_api_id || '',
    )
    const email = String(guest?.email || data?.email || payload.email || '')
    const name = String(guest?.name || data?.name || payload.name || email.split('@')[0] || 'Guest')

    if (!eventId || !email) {
      statusCode = 200
      outcome = 'skipped'
      responseBody = { ok: true, skipped: 'missing event or email' }
      return NextResponse.json(responseBody)
    }

    const { master, synced, bookingSaved } = await handleBookingWebhook('luma', eventId, { email, name })
    statusCode = 200
    outcome = 'ok'
    responseBody = { ok: true, masterId: master?.id, synced, bookingSaved }
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
      channel: 'luma',
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
