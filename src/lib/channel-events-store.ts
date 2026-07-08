'use client'

import type { ChannelKey } from '@/lib/types'
import { authHeader } from '@/lib/auth'

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
}

export async function listStoredEvents(channel: ChannelName): Promise<StoredChannelEvent[]> {
  try {
    const res = await fetch(`/api/events/${channel}`, {
      headers: { Authorization: authHeader(), Accept: 'application/json' },
    })
    if (!res.ok) return []
    const data = await res.json() as { events?: StoredChannelEvent[] }
    return data.events || []
  } catch {
    return []
  }
}

export async function listAllStoredBookings(): Promise<StoredChannelBooking[]> {
  const res = await fetch('/api/events/bookings', {
    headers: { Authorization: authHeader(), Accept: 'application/json' },
  })
  if (!res.ok) return []
  const data = await res.json() as { bookings?: StoredChannelBooking[] }
  return data.bookings || []
}

export async function getStoredEvent(
  channel: ChannelName,
  externalId: string,
): Promise<StoredChannelEvent | null> {
  const res = await fetch(
    `/api/events/${channel}?external_id=${encodeURIComponent(String(externalId))}`,
    { headers: { Authorization: authHeader(), Accept: 'application/json' } },
  )
  if (!res.ok) return null
  const data = await res.json() as { event?: StoredChannelEvent | null }
  return data.event || null
}

export async function syncStoredBookings(
  channel: ChannelName,
  bookings: Array<Record<string, unknown>>,
): Promise<number> {
  const res = await fetch(`/api/events/${channel}/sync-bookings`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
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
    const res = await fetch(`/api/events/${channel}`, {
      method: 'DELETE',
      headers: { Authorization: authHeader(), Accept: 'application/json' },
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
    const res = await fetch(
      `/api/events/${channel}/${encodeURIComponent(String(externalId))}`,
      {
        method: 'DELETE',
        headers: { Authorization: authHeader(), Accept: 'application/json' },
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
  const res = await fetch(`/api/events/${channel}/sync`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
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
