import { NextRequest, NextResponse } from 'next/server'
import { loadSettings } from '@/app/api/settings/route'
import { handleBookingWebhook } from '@/lib/ticket-sync'
import { saveWebhookLog } from '@/lib/server/webhook-log'

const EB_BASE = 'https://www.eventbriteapi.com/v3'

/** Eventbrite order / attendee webhook */
export async function POST(req: NextRequest) {
  const started = Date.now()
  const path = '/api/webhooks/eventbrite'
  let payload: Record<string, unknown> = {}
  let statusCode = 500
  let outcome = 'error'
  let responseBody: Record<string, unknown> = {}
  let errorMessage: string | undefined

  try {
    payload = await req.json() as Record<string, unknown>
    const apiUrl = String(payload.api_url || '')
    const config = payload.config as Record<string, unknown> | undefined
    const action = String(config?.action || payload.action || '')

    if (action === 'test') {
      statusCode = 200
      outcome = 'test'
      responseBody = { ok: true, message: 'webhook test received' }
      return NextResponse.json(responseBody)
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
      statusCode = 200
      outcome = 'skipped'
      responseBody = { ok: true, skipped: 'could not parse eventbrite payload', action }
      return NextResponse.json(responseBody)
    }

    const { master, synced, bookingSaved } = await handleBookingWebhook('eventbrite', eventId, {
      email,
      name,
      externalId: attendee?.id ? String(attendee.id) : undefined,
    })
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
      channel: 'eventbrite',
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
