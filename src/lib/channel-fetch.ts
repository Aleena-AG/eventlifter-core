'use client'

import { authHeader } from '@/lib/auth'
import { htApiAuthHeader } from '@/lib/ewentcast-session'

function resolveAuthHeader(url: string): string {
  if (url.includes('/api/hightribe')) return htApiAuthHeader()
  return authHeader()
}

/** Attach session (and HT token for Hightribe routes) so server proxies load per-user keys. */
export function channelAuthHeaders(url: string, extra?: Record<string, string>): Record<string, string> {
  const auth = resolveAuthHeader(url)
  return { ...extra, ...(auth ? { Authorization: auth } : {}) }
}

export function channelFetch(input: string, init?: RequestInit): Promise<Response> {
  const extraHeaders = init?.headers instanceof Headers
    ? Object.fromEntries(init.headers.entries())
    : (init?.headers as Record<string, string> | undefined)

  return fetch(input, {
    ...init,
    headers: channelAuthHeaders(String(input), extraHeaders),
  })
}
