import { NextRequest, NextResponse } from 'next/server'
import { getBackendUrl } from '@/lib/backend-client'

export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ path: string[] }> }

async function proxy(req: NextRequest, pathSegments: string[]) {
  const subPath = pathSegments.join('/')
  const url = new URL(req.url)
  const target = `${getBackendUrl()}/api/auth/${subPath}${url.search}`

  const headers: Record<string, string> = { Accept: 'application/json' }
  const auth = req.headers.get('authorization')
  if (auth) headers.Authorization = auth

  const init: RequestInit = { method: req.method, headers, cache: 'no-store' }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    headers['Content-Type'] = 'application/json'
    init.body = await req.text()
  }

  const res = await fetch(target, init)
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    const { path } = await ctx.params
    return await proxy(req, path)
  } catch (err) {
    return NextResponse.json(
      { status: false, message: err instanceof Error ? err.message : 'Backend unavailable' },
      { status: 503 },
    )
  }
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const { path } = await ctx.params
    return await proxy(req, path)
  } catch (err) {
    return NextResponse.json(
      { status: false, message: err instanceof Error ? err.message : 'Backend unavailable' },
      { status: 503 },
    )
  }
}
