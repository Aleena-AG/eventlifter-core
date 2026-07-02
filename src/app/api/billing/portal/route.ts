import { NextRequest, NextResponse } from 'next/server'
import { getHtApiBase } from '@/lib/ht-api-base'
import { appUrlFromRequest } from '@/lib/app-url'
import { isErrorResponse, requireSession } from '@/lib/server/session'

export const runtime = 'nodejs'

const PORTAL_PATHS = ['ewentcast/billing-portal', 'ewentcast/portal'] as const

export async function POST(req: NextRequest) {
  const session = await requireSession(req)
  if (isErrorResponse(session)) {
    return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 })
  }

  const auth = req.headers.get('authorization') || ''
  const body = await req.json().catch(() => ({})) as { return_url?: string }
  const returnUrl = body.return_url || `${appUrlFromRequest(req)}/settings`

  let lastError = 'Billing portal unavailable'
  for (const path of PORTAL_PATHS) {
    try {
      const upstream = await fetch(`${getHtApiBase()}/${path}`, {
        method: 'POST',
        headers: {
          Authorization: auth,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ return_url: returnUrl }),
      })
      const data = await upstream.json().catch(() => ({})) as Record<string, unknown>
      const portalUrl = String(
        data.portal_url || data.url || data.billing_portal_url || '',
      ).trim()
      if (upstream.ok && portalUrl) {
        return NextResponse.json({ status: true, portal_url: portalUrl })
      }
      lastError = String(data.message || data.error || lastError)
    } catch (err) {
      lastError = err instanceof Error ? err.message : lastError
    }
  }

  return NextResponse.json({ status: false, message: lastError }, { status: 502 })
}
