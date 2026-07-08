'use client'

import { authHeader } from '@/lib/auth'
import { resolveHtApiAuthHeader } from '@/lib/ewentcast-session'

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
  const extraHeaders = init?.headers instanceof Headers
    ? Object.fromEntries(init.headers.entries())
    : (init?.headers as Record<string, string> | undefined)

  return fetch(input, {
    ...init,
    headers: await channelAuthHeaders(String(input), extraHeaders),
  })
}
