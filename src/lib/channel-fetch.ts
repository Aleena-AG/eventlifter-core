'use client'

import { authHeader, clearAuth, isAuthErrorMessage } from '@/lib/auth'
import { remapChannelProxyPath, resolveClientApiUrl } from '@/lib/client-api-url'
import { resolveHtApiAuthHeader } from '@/lib/ewentcast-session'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isTransientFetchError(err: unknown): boolean {
  if (!(err instanceof TypeError)) return false
  const msg = err.message.toLowerCase()
  return msg.includes('failed to fetch')
    || msg.includes('network')
    || msg.includes('aborted')
    || msg.includes('suspended')
}

function extraHeadersFromInit(init?: RequestInit): Record<string, string> | undefined {
  if (!init?.headers) return undefined
  if (init.headers instanceof Headers) {
    return Object.fromEntries(init.headers.entries())
  }
  return init.headers as Record<string, string>
}

/**
 * Build Authorization headers for `/api/...` calls (resolved to remote `/api/v1/...`).
 *
 * Always attach the Ewentcast session JWT when present (settings / registry /
 * Luma / Eventbrite / Hightribe proxies all need it).
 *
 * For Hightribe, also send the HT link token as X-Hightribe-Authorization so
 * the backend can fall back if settings.apiKey is missing/expired.
 */
export async function channelAuthHeaders(
  url: string,
  extra?: Record<string, string>,
): Promise<Record<string, string>> {
  const out: Record<string, string> = { Accept: 'application/json', ...extra }

  try {
    const session = authHeader()
    if (session) out.Authorization = session

    if (url.includes('/api/hightribe')) {
      let ht = ''
      try {
        ht = await resolveHtApiAuthHeader()
      } catch {
        ht = ''
      }
      if (ht) out['X-Hightribe-Authorization'] = ht
      if (!session && ht) out.Authorization = ht
    }
  } catch {
    // Never block the request on header assembly failure.
  }

  return out
}

/** True when the request path expects a logged-in Ewentcast session. */
function requiresSessionAuth(pathname: string): boolean {
  if (pathname.startsWith('/api/auth/login')) return false
  if (pathname.startsWith('/api/auth/register')) return false
  if (pathname.startsWith('/api/auth/forgot-password')) return false
  if (pathname.startsWith('/api/auth/reset-password')) return false
  if (pathname.startsWith('/api/places/')) return false
  if (pathname.startsWith('/api/health')) return false
  if (pathname.startsWith('/api/wh-logs/')) return false
  return pathname.startsWith('/api/')
}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.clone().json() as { error?: string; message?: string }
    return data.message || data.error || `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

/**
 * Authenticated fetch for all app `/api/*` routes (resolved to remote `/api/v1/*`).
 * Remaps legacy Luma path aliases, attaches auth headers, retries transient failures.
 */
export async function channelFetch(input: string, init?: RequestInit): Promise<Response> {
  const raw = String(input)
  const qIndex = raw.indexOf('?')
  const pathname = qIndex >= 0 ? raw.slice(0, qIndex) : raw
  const requestedMethod = (init?.method || 'GET').toUpperCase()
  const remapped = remapChannelProxyPath(pathname, requestedMethod)
  const url = resolveClientApiUrl(raw, requestedMethod)
  const extraHeaders = extraHeadersFromInit(init)

  const maxAttempts = 3
  let lastErr: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const headers = await channelAuthHeaders(raw, extraHeaders)

      // FormData must not carry a manual Content-Type (boundary is required).
      if (typeof FormData !== 'undefined' && init?.body instanceof FormData) {
        delete headers['Content-Type']
      }

      if (
        requiresSessionAuth(pathname)
        && !headers.Authorization
        && !headers['X-Hightribe-Authorization']
      ) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Not signed in. Please sign in again.',
            message: 'Not signed in. Please sign in again.',
            code: 'AUTH_TOKEN_MISSING',
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        )
      }

      const res = await fetch(url, {
        ...init,
        method: remapped.method,
        headers,
      })

      // Clear stale local session when the API rejects it.
      if (res.status === 401 && pathname.startsWith('/api/') && !pathname.includes('/api/hightribe')) {
        try {
          const msg = await parseErrorMessage(res)
          if (isAuthErrorMessage(msg) || msg.includes('HTTP 401')) {
            // Don't wipe session on hightribe upstream 401 (channel disconnect ≠ logout).
            // For backend 401s on settings/registry/events, clear below only when message says so.
            if (isAuthErrorMessage(msg)) clearAuth()
          }
        } catch {
          // ignore
        }
      }

      return res
    } catch (err) {
      lastErr = err
      if (!isTransientFetchError(err) || attempt >= maxAttempts) {
        throw err instanceof Error ? err : new Error(String(err))
      }
      await sleep(250 * attempt)
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

/** Same as channelFetch but always resolves to JSON (throws on !ok). */
export async function channelFetchJson<T = unknown>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const res = await channelFetch(input, init)
  const data = await res.json().catch(() => ({})) as T & { message?: string; error?: string }
  if (!res.ok) {
    const message =
      (typeof data === 'object' && data && ('message' in data || 'error' in data)
        ? (data.message || data.error)
        : null) || `HTTP ${res.status}`
    throw new Error(String(message))
  }
  return data
}
