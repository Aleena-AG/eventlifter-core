import { NextRequest, NextResponse } from 'next/server'
import { loadSettings } from '@/app/api/settings/route'
import { proxyLumaPath } from '@/lib/luma-api'

const EB_BASE = 'https://www.eventbriteapi.com/v3'

function webhookBase(req: NextRequest): string {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000'
  const proto = req.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

/** Register webhooks on Luma + Eventbrite for ticket sync */
export async function POST(req: NextRequest) {
  const base = webhookBase(req)
  const settings = loadSettings()
  const results: Record<string, unknown> = {}

  // ── Luma ──────────────────────────────────────────────────────────────────
  if (settings.luma.apiKey) {
    try {
      const url = `${base}/api/webhooks/luma`
      const { data } = await proxyLumaPath(['webhooks'], 'POST', {}, {
        url,
        events: ['guest.registered', 'guest.updated'],
      })
      results.luma = { ok: true, data }
    } catch (e) {
      results.luma = { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  } else {
    results.luma = { ok: false, error: 'Luma API key not configured' }
  }

  // ── Eventbrite ──────────────────────────────────────────────────────────────
  if (settings.eventbrite.privateToken) {
    try {
      const orgRes = await fetch(`${EB_BASE}/users/me/organizations/`, {
        headers: { Authorization: `Bearer ${settings.eventbrite.privateToken}` },
      })
      const orgData = await orgRes.json() as { organizations?: Array<{ id: string }> }
      const orgId = orgData.organizations?.[0]?.id
      if (!orgId) throw new Error('No Eventbrite organization found')

      const webhookUrl = `${base}/api/webhooks/eventbrite`
      const whRes = await fetch(`${EB_BASE}/organizations/${orgId}/webhooks/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.eventbrite.privateToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          endpoint_url: webhookUrl,
          actions: 'order.placed,attendee.updated',
          event_id: null,
        }),
      })
      const whData = await whRes.json()
      results.eventbrite = { ok: whRes.ok, data: whData, url: webhookUrl }
    } catch (e) {
      results.eventbrite = { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  } else {
    results.eventbrite = { ok: false, error: 'Eventbrite token not configured' }
  }

  // ── HighTribe ───────────────────────────────────────────────────────────────
  results.hightribe = {
    ok: true,
    url: `${base}/api/webhooks/hightribe`,
    note: 'Configure this URL in HighTribe backend booking notifications or call manually after each booking.',
  }

  return NextResponse.json({ ok: true, webhooks: results, base })
}

export async function GET(req: NextRequest) {
  const base = webhookBase(req)
  return NextResponse.json({
    endpoints: {
      luma: `${base}/api/webhooks/luma`,
      eventbrite: `${base}/api/webhooks/eventbrite`,
      hightribe: `${base}/api/webhooks/hightribe`,
    },
    setup: 'POST /api/webhooks/setup to register on Luma + Eventbrite',
  })
}
