/**
 * Browser + server API base — all `/api/*` calls go to the separated
 * ewentcast backend as `/api/v1/*`. This Next app has no `src/app/api` routes.
 *
 * Do not invent / rewrite channel proxy paths here — call the backend routes
 * the way the backend exposes them (e.g. /api/luma/images/upload-url,
 * /api/luma/events, /api/luma/ticket-types).
 */
const DEFAULT_PUBLIC_BACKEND = 'https://ewentcast-backend.vercel.app'

export function getPublicBackendUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_BACKEND_URL
    || process.env.NEXT_PUBLIC_API_URL
    || process.env.BACKEND_URL
    || DEFAULT_PUBLIC_BACKEND
  return raw.replace(/\/$/, '')
}

/**
 * Legacy remaps removed — paths are forwarded as written.
 * Kept for callers that still expect `{ pathname, method }`.
 */
export function remapChannelProxyPath(
  pathname: string,
  method: string,
): { pathname: string; method: string } {
  return { pathname, method: method.toUpperCase() }
}

/**
 * Map `/api/settings` → `https://…/api/v1/settings`.
 * Absolute URLs and non-/api paths are left unchanged.
 */
export function resolveClientApiUrl(input: string, method = 'GET'): string {
  if (!input.startsWith('/api/')) return input

  const qIndex = input.indexOf('?')
  const pathname = qIndex >= 0 ? input.slice(0, qIndex) : input
  const search = qIndex >= 0 ? input.slice(qIndex) : ''

  const remapped = remapChannelProxyPath(pathname, method)
  const rest = remapped.pathname.slice('/api/'.length)
  return `${getPublicBackendUrl()}/api/v1/${rest}${search}`
}

/**
 * fetch() with URL resolution.
 * Prefer `channelFetch` from `@/lib/channel-fetch` for authenticated calls —
 * this helper does not attach Authorization (use it only for public routes).
 */
export function clientFetch(input: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method || 'GET').toUpperCase()
  return fetch(resolveClientApiUrl(input, method), {
    ...init,
    method: remapChannelProxyPath(
      input.startsWith('/api/')
        ? (input.includes('?') ? input.slice(0, input.indexOf('?')) : input)
        : input,
      method,
    ).method,
  })
}
