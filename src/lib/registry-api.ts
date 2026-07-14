'use client'

import { authHeader } from '@/lib/auth'
import { extractRegistryMasterId, unwrapApiData } from '@/lib/api-response'
import type { ChannelKey } from '@/lib/types'

export type RegistryChannelRef = {
  channel: ChannelKey
  eventId: string
  ticketId?: string
  url?: string
}

function registryAuthHeaders(): Record<string, string> {
  const auth = authHeader()
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(auth ? { Authorization: auth } : {}),
  }
}

/**
 * Remote API contract (POST /api/v1/registry):
 *   { title, capacity, channelRefs: [{ channel, eventId, ticketId?, url? }] }
 *
 * There is no `action: "link"` — that returns "title is required".
 */
export async function createRegistryWithChannelRefs(input: {
  title: string
  capacity: number
  channelRefs: RegistryChannelRef[]
}): Promise<string> {
  const res = await fetch('/api/registry', {
    method: 'POST',
    headers: registryAuthHeaders(),
    body: JSON.stringify({
      title: input.title,
      capacity: input.capacity,
      ...(input.channelRefs.length > 0 ? { channelRefs: input.channelRefs } : {}),
    }),
  })
  const raw = await res.json().catch(() => ({})) as { error?: string; message?: string }
  const id = extractRegistryMasterId(raw)
  if (!res.ok || !id) {
    throw new Error(raw.message || raw.error || `Registry create failed (HTTP ${res.status})`)
  }
  return id
}

/** Attach more channel refs to an existing master (PUT /api/v1/registry/:id). */
export async function updateRegistryChannelRefs(
  masterId: string,
  input: {
    title?: string
    capacity?: number
    channelRefs: RegistryChannelRef[]
  },
): Promise<void> {
  if (input.channelRefs.length === 0) return

  const body: Record<string, unknown> = {
    channelRefs: input.channelRefs,
  }
  if (input.title) body.title = input.title
  if (input.capacity != null) body.capacity = input.capacity

  const res = await fetch(`/api/registry/${encodeURIComponent(masterId)}`, {
    method: 'PUT',
    headers: registryAuthHeaders(),
    body: JSON.stringify(body),
  })

  if (res.ok) return

  // Some backends accept POST create-only; fall back to re-create with refs
  // only when PUT is not supported — callers pass title/capacity for that.
  if (res.status === 404 || res.status === 405) {
    if (!input.title) {
      const err = await res.json().catch(() => ({})) as { message?: string; error?: string }
      throw new Error(err.message || err.error || `Registry update failed (HTTP ${res.status})`)
    }
    await createRegistryWithChannelRefs({
      title: input.title,
      capacity: input.capacity ?? 150,
      channelRefs: input.channelRefs,
    })
    return
  }

  const err = await res.json().catch(() => ({})) as { message?: string; error?: string }
  throw new Error(err.message || err.error || `Registry update failed (HTTP ${res.status})`)
}

export async function getRegistryById(masterId: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`/api/registry/${encodeURIComponent(masterId)}`, {
    headers: registryAuthHeaders(),
  })
  if (!res.ok) return null
  const raw = await res.json().catch(() => null)
  if (!raw) return null
  return unwrapApiData(raw)
}
