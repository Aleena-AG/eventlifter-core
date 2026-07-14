import { NextRequest, NextResponse } from 'next/server'
import { proxyToBackend } from '@/lib/backend-client'

export const runtime = 'nodejs'

/** Forward provider webhooks to the remote Ewentcast API. */
export async function POST(req: NextRequest) {
  return proxyToBackend(req, 'webhooks/luma')
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    channel: 'luma',
    method: 'POST',
    note: 'Handled by remote API',
  })
}
