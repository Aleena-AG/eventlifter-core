import { NextRequest, NextResponse } from 'next/server'
import { resolveAppSettings } from '@/lib/channel-settings-server'
import { LumaApiError, proxyLumaPath } from '@/lib/luma-api'

async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params
  const query: Record<string, string> = {}
  req.nextUrl.searchParams.forEach((v, k) => { query[k] = v })

  let body: unknown
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      const text = await req.text()
      body = text ? JSON.parse(text) : undefined
    } catch { /* empty body ok */ }
  }

  try {
    const settings = await resolveAppSettings(req.headers.get('authorization'))
    const { data, status } = await proxyLumaPath(path, req.method, query, body, settings)
    return NextResponse.json({ status: 'success', data }, { status })
  } catch (e) {
    if (e instanceof LumaApiError) {
      return NextResponse.json(
        { status: 'error', message: e.message, error: e.errorCode },
        { status: e.statusCode >= 400 && e.statusCode < 600 ? e.statusCode : 400 },
      )
    }
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ status: 'error', message: msg }, { status: 502 })
  }
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const DELETE = handler
export const PATCH = handler
