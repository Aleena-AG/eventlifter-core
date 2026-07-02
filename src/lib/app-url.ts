/** Live production site — used when APP_URL is not set. */
export const PRODUCTION_APP_URL = 'https://ewentcast.com'

const DEV_APP_URL = 'http://localhost:3000'

export function defaultAppUrl(): string {
  return process.env.NODE_ENV === 'production' ? PRODUCTION_APP_URL : DEV_APP_URL
}

/** Public app URL — override with APP_URL in .env.local (local: eventlifter-core.test). */
export function getAppUrl(): string {
  const raw =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    defaultAppUrl()
  return raw.replace(/\/$/, '')
}

export function eventbriteRedirectUri(): string {
  return `${getAppUrl()}/api/eventbrite/callback`
}

/** Resolve public site URL from an incoming API/page request (Vercel/proxy aware). */
export function appUrlFromRequest(req: {
  headers: Headers
  nextUrl?: { origin: string; protocol?: string }
}): string {
  const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const host = forwardedHost || req.headers.get('host')?.split(',')[0]?.trim()
  if (host) {
    const proto =
      req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
      || req.nextUrl?.protocol?.replace(':', '')
      || (host.includes('localhost') || host.includes('.test') ? 'http' : 'https')
    return `${proto}://${host}`.replace(/\/$/, '')
  }
  if (req.nextUrl?.origin) {
    return req.nextUrl.origin.replace(/\/$/, '')
  }
  return getAppUrl()
}

export function eventbriteRedirectUriFromRequest(req: {
  headers: Headers
  nextUrl?: { origin: string; protocol?: string }
}): string {
  return `${appUrlFromRequest(req)}/api/eventbrite/callback`
}

/** Prefer current site when saved redirect points at another host (e.g. old .test URL). */
export function effectiveEventbriteRedirectUri(saved: string | undefined, current: string): string {
  const savedTrim = saved?.trim()
  if (!savedTrim) return current
  try {
    if (new URL(savedTrim).host !== new URL(current).host) return current
  } catch {
    return current
  }
  return savedTrim
}
