import { NextResponse } from 'next/server'
import { getBackendUrl } from '@/lib/backend-client'

export const runtime = 'nodejs'

/** Quick ops check: Next.js up + Express API reachable on same host. */
export async function GET() {
  const backendUrl = getBackendUrl()
  try {
    const res = await fetch(`${backendUrl}/health`, { cache: 'no-store' })
    const data = await res.json().catch(() => ({})) as { ok?: boolean; service?: string }
    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          next: true,
          backend: false,
          backendUrl,
          error: `Backend returned HTTP ${res.status}`,
        },
        { status: 503 },
      )
    }
    return NextResponse.json({
      ok: true,
      next: true,
      backend: !!data.ok,
      backendUrl,
      service: data.service || 'ewentcast-backend',
    })
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        next: true,
        backend: false,
        backendUrl,
        error: err instanceof Error ? err.message : 'Backend unreachable',
        hint: 'Run `npm start` (not `next start` alone). Check CHANNEL_MANAGER_DB_* in .env.local and pm2 logs.',
      },
      { status: 503 },
    )
  }
}
