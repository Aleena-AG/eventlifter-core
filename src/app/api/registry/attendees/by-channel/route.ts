import { NextRequest } from 'next/server'
import { proxyToBackend } from '@/lib/backend-client'

export const runtime = 'nodejs'

/** POST /api/v1/registry/attendees/by-channel */
export async function POST(req: NextRequest) {
  return proxyToBackend(req, 'registry/attendees/by-channel')
}
