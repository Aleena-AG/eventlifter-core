import { NextRequest } from 'next/server'
import { proxyToBackend } from '@/lib/backend-client'

export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ id: string }> }

/** POST /api/v1/registry/:id/channels — link one channel event. */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params
  return proxyToBackend(req, `registry/${encodeURIComponent(id)}/channels`)
}
