import { NextRequest, NextResponse } from 'next/server'
import { handleBookingWebhook } from '@/lib/ticket-sync'
import { saveWebhookLog } from '@/lib/server/webhook-log'

type ParsedLumaWebhook = {
  webhookType: string
  eventId: string
  email: string
  name: string
  isEventWebhook: boolean
}

/** Parse Luma v1/v2 webhook bodies (guest.registered, event.updated, etc.). */
function parseLumaWebhook(payload: Record<string, unknown>): ParsedLumaWebhook {
  const webhookType = String(payload.type || payload.action || '').trim()
  const data = (payload.data && typeof payload.data === 'object'
    ? payload.data
    : {}) as Record<string, unknown>
  const guest = (payload.guest && typeof payload.guest === 'object'
    ? payload.guest
    : data.guest && typeof data.guest === 'object'
      ? data.guest
      : {}) as Record<string, unknown>
  const event = (payload.event && typeof payload.event === 'object'
    ? payload.event
    : {}) as Record<string, unknown>

  const dataId = String(data.id || data.api_id || '').trim()
  const isEventWebhook = /^event\./i.test(webhookType)
    || (!/guest/i.test(webhookType) && dataId.startsWith('evt-') && !!(data.name || data.url))

  let eventId = String(
    guest.event_id || guest.event_api_id
    || data.event_id || data.event_api_id
    || event.id || event.api_id
    || payload.event_api_id || payload.event_id || '',
  ).trim()

  if (!eventId && isEventWebhook) {
    eventId = dataId
  }

  const email = String(
    guest.user_email || guest.email
    || data.user_email || data.email
    || payload.email || '',
  ).trim()

  const name = String(
    guest.user_name || guest.name
    || data.user_name || data.name
    || payload.name || email.split('@')[0] || 'Guest',
  ).trim() || 'Guest'

  return { webhookType, eventId, email, name, isEventWebhook }
}

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
    const parsed = parseLumaWebhook(payload)

    if (parsed.isEventWebhook) {
      statusCode = 200
      outcome = 'skipped'
      responseBody = {
        ok: true,
        skipped: 'event webhook (no guest registration)',
        webhookType: parsed.webhookType || undefined,
        eventId: parsed.eventId || undefined,
      }
      return NextResponse.json(responseBody)
    }

    if (!parsed.eventId || !parsed.email) {
      statusCode = 200
      outcome = 'skipped'
      responseBody = {
        ok: true,
        skipped: 'missing event or email',
        webhookType: parsed.webhookType || undefined,
      }
      return NextResponse.json(responseBody)
    }

    const { master, synced, bookingSaved } = await handleBookingWebhook(
      'luma',
      parsed.eventId,
      { email: parsed.email, name: parsed.name },
    )
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
