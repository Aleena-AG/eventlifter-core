import { NextRequest, NextResponse } from 'next/server'
import { getBackendUrl } from '@/lib/backend-client'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const target = `${getBackendUrl()}/api/events/bookings`
  const headers: Record<string, string> = { Accept: 'application/json' }
  const auth = req.headers.get('authorization')
  if (auth) headers.Authorization = auth

  try {
    const res = await fetch(target, { method: 'GET', headers, cache: 'no-store' })
    const text = await res.text()
    let data: unknown = {}
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      data = { error: text.slice(0, 200) || `HTTP ${res.status}` }
    }
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Backend unavailable' },
      { status: 503 },
    )
  }
}
