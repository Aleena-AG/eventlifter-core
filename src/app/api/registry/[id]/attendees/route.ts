import { NextRequest } from 'next/server'
import { proxyToBackend } from '@/lib/backend-client'

export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ id: string }> }

async function forward(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params
  return proxyToBackend(req, `registry/${encodeURIComponent(id)}/attendees`)
}

/** GET /api/v1/registry/:id/attendees */
export async function GET(req: NextRequest, ctx: RouteContext) {
  return forward(req, ctx)
}

/** POST /api/v1/registry/:id/attendees — { email, name, source } */
export async function POST(req: NextRequest, ctx: RouteContext) {
  return forward(req, ctx)
}
