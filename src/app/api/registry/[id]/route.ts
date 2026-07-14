import { NextRequest } from 'next/server'
import { proxyToBackend } from '@/lib/backend-client'

export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ id: string }> }

async function forward(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params
  return proxyToBackend(req, `registry/${encodeURIComponent(id)}`)
}

/** GET /api/v1/registry/:id */
export async function GET(req: NextRequest, ctx: RouteContext) {
  return forward(req, ctx)
}

/** PUT /api/v1/registry/:id — same as PATCH (edit master) */
export async function PUT(req: NextRequest, ctx: RouteContext) {
  return forward(req, ctx)
}

/** PATCH /api/v1/registry/:id — { title?, capacity?, channelRefs? } */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  return forward(req, ctx)
}

/** DELETE /api/v1/registry/:id */
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  return forward(req, ctx)
}
