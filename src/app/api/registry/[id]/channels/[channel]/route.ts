import { NextRequest } from 'next/server'
import { proxyToBackend } from '@/lib/backend-client'

export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ id: string; channel: string }> }

/** DELETE /api/v1/registry/:id/channels/:channel — unlink channel. */
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const { id, channel } = await ctx.params
  return proxyToBackend(
    req,
    `registry/${encodeURIComponent(id)}/channels/${encodeURIComponent(channel)}`,
  )
}
