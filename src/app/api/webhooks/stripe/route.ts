import { NextRequest, NextResponse } from 'next/server'
import { handleStripeWebhook } from '@/lib/server/stripe-billing'
import { saveWebhookLog } from '@/lib/server/webhook-log'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const started = Date.now()
  const path = '/api/webhooks/stripe'
  const signature = req.headers.get('stripe-signature')
  const rawBody = await req.text()
  let payload: unknown = rawBody
  let statusCode = 400
  let outcome = 'error'
  let responseBody: Record<string, unknown> = {}
  let errorMessage: string | undefined

  try {
    if (rawBody.trim().startsWith('{')) {
      try {
        payload = JSON.parse(rawBody) as unknown
      } catch {
        payload = { raw: rawBody.slice(0, 4000) }
      }
    } else {
      payload = { raw: rawBody.slice(0, 4000) }
    }

    await handleStripeWebhook(rawBody, signature)
    statusCode = 200
    outcome = 'ok'
    responseBody = { received: true }
    return NextResponse.json(responseBody)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook failed'
    errorMessage = message
    statusCode = 400
    outcome = 'error'
    responseBody = { error: message }
    return NextResponse.json(responseBody, { status: 400 })
  } finally {
    void saveWebhookLog({
      channel: 'stripe',
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
