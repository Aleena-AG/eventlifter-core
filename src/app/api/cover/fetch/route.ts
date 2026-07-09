import { NextRequest, NextResponse } from 'next/server'
import { SessionRequiredError, resolveAppSettings } from '@/lib/channel-settings-server'

export const runtime = 'nodejs'

const ALLOWED_HOST_SUFFIXES = [
  'lumacdn.com',
  'evbuc.com',
  'eventbrite.com',
  'unsplash.com',
  'cloudinary.com',
  'amazonaws.com',
  'googleusercontent.com',
  'hightribe.com',
]

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h.endsWith('.local')) return true
  if (h === '127.0.0.1' || h.startsWith('127.')) return true
  if (h.startsWith('10.') || h.startsWith('192.168.') || h.startsWith('169.254.')) return true
  const m = /^172\.(\d+)\./.exec(h)
  if (m) {
    const second = Number(m[1])
    if (second >= 16 && second <= 31) return true
  }
  return false
}

function isAllowedImageUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim())
    if (u.protocol !== 'https:') return false
    const host = u.hostname.toLowerCase()
    if (isPrivateHost(host)) return false
    return ALLOWED_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    )
  } catch {
    return false
  }
}

/** Server-side fetch for cover images (avoids browser CORS on Luma/Eventbrite CDNs). */
export async function POST(req: NextRequest) {
  try {
    await resolveAppSettings(req.headers.get('authorization'))
  } catch (e) {
    if (e instanceof SessionRequiredError) {
      return NextResponse.json({ error: e.message }, { status: 401 })
    }
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 503 })
  }

  let body: { url?: string }
  try {
    body = await req.json() as { url?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const url = String(body.url || '').trim()
  if (!url) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 })
  }
  if (!isAllowedImageUrl(url)) {
    return NextResponse.json({ error: 'URL host is not allowed for cover fetch' }, { status: 400 })
  }

  try {
    const upstream = await fetch(url, {
      headers: { Accept: 'image/*' },
      signal: AbortSignal.timeout(20_000),
    })
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream image fetch failed (${upstream.status})` },
        { status: 502 },
      )
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg'
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'URL did not return an image' }, { status: 400 })
    }

    const buf = await upstream.arrayBuffer()
    if (buf.byteLength > 12 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image too large (max 12MB)' }, { status: 413 })
    }

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
