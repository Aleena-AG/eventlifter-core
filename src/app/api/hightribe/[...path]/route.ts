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
    Accept: 'application/json',
  }

  // Preserve the incoming Content-Type verbatim. For multipart/form-data this
  // carries the boundary that matches the raw body bytes — forcing JSON here
  // would make the upstream API see an empty body (all fields "required").
  const contentType = req.headers.get('content-type')
  const isMultipart = !!contentType && contentType.includes('multipart/form-data')
  if (contentType) headers['Content-Type'] = contentType

  const authHeader = req.headers.get('authorization')
  if (authHeader) headers['Authorization'] = authHeader

  const init: RequestInit = { method: req.method, headers }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      if (isMultipart) {
        const buf = await req.arrayBuffer()
        if (buf.byteLength) init.body = buf
      } else {
        const body = await req.text()
        if (body) init.body = body
        if (!contentType) headers['Content-Type'] = 'application/json'
      }
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
