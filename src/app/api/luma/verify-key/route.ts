import { NextRequest, NextResponse } from 'next/server'
import { resolveAppSettings, SessionRequiredError } from '@/lib/channel-settings-server'
import { LumaApiError } from '@/lib/luma-api'

export const runtime = 'nodejs'

async function verifyLumaKey(apiKey: string): Promise<{ user: unknown; calendar: unknown }> {
  const base = (process.env.LUMA_API_BASE_URL || 'https://public-api.luma.com').replace(/\/$/, '')
  const headers = {
    'x-luma-api-key': apiKey,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }

  const userRes = await fetch(`${base}/v1/users/get-self`, { headers })
  const userText = await userRes.text()
  let userData: Record<string, unknown> = {}
  try { userData = userText ? JSON.parse(userText) as Record<string, unknown> : {} } catch { userData = { raw: userText } }
  if (!userRes.ok) {
    const msg = String(userData.message || userData.error || userText || `Luma HTTP ${userRes.status}`)
    throw new LumaApiError(msg, userRes.status)
  }

  let calendarData: Record<string, unknown> = {}
  try {
    const calRes = await fetch(`${base}/v1/calendars/get`, { headers })
    const calText = await calRes.text()
    calendarData = calText ? JSON.parse(calText) as Record<string, unknown> : {}
  } catch {
    /* calendar optional */
  }

  return { user: userData, calendar: calendarData }
}

export async function POST(req: NextRequest) {
  let body: { apiKey?: string } = {}
  try {
    const text = await req.text()
    body = text ? JSON.parse(text) as { apiKey?: string } : {}
  } catch {
    return NextResponse.json({ status: 'error', message: 'Invalid JSON body' }, { status: 400 })
  }

  const inlineKey = body.apiKey?.trim()
  if (inlineKey?.includes('*')) {
    return NextResponse.json({ status: 'error', message: 'Enter your full Luma API key' }, { status: 400 })
  }

  try {
    let apiKey = inlineKey || ''
    if (!apiKey) {
      const settings = await resolveAppSettings(req.headers.get('authorization'))
      apiKey = settings.luma.apiKey?.trim() || ''
    }
    if (!apiKey) {
      return NextResponse.json(
        { status: 'error', message: 'Luma API key not configured. Go to Settings → Luma.' },
        { status: 400 },
      )
    }
    const data = await verifyLumaKey(apiKey)
    return NextResponse.json({ status: 'success', data })
  } catch (e) {
    if (e instanceof SessionRequiredError) {
      return NextResponse.json({ status: 'error', message: e.message }, { status: 401 })
    }
    if (e instanceof LumaApiError) {
      return NextResponse.json({ status: 'error', message: e.message }, { status: e.statusCode })
    }
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ status: 'error', message: msg }, { status: 502 })
  }
}
