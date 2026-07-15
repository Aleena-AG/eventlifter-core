'use client'

import { authHeader, clearAuth, isAuthErrorMessage } from '@/lib/auth'
import { resolveClientApiUrl } from '@/lib/client-api-url'
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
 * Build Authorization headers for any `/api/...` call.
 *
 * - Hightribe proxies need the Ewentcast session so Next can load
 *   `settings.hightribe.apiKey`, plus optional browser HT link token.
 * - All other routes get the Ewentcast session JWT.
 */
export async function channelAuthHeaders(
  url: string,
  extra?: Record<string, string>,
): Promise<Record<string, string>> {
  const out: Record<string, string> = { Accept: 'application/json', ...extra }

  try {
    if (url.includes('/api/hightribe')) {
      const session = authHeader()
      let ht = ''
      try {
        ht = await resolveHtApiAuthHeader()
      } catch {
        ht = ''
      }

      // Prefer Ewentcast session for settings lookup on the Next proxy.
      if (session) out.Authorization = session
      else if (ht) out.Authorization = ht

      if (ht) out['X-Hightribe-Authorization'] = ht
      return out
    }

    const auth = authHeader()
    if (auth) out.Authorization = auth
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
  if (pathname === '/api/hightribe/login' || pathname.startsWith('/api/hightribe/login?')) return false
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
 * Authenticated fetch for all app `/api/*` routes.
 * Attaches the correct Authorization headers and retries transient network failures.
 */
export async function channelFetch(input: string, init?: RequestInit): Promise<Response> {
  const raw = String(input)
  const url = resolveClientApiUrl(raw)
  const extraHeaders = extraHeadersFromInit(init)

  const qIndex = raw.indexOf('?')
  const pathname = qIndex >= 0 ? raw.slice(0, qIndex) : raw

  const maxAttempts = 3
  let lastErr: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const headers = await channelAuthHeaders(raw, extraHeaders)

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
