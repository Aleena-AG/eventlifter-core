import { NextRequest, NextResponse } from 'next/server'
import { SessionRequiredError, resolveAppSettings } from '@/lib/channel-settings-server'
import { isMaskedSecret } from '@/lib/settings-store'

function normalizeBearer(raw: string): string {
  const clean = raw.trim()
  if (!clean) return ''
  return clean.startsWith('Bearer ') ? clean : `Bearer ${clean}`
}

function getHtApiBase(serviceUrl?: string): string {
  const fromSettings = serviceUrl?.replace(/\/$/, '')
  const fromEnv = process.env.HT_API_BASE?.replace(/\/$/, '')
  const base = fromSettings || fromEnv || 'https://api.hightribe.com'
  return `${base}/api`
}

async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params
  const pathStr = path.join('/')

  // Login is unauthenticated — forward email/password to Hightribe.
  const isLogin = pathStr === 'login'

  let upstreamAuth = ''
  let apiBase = getHtApiBase()

  if (!isLogin) {
    const sessionAuth = req.headers.get('authorization')
    const clientHtAuth = req.headers.get('x-hightribe-authorization')
    let sessionResolved = false
    let sessionRejected = false

    // Prefer stored settings.hightribe.apiKey (same pattern as Luma / Eventbrite).
    if (sessionAuth) {
      try {
        const settings = await resolveAppSettings(sessionAuth)
        sessionResolved = true
        const key = settings.hightribe.apiKey?.trim() || ''
        if (key && !isMaskedSecret(key)) {
          upstreamAuth = normalizeBearer(key)
        }
        if (settings.hightribe.serviceUrl?.trim()) {
          apiBase = getHtApiBase(settings.hightribe.serviceUrl)
        }
      } catch (e) {
        sessionRejected = e instanceof SessionRequiredError
        if (!sessionRejected) {
          console.warn('[hightribe proxy] settings resolve failed:', e)
        }
      }
    }

    try {
      if (!upstreamAuth && clientHtAuth) {
        upstreamAuth = normalizeBearer(clientHtAuth)
      }
      // Only reuse Authorization as HT token when it was NOT a valid Ewentcast session
      // (e.g. Hightribe-native users sending the HT JWT directly).
      if (!upstreamAuth && sessionAuth && (!sessionResolved || sessionRejected)) {
        upstreamAuth = normalizeBearer(sessionAuth)
      }
    } catch {
      // ignore header normalize failures
    }

    if (!upstreamAuth) {
      return NextResponse.json(
        {
          error: 'Hightribe not connected. Connect Hightribe in Settings, then try again.',
          message: 'Hightribe not connected. Connect Hightribe in Settings, then try again.',
          code: 'HIGHTRIBE_AUTH_MISSING',
        },
        { status: 401 },
      )
    }
  }

  const url = new URL(`${apiBase}/${pathStr}`)
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

  if (upstreamAuth) headers.Authorization = upstreamAuth

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
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      data = { raw: text }
    }
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
