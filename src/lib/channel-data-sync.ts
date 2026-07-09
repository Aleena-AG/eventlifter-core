'use client'

import { channelFetch } from '@/lib/channel-fetch'
import {
  fetchEbBookingList,
  fetchEbEventsForSync,
  fetchHightribeBookingsList,
  fetchLumaBookingList,
  fetchLumaEventsForSync,
  bookingToStoredPayload,
  type BookingListItem,
} from '@/lib/bookings'
import {
  purgeChannelDataFromDb,
  syncStoredBookings,
  syncStoredEvents,
  type ChannelName,
} from '@/lib/channel-events-store'
import { fetchHtEventsPage } from '@/lib/hightribe-events'
import { lumaHostedEventRef } from '@/lib/luma-event-utils'
import type { ChannelKey } from '@/lib/types'

function bookingsToPayload(items: BookingListItem[]): Array<Record<string, unknown>> {
  return items.map(bookingToStoredPayload)
}

async function fetchHightribeEventRows(): Promise<Array<Record<string, unknown>>> {
  const all: Array<Record<string, unknown>> = []
  let page = 1
  let lastPage = 1
  while (page <= lastPage && page <= 20) {
    const { events, lastPage: lp } = await fetchHtEventsPage(page, 50)
    all.push(...(events as unknown as Array<Record<string, unknown>>))
    lastPage = lp
    page++
  }
  return all
}

async function fetchLumaEventRows(): Promise<Array<Record<string, unknown>>> {
  const res = await channelFetch('/api/luma/events/hosted?upcoming_only=false&fetch_all=true')
  if (!res.ok) return []
  const raw = await res.json() as { data?: { entries?: unknown[] }; entries?: unknown[] }
  return (raw.data?.entries || raw.entries || []) as Array<Record<string, unknown>>
}

async function fetchEventbriteEventRows(): Promise<Array<Record<string, unknown>>> {
  const events = await fetchEbEventsForSync()
  return events as Array<Record<string, unknown>>
}

export const EVENTS_LIST_REFRESH_KEY = 'ew-events-list-refresh'

/** Tell the Events page to reload from the local store on next visit/focus. */
export function markEventsListStale(): void {
  try {
    sessionStorage.setItem(EVENTS_LIST_REFRESH_KEY, String(Date.now()))
  } catch {
    // ignore
  }
}

export function consumeEventsListRefresh(): boolean {
  try {
    const flag = sessionStorage.getItem(EVENTS_LIST_REFRESH_KEY)
    if (!flag) return false
    sessionStorage.removeItem(EVENTS_LIST_REFRESH_KEY)
    return true
  } catch {
    return false
  }
}

/** Fetch fresh copies of specific events from channel APIs and upsert into our store. */
export async function refreshStoredEventsForChannels(
  targets: Partial<Record<ChannelKey, string | number>>,
): Promise<void> {
  const entries = (['hightribe', 'luma', 'eventbrite'] as ChannelKey[])
    .map((ch) => ({ ch, id: targets[ch] }))
    .filter((e): e is { ch: ChannelKey; id: string | number } => e.id != null && e.id !== '')

  await Promise.all(entries.map(async ({ ch, id }) => {
    try {
      let raw: Record<string, unknown> | null = null

      if (ch === 'hightribe') {
        const res = await channelFetch(`/api/hightribe/events/${id}`)
        if (res.ok) {
          const data = await res.json() as Record<string, unknown>
          raw = (data.data as Record<string, unknown>) || data
          if (raw && raw.id == null) raw = { ...raw, id }
        }
      } else if (ch === 'luma') {
        const res = await channelFetch(
          `/api/luma/events?api_id=${encodeURIComponent(String(id))}`,
        )
        if (res.ok) {
          const data = await res.json() as {
            data?: Record<string, unknown>
            event?: Record<string, unknown>
          }
          raw = data.data || data.event || null
        }
      } else {
        const res = await channelFetch(`/api/eventbrite/events/${id}?expand=venue`)
        if (res.ok) raw = await res.json() as Record<string, unknown>
      }

      if (raw && Object.keys(raw).length > 0) {
        await syncStoredEvents(ch, [raw], { prune: false })
      }
    } catch {
      // best-effort — full channel sync can recover later
    }
  }))
}

/** Pull events + bookings from channel APIs and persist to MySQL. */
export async function syncChannelDataToDb(
  channel: ChannelKey,
): Promise<{ events: number; pruned: number; bookings: number }> {
  const ch = channel as ChannelName
  let events: Array<Record<string, unknown>> = []
  let bookings: BookingListItem[] = []

  if (channel === 'hightribe') {
    events = await fetchHightribeEventRows()
    bookings = await fetchHightribeBookingsList()
  } else if (channel === 'luma') {
    events = await fetchLumaEventRows()
    const lumaEvents = events.map((entry) => {
      const ref = lumaHostedEventRef(entry)
      return { api_id: ref.id, name: ref.name }
    }).filter((e) => e.api_id)
    bookings = lumaEvents.length ? await fetchLumaBookingList(lumaEvents) : []
  } else {
    events = await fetchEventbriteEventRows()
    const ebEvents = events.map((e) => ({
      id: String(e.id || ''),
      name: (e.name as { text?: string } | undefined)?.text || String(e.name || ''),
    })).filter((e) => e.id)
    bookings = ebEvents.length ? await fetchEbBookingList(ebEvents) : []
  }

  let eventCount = 0
  let prunedCount = 0
  let bookingCount = 0

  const eventSync = await syncStoredEvents(ch, events, { prune: true })
  eventCount = eventSync.upserted
  prunedCount = eventSync.pruned

  if (bookings.length > 0) {
    bookingCount = await syncStoredBookings(ch, bookingsToPayload(bookings))
  }

  return { events: eventCount, pruned: prunedCount, bookings: bookingCount }
}

/** Remove all cached events, bookings, and registry links for a channel. */
export { purgeChannelDataFromDb }

export function formatEventSyncMessage(result: {
  events: number
  pruned: number
  bookings?: number
}): string {
  const parts: string[] = []
  if (result.events > 0) parts.push(`${result.events} event${result.events === 1 ? '' : 's'} synced`)
  if (result.pruned > 0) parts.push(`${result.pruned} stale removed`)
  if (result.bookings != null && result.bookings > 0) {
    parts.push(`${result.bookings} booking${result.bookings === 1 ? '' : 's'}`)
  }
  return parts.length > 0 ? parts.join(', ') : 'Sync complete'
}
