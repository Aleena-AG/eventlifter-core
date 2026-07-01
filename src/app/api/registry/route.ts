import { NextRequest, NextResponse } from 'next/server'
import { getBackendUrl } from '@/lib/backend-client'

async function proxy(req: NextRequest) {
  const url = new URL(req.url)
  const target = `${getBackendUrl()}/api/registry${url.search}`

  const init: RequestInit = {
    method: req.method,
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  }

  if (req.method === 'POST') {
    init.headers = { ...init.headers as Record<string, string>, 'Content-Type': 'application/json' }
    init.body = await req.text()
  }

  const res = await fetch(target, init)
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export async function GET(req: NextRequest) {
  try {
    return await proxy(req)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Backend unavailable' },
      { status: 503 },
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    return await proxy(req)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Backend unavailable' },
      { status: 503 },
    )
  }
}
