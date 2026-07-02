import { NextRequest, NextResponse } from 'next/server'
import { getHtApiBase } from '@/lib/ht-api-base'
import { isErrorResponse, requireSession } from '@/lib/server/session'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const session = await requireSession(req)
  if (isErrorResponse(session)) {
    return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 })
  }

  const auth = req.headers.get('authorization') || ''
  try {
    const upstream = await fetch(`${getHtApiBase()}/ewentcast/transactions`, {
      headers: { Authorization: auth, Accept: 'application/json' },
      cache: 'no-store',
    })
    const data = await upstream.json().catch(() => ({})) as Record<string, unknown>
    if (!upstream.ok) {
      return NextResponse.json(
        {
          status: false,
          message: String(data.message || data.error || 'Could not load billing history'),
          transactions: [],
        },
        { status: upstream.status },
      )
    }
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json(
      {
        status: false,
        message: err instanceof Error ? err.message : 'Billing service unavailable',
        transactions: [],
      },
      { status: 502 },
    )
  }
}
