'use client'

import { authHeader } from '@/lib/auth'

/** Attach HighTribe login token so server proxies can load per-user channel keys. */
export function channelAuthHeaders(extra?: Record<string, string>): Record<string, string> {
  const auth = authHeader()
  return { ...extra, ...(auth ? { Authorization: auth } : {}) }
}

export function channelFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    ...init,
    headers: channelAuthHeaders(
      init?.headers instanceof Headers
        ? Object.fromEntries(init.headers.entries())
        : (init?.headers as Record<string, string> | undefined),
    ),
  })
}
