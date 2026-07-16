'use client'

import type { ChannelKey } from '@/lib/types'
import { channelFetch } from '@/lib/channel-fetch'
import { unwrapApiData } from '@/lib/api-response'

export type ChannelName = 'luma' | 'eventbrite' | 'hightribe'

export interface StoredChannelEvent {
  id: number
  external_id: string
  title: string
  start_at: string | null
  end_at: string | null
  timezone: string | null
  url: string | null
  cover_url: string | null
  status: string | null
  payload: Record<string, unknown>
  synced_at: string
}

export interface StoredChannelBooking {
  id: number
  channel: ChannelName
  external_id: string
  event_external_id: string | null
  event_title: string
  guest_name: string
  guest_email: string
  status: string | null
  ticket_count: number | null
  registered_at: string
  synced_at: string
  payload?: Record<string, unknown>
}

function isStoredEventRow(v: unknown): v is StoredChannelEvent {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const row = v as Record<string, unknown>
  return row.external_id != null || (row.payload != null && typeof row.payload === 'object')
}

/** Accept `{ event }`, `{ events: [...] }`, bare row, or `{ data: … }` wrappers. */
function parseStoredEventPayload(raw: unknown, externalId?: string): StoredChannelEvent | null {
  const data = unwrapApiData<Record<string, unknown> | StoredChannelEvent | StoredChannelEvent[]>(raw)

  if (Array.isArray(data)) {
    if (!externalId) return isStoredEventRow(data[0]) ? data[0] : null
    const match = data.find((row) => String(row?.external_id) === String(externalId))
    return isStoredEventRow(match) ? match : null
  }

  if (!data || typeof data !== 'object') return null

  const wrapped = data as Record<string, unknown>
  if (isStoredEventRow(wrapped.event)) return wrapped.event as StoredChannelEvent

  if (Array.isArray(wrapped.events)) {
    const list = wrapped.events as unknown[]
    if (externalId) {
      const match = list.find(
        (row) => isStoredEventRow(row) && String(row.external_id) === String(externalId),
      )
      if (isStoredEventRow(match)) return match
    }
    return isStoredEventRow(list[0]) ? (list[0] as StoredChannelEvent) : null
  }

  if (isStoredEventRow(data)) return data as StoredChannelEvent
  return null
}

function parseStoredEventsList(raw: unknown): StoredChannelEvent[] {
  const data = unwrapApiData<Record<string, unknown> | StoredChannelEvent[]>(raw)
  if (Array.isArray(data)) return data.filter(isStoredEventRow)
  if (data && typeof data === 'object') {
    const events = (data as { events?: unknown }).events
    if (Array.isArray(events)) return events.filter(isStoredEventRow)
  }
  return []
}

export async function listStoredEvents(channel: ChannelName): Promise<StoredChannelEvent[]> {
  try {
    const res = await channelFetch(`/api/events/${channel}`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return []
    return parseStoredEventsList(await res.json())
  } catch {
    return []
  }
}

export async function listAllStoredBookings(): Promise<StoredChannelBooking[]> {
  const res = await channelFetch('/api/events/bookings', {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) return []
  const raw = await res.json()
  const data = unwrapApiData<{ bookings?: StoredChannelBooking[] } | StoredChannelBooking[]>(raw)
  if (Array.isArray(data)) return data
  return data.bookings || []
}

export async function getStoredEvent(
  channel: ChannelName,
  externalId: string,
): Promise<StoredChannelEvent | null> {
  try {
    const res = await channelFetch(
      `/api/events/${channel}?external_id=${encodeURIComponent(String(externalId))}`,
      { headers: { Accept: 'application/json' } },
    )
    if (res.ok) {
      const parsed = parseStoredEventPayload(await res.json(), externalId)
      if (parsed) return parsed
    }
  } catch {
    // fall through to list scan
  }

  // Backend may ignore external_id or return a different shape — scan the channel list.
  try {
    const rows = await listStoredEvents(channel)
    return rows.find((row) => String(row.external_id) === String(externalId)) || null
  } catch {
    return null
  }
}

export async function syncStoredBookings(
  channel: ChannelName,
  bookings: Array<Record<string, unknown>>,
): Promise<number> {
  const res = await channelFetch(`/api/events/${channel}/sync-bookings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ bookings }),
  })
  if (!res.ok) {
    const err = await res.json() as { error?: string }
    throw new Error(err.error || `Booking sync failed (${res.status})`)
  }
  const data = await res.json() as { upserted?: number }
  return data.upserted ?? 0
}

export async function purgeChannelDataFromDb(channel: ChannelName): Promise<void> {
  try {
    const res = await channelFetch(`/api/events/${channel}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return
    await res.json().catch(() => undefined)
  } catch {
    // best-effort — backend may be offline
  }
}

/** Remove one event from our stored copy (MySQL / local file). */
export async function deleteStoredEvent(
  channel: ChannelName,
  externalId: string | number,
): Promise<boolean> {
  try {
    const res = await channelFetch(
      `/api/events/${channel}/${encodeURIComponent(String(externalId))}`,
      {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      },
    )
    if (!res.ok) return false
    const data = await res.json().catch(() => ({})) as { ok?: boolean }
    return data.ok !== false
  } catch {
    return false
  }
}

export async function syncStoredEvents(
  channel: ChannelName,
  events: Array<Record<string, unknown>>,
  options?: { prune?: boolean },
): Promise<{ upserted: number; pruned: number }> {
  const res = await channelFetch(`/api/events/${channel}/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ events, prune: options?.prune !== false }),
  })
  if (!res.ok) {
    const err = await res.json() as { error?: string }
    throw new Error(err.error || `Sync failed (${res.status})`)
  }
  const data = await res.json() as { upserted?: number; pruned?: number }
  return { upserted: data.upserted ?? 0, pruned: data.pruned ?? 0 }
}

export function channelToTab(channel: ChannelKey): ChannelName {
  return channel
}
