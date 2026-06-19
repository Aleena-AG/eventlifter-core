import { NextRequest, NextResponse } from 'next/server'
import { getHtApiBase } from '@/lib/ht-api-base'

async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  const pathStr = path.join('/')

  const url = new URL(`${getHtApiBase()}/${pathStr}`)
  req.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v))

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }

  const authHeader = req.headers.get('authorization')
  if (authHeader) headers['Authorization'] = authHeader

  const init: RequestInit = { method: req.method, headers }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      const body = await req.text()
      if (body) init.body = body
    } catch {
      // ignore body read errors
    }
  }

  try {
    const upstream = await fetch(url.toString(), init)
    const text = await upstream.text()
    let data: unknown
    try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text } }
    return NextResponse.json(data, { status: upstream.status })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
