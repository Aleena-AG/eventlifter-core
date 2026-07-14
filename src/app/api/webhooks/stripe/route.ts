import { NextRequest, NextResponse } from 'next/server'
import { proxyToBackend } from '@/lib/backend-client'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const res = await proxyToBackend(req, 'webhooks/stripe')
  if (res.status !== 404) return res
  return NextResponse.json(
    { error: 'Stripe webhooks must be configured on the remote API.' },
    { status: 503 },
  )
}
