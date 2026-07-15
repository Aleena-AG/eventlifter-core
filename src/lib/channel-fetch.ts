'use client'

import { authHeader } from '@/lib/auth'
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

/** Attach session (and HT token for Hightribe routes) so server proxies load per-user keys. */
export async function channelAuthHeaders(
  url: string,
  extra?: Record<string, string>,
): Promise<Record<string, string>> {
  const auth = url.includes('/api/hightribe')
    ? await resolveHtApiAuthHeader()
    : authHeader()
  return { ...extra, ...(auth ? { Authorization: auth } : {}) }
}

export async function channelFetch(input: string, init?: RequestInit): Promise<Response> {
  const url = resolveClientApiUrl(String(input))
  const extraHeaders = init?.headers instanceof Headers
    ? Object.fromEntries(init.headers.entries())
    : (init?.headers as Record<string, string> | undefined)

  const maxAttempts = 3
  let lastErr: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fetch(url, {
        ...init,
        headers: await channelAuthHeaders(String(input), extraHeaders),
      })
    } catch (err) {
      lastErr = err
      if (!isTransientFetchError(err) || attempt >= maxAttempts) throw err
      await sleep(250 * attempt)
    }
  }

  throw lastErr
}
