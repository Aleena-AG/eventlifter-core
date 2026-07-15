import { NextRequest } from 'next/server'
import { proxyToBackend } from '@/lib/backend-client'
import { isErrorResponse, requireSubscribedSession } from '@/lib/server/session'

export const runtime = 'nodejs'

/** Proxy to remote GET /api/v1/dashboard/stats (SSR / same-origin callers). */
export async function GET(req: NextRequest) {
  const session = await requireSubscribedSession(req)
  if (isErrorResponse(session)) return session

  return proxyToBackend(req, 'dashboard/stats')
}
