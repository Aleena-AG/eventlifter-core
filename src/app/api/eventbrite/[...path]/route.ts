import { NextRequest, NextResponse } from 'next/server'
import { resolveAppSettings } from '@/lib/channel-settings-server'
import { loadSettings, saveSettings } from '@/lib/settings-store'

const EB_BASE = 'https://www.eventbriteapi.com/v3'
const EB_AUTH_URL = 'https://www.eventbrite.com/oauth/authorize'
const EB_TOKEN_URL = 'https://www.eventbrite.com/oauth/token'

async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params
  const pathStr = pathSegments.join('/')
  const settings = await resolveAppSettings(req.headers.get('authorization'))
  const s = settings.eventbrite

  // OAuth connect redirect
  if (pathStr === 'connect') {
    if (!s.clientId)
      return NextResponse.json({ error: 'Eventbrite Client ID not configured' }, { status: 400 })
    const hostId = req.nextUrl.searchParams.get('hostId') || 'default'
    const url = new URL(EB_AUTH_URL)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', s.clientId)
    url.searchParams.set('redirect_uri', s.redirectUri)
    url.searchParams.set('state', hostId)
    return NextResponse.redirect(url.toString())
  }

  // OAuth callback — exchange code for token
  if (pathStr === 'callback') {
    const code = req.nextUrl.searchParams.get('code') || ''
    if (!s.clientId || !s.clientSecret)
      return NextResponse.json({ error: 'OAuth not configured' }, { status: 400 })
    const tokenRes = await fetch(EB_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: s.clientId,
        client_secret: s.clientSecret,
        code,
        redirect_uri: s.redirectUri,
      }),
    })
    const tokenData = (await tokenRes.json()) as Record<string, unknown>
    // Save token as privateToken in settings
    if (tokenData.access_token) {
      const current = loadSettings()
      current.eventbrite.privateToken = String(tokenData.access_token)
      saveSettings(current)
    }
    return NextResponse.json({ connected: true, ...tokenData })
  }

  // Config/status
  if (pathStr === 'config' || pathStr === 'status') {
    return NextResponse.json({
      oauthConfigured: !!(s.clientId && s.clientSecret),
      hasPrivateToken: !!s.privateToken,
      connected: !!s.privateToken,
      redirectUri: s.redirectUri,
    })
  }

  // Proxy to Eventbrite API
  const token = s.privateToken
  if (!token)
    return NextResponse.json(
      { error: 'Eventbrite token not configured. Go to Settings → Eventbrite.' },
      { status: 400 }
    )

  const url = new URL(`${EB_BASE}/${pathStr}/`)
  req.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v))

  const init: RequestInit = {
    method: req.method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      init.body = await req.text()
    } catch {
      // ignore body read errors
    }
  }

  try {
    const upstream = await fetch(url.toString(), init)
    const text = await upstream.text()
    const data = text ? JSON.parse(text) : {}
    return NextResponse.json(data, { status: upstream.status })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const DELETE = handler
export const PATCH = handler
