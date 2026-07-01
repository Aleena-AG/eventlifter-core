import { NextRequest, NextResponse } from 'next/server'
import { getBackendUrl } from '@/lib/backend-client'

export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ channel: string }> }

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const auth = req.headers.get('authorization')
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { channel } = await ctx.params
    const target = `${getBackendUrl()}/api/settings/${channel}`

    const res = await fetch(target, {
      method: 'DELETE',
      headers: { Authorization: auth, Accept: 'application/json' },
      cache: 'no-store',
    })

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
