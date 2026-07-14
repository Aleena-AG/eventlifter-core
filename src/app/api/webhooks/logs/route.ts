import { NextRequest, NextResponse } from 'next/server'
import { proxyToBackend } from '@/lib/backend-client'
import { isValidWebhookLogToken } from '@/lib/server/webhook-log'

export const runtime = 'nodejs'

/**
 * GET /api/webhooks/logs — token auth via:
 * - ?token= / ?WEBHOOK_LOG_TOKEN=
 * - header WEBHOOK_LOG_TOKEN / X-Webhook-Log-Token
 * - Authorization: Bearer <WEBHOOK_LOG_TOKEN>
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const token =
    url.searchParams.get('token') ||
    url.searchParams.get('WEBHOOK_LOG_TOKEN') ||
    req.headers.get('webhook_log_token') ||
    req.headers.get('x-webhook-log-token') ||
    (req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ?? '')

  if (!isValidWebhookLogToken(token)) {
    return NextResponse.json(
      { success: false, message: 'invalid or missing WEBHOOK_LOG_TOKEN' },
      { status: 401 },
    )
  }

  // Forward token to remote in a form it accepts
  const headers = new Headers(req.headers)
  headers.set('WEBHOOK_LOG_TOKEN', token)
  if (!headers.get('authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  const forwarded = new Request(req.url, { method: 'GET', headers })
  return proxyToBackend(forwarded, 'webhooks/logs')
}
