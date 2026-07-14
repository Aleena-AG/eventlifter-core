import { NextRequest, NextResponse } from 'next/server'
import { proxyToBackend } from '@/lib/backend-client'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  return proxyToBackend(req, 'webhooks/eventbrite')
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    channel: 'eventbrite',
    method: 'POST',
    note: 'Handled by remote API',
  })
}
