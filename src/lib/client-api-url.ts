/**
 * Browser API base — when set, BFF routes go straight to the remote API
 * so DevTools Network shows ewentcast-backend.vercel.app (not localhost).
 *
 * Local-only Next routes (Luma/HT/EB proxies, places, …) stay on the same origin.
 */
const DEFAULT_PUBLIC_BACKEND = 'https://ewentcast-backend.vercel.app'

const LOCAL_ONLY_PREFIXES = [
  '/api/luma',
  '/api/hightribe',
  '/api/eventbrite',
  '/api/places',
  '/api/cover',
  '/api/health',
  '/api/db-health',
  '/api/webhooks/setup',
  '/api/wh-logs',
] as const

export function getPublicBackendUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_BACKEND_URL
    || process.env.NEXT_PUBLIC_API_URL
    || DEFAULT_PUBLIC_BACKEND
  return raw.replace(/\/$/, '')
}

function isLocalOnlyPath(pathname: string): boolean {
  return LOCAL_ONLY_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
}

/**
 * Map `/api/settings` → `https://…/api/v1/settings` in the browser.
 * Keep relative `/api/...` when running on the server, or for local-only routes.
 */
export function resolveClientApiUrl(input: string): string {
  if (!input.startsWith('/api/')) return input

  // Server components / RSC should keep same-origin proxies.
  if (typeof window === 'undefined') return input

  const qIndex = input.indexOf('?')
  const pathname = qIndex >= 0 ? input.slice(0, qIndex) : input
  const search = qIndex >= 0 ? input.slice(qIndex) : ''

  if (isLocalOnlyPath(pathname)) return input

  const rest = pathname.slice('/api/'.length)
  return `${getPublicBackendUrl()}/api/v1/${rest}${search}`
}

/**
 * fetch() with URL resolution.
 * Prefer `channelFetch` from `@/lib/channel-fetch` for authenticated calls —
 * this helper does not attach Authorization (use it only for public routes).
 */
export function clientFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(resolveClientApiUrl(input), init)
}
