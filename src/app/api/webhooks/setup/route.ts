import { NextRequest, NextResponse } from 'next/server'
import { loadSettings } from '@/app/api/settings/route'
import { proxyLumaPath } from '@/lib/luma-api'
import { getAppUrl } from '@/lib/app-url'

const EB_BASE = 'https://www.eventbriteapi.com/v3'

function webhookBase(req: NextRequest): string {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host')
  if (host) {
    const proto = req.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https')
    return `${proto}://${host}`
  }
  return getAppUrl()
}

async function readJsonSafe(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  if (!text.trim()) return {}
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return { raw: text.slice(0, 500) }
  }
}

/** Register webhooks on Luma + Eventbrite for ticket sync */
export async function POST(req: NextRequest) {
  try {
    const base = webhookBase(req)
    const settings = loadSettings()
    const results: Record<string, unknown> = {}

    // ── Luma ────────────────────────────────────────────────────────────────
    if (settings.luma.apiKey) {
      try {
        const url = `${base}/api/webhooks/luma`
        const { data } = await proxyLumaPath(['webhooks'], 'POST', {}, {
          url,
          events: ['guest.registered', 'guest.updated'],
        }, settings)
        results.luma = { ok: true, data }
      } catch (e) {
        results.luma = { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    } else {
      results.luma = { ok: false, error: 'Luma API key not configured' }
    }

    // ── Eventbrite ──────────────────────────────────────────────────────────
    if (settings.eventbrite.privateToken) {
      try {
        const orgRes = await fetch(`${EB_BASE}/users/me/organizations/`, {
          headers: { Authorization: `Bearer ${settings.eventbrite.privateToken}` },
        })
        const orgData = await readJsonSafe(orgRes)
        if (!orgRes.ok) {
          throw new Error(String(orgData.error_description || orgData.error || `HTTP ${orgRes.status}`))
        }
        const orgId = (orgData.organizations as Array<{ id: string }> | undefined)?.[0]?.id
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
          }),
        })
        const whData = await readJsonSafe(whRes)
        results.eventbrite = {
          ok: whRes.ok,
          data: whData,
          url: webhookUrl,
          error: whRes.ok ? undefined : String(whData.error_description || whData.error || `HTTP ${whRes.status}`),
        }
      } catch (e) {
        results.eventbrite = { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    } else {
      results.eventbrite = { ok: false, error: 'Eventbrite token not configured' }
    }

    // ── Hightribe ─────────────────────────────────────────────────────────────
    const htUrl = `${base}/api/webhooks/hightribe`
    const htSecret = settings.hightribe.webhookSecret || ''
    results.hightribe = {
      ok: true,
      url: htUrl,
      laravelEnv: {
        CHANNEL_MANAGER_WEBHOOK_URL: htUrl,
        CHANNEL_MANAGER_WEBHOOK_SECRET: htSecret || '<generate-a-secret-and-set-in-both-apps>',
      },
      note: htSecret
        ? 'Add CHANNEL_MANAGER_WEBHOOK_URL and CHANNEL_MANAGER_WEBHOOK_SECRET to Hightribe Laravel .env, then php artisan config:clear.'
        : 'Set Hightribe webhook secret in Settings first, then add both env vars to Hightribe Laravel .env.',
    }

    return NextResponse.json({ ok: true, webhooks: results, base })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Webhook setup failed'
    console.error('[webhooks/setup POST]', msg, e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const base = webhookBase(req)
    let htSecret = ''
    try {
      htSecret = loadSettings().hightribe.webhookSecret || ''
    } catch {
      // settings unavailable — still return endpoint URLs
    }

    return NextResponse.json({
      endpoints: {
        luma: `${base}/api/webhooks/luma`,
        eventbrite: `${base}/api/webhooks/eventbrite`,
        hightribe: `${base}/api/webhooks/hightribe`,
      },
      setup: 'POST /api/webhooks/setup to register on Luma + Eventbrite. hightribe: set env vars on Laravel backend.',
      HightribeLaravelEnv: [
        `CHANNEL_MANAGER_WEBHOOK_URL=${base}/api/webhooks/hightribe`,
        `CHANNEL_MANAGER_WEBHOOK_SECRET=${htSecret || '<same-as-settings-Hightribe-webhookSecret>'}`,
      ],
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load webhook setup info'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
