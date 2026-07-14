import { NextRequest } from 'next/server'
import { proxyToBackend } from '@/lib/backend-client'

export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ path: string[] }> }

/**
 * Public /api/v1/* surface — transparent proxy to the remote Ewentcast API.
 * Covers health, auth, users, registry, events, settings, and webhooks.
 */
async function forward(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params
  const sub = path.join('/')
  return proxyToBackend(req, sub)
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  return forward(req, ctx)
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  return forward(req, ctx)
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  return forward(req, ctx)
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  return forward(req, ctx)
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  return forward(req, ctx)
}
