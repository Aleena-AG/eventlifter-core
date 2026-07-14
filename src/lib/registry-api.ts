'use client'

import { authHeader } from '@/lib/auth'
import { extractRegistryMasterId, unwrapApiData } from '@/lib/api-response'
import type { ChannelKey } from '@/lib/types'

/**
 * New registry REST surface (proxied under /api/registry → /api/v1/registry):
 *
 *   GET    /registry
 *   POST   /registry                         { title, capacity, channelRefs? }
 *   GET    /registry/:id
 *   DELETE /registry/:id
 *   GET    /registry/:id/attendees
 *   POST   /registry/:id/attendees           { email, name, source }
 *   POST   /registry/:id/channels            { channel, eventId, ticketId?, url? }
 *   DELETE /registry/:id/channels/:channel
 *   POST   /registry/attendees/by-channel    { channel, eventId, email, name, registeredAt? }
 */

export type RegistryChannelRef = {
  channel: ChannelKey
  eventId: string
  ticketId?: string
  url?: string
}

function registryAuthHeaders(extra?: Record<string, string>): Record<string, string> {
  const auth = authHeader()
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(auth ? { Authorization: auth } : {}),
    ...extra,
  }
}

async function parseRegistryError(res: Response): Promise<string> {
  const raw = await res.json().catch(() => ({})) as { error?: string; message?: string }
  return raw.message || raw.error || `Registry error ${res.status}`
}

/** POST /api/v1/registry — create master (+ optional channel refs). */
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

/** POST /api/v1/registry/:id/channels — link one channel. */
export async function linkRegistryChannel(
  masterId: string,
  ref: RegistryChannelRef,
): Promise<void> {
  const res = await fetch(`/api/registry/${encodeURIComponent(masterId)}/channels`, {
    method: 'POST',
    headers: registryAuthHeaders(),
    body: JSON.stringify({
      channel: ref.channel,
      eventId: ref.eventId,
      ...(ref.ticketId ? { ticketId: ref.ticketId } : {}),
      ...(ref.url ? { url: ref.url } : {}),
    }),
  })
  if (!res.ok) throw new Error(await parseRegistryError(res))
}

/**
 * Attach channel refs to an existing master.
 * Prefers POST /registry/:id/channels per ref (new API).
 * Falls back to create-with-refs only when link routes are missing (404/405).
 */
export async function updateRegistryChannelRefs(
  masterId: string,
  input: {
    title?: string
    capacity?: number
    channelRefs: RegistryChannelRef[]
  },
): Promise<void> {
  if (input.channelRefs.length === 0) return

  let linkSupported = true
  for (const ref of input.channelRefs) {
    try {
      await linkRegistryChannel(masterId, ref)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/HTTP 404|HTTP 405|not found|Route /i.test(msg) || msg.includes('404') || msg.includes('405')) {
        linkSupported = false
        break
      }
      throw e
    }
  }

  if (linkSupported) return

  // Backend routes not shipped yet — create a fresh master with all refs.
  if (!input.title) {
    throw new Error('Registry channel link API is not available on the backend yet')
  }
  await createRegistryWithChannelRefs({
    title: input.title,
    capacity: input.capacity ?? 150,
    channelRefs: input.channelRefs,
  })
}

/** GET /api/v1/registry/:id */
export async function getRegistryById(masterId: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`/api/registry/${encodeURIComponent(masterId)}`, {
    headers: registryAuthHeaders(),
  })
  if (!res.ok) return null
  const raw = await res.json().catch(() => null)
  if (!raw) return null
  return unwrapApiData(raw)
}

/** DELETE /api/v1/registry/:id */
export async function deleteRegistryById(masterId: string): Promise<void> {
  const res = await fetch(`/api/registry/${encodeURIComponent(masterId)}`, {
    method: 'DELETE',
    headers: registryAuthHeaders(),
  })
  if (!res.ok) throw new Error(await parseRegistryError(res))
}

/** DELETE /api/v1/registry/:id/channels/:channel */
export async function unlinkRegistryChannel(
  masterId: string,
  channel: ChannelKey,
): Promise<void> {
  const res = await fetch(
    `/api/registry/${encodeURIComponent(masterId)}/channels/${encodeURIComponent(channel)}`,
    { method: 'DELETE', headers: registryAuthHeaders() },
  )
  if (!res.ok) throw new Error(await parseRegistryError(res))
}

/** POST /api/v1/registry/:id/attendees */
export async function registerRegistryAttendee(
  masterId: string,
  attendee: {
    email: string
    name: string
    source: ChannelKey
    registeredAt?: string
  },
): Promise<Record<string, unknown>> {
  const res = await fetch(`/api/registry/${encodeURIComponent(masterId)}/attendees`, {
    method: 'POST',
    headers: registryAuthHeaders(),
    body: JSON.stringify({
      email: attendee.email.toLowerCase().trim(),
      name: attendee.name,
      source: attendee.source,
      ...(attendee.registeredAt ? { registeredAt: attendee.registeredAt } : {}),
    }),
  })
  if (!res.ok) throw new Error(await parseRegistryError(res))
  const raw = await res.json().catch(() => ({}))
  return unwrapApiData(raw)
}

/** POST /api/v1/registry/attendees/by-channel */
export async function registerAttendeeByChannel(input: {
  channel: ChannelKey
  eventId: string
  email: string
  name: string
  registeredAt?: string
  externalId?: string
}): Promise<Record<string, unknown>> {
  const res = await fetch('/api/registry/attendees/by-channel', {
    method: 'POST',
    headers: registryAuthHeaders(),
    body: JSON.stringify({
      channel: input.channel,
      eventId: input.eventId,
      email: input.email.toLowerCase().trim(),
      name: input.name,
      ...(input.registeredAt ? { registeredAt: input.registeredAt } : {}),
      ...(input.externalId ? { externalId: input.externalId } : {}),
    }),
  })
  if (!res.ok) throw new Error(await parseRegistryError(res))
  const raw = await res.json().catch(() => ({}))
  return unwrapApiData(raw)
}
