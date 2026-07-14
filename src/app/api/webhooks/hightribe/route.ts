import { NextRequest } from 'next/server'
import { proxyToBackend } from '@/lib/backend-client'

export const runtime = 'nodejs'

/** Forward provider webhooks to the remote Ewentcast API. */
export async function POST(req: NextRequest) {
  return proxyToBackend(req, 'webhooks/hightribe')
}

/** Contract docs / handshake — owned by remote API. */
export async function GET(req: NextRequest) {
  return proxyToBackend(req, 'webhooks/hightribe')
}
