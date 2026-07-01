import { NextRequest, NextResponse } from 'next/server'
import { getBackendUrl } from '@/lib/backend-client'

export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ channel: string }> }

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const { channel } = await ctx.params
    const auth = req.headers.get('authorization')
    const target = `${getBackendUrl()}/api/events/${channel}/sync`

    const res = await fetch(target, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: auth } : {}),
      },
      body: await req.text(),
      cache: 'no-store',
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Backend unavailable' },
      { status: 503 },
    )
  }
}
