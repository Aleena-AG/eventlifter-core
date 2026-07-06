import { NextRequest, NextResponse } from 'next/server'
import { handleStripeWebhook } from '@/lib/server/stripe-billing'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const signature = req.headers.get('stripe-signature')
  const rawBody = await req.text()

  try {
    await handleStripeWebhook(rawBody, signature)
    return NextResponse.json({ received: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
