'use client'

import { channelFetch } from '@/lib/channel-fetch'
import {
  fetchEbBookingList,
  fetchEbEventsForSync,
  fetchHightribeBookingsList,
  fetchLumaBookingList,
  fetchLumaEventsForSync,
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
  return items.map((b) => ({
    id: b.id,
    email: b.email,
    name: b.name,
    event_title: b.eventTitle,
    registered_at: b.registeredAt,
    status: b.status,
    ticket_count: b.ticketCount,
  }))
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

/** Pull events + bookings from channel APIs and persist to MySQL. */
export async function syncChannelDataToDb(
  channel: ChannelKey,
): Promise<{ events: number; bookings: number }> {
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
  let bookingCount = 0

  if (events.length > 0) {
    eventCount = await syncStoredEvents(ch, events)
  }
  if (bookings.length > 0) {
    bookingCount = await syncStoredBookings(ch, bookingsToPayload(bookings))
  }

  return { events: eventCount, bookings: bookingCount }
}

/** Remove all cached events, bookings, and registry links for a channel. */
export { purgeChannelDataFromDb }
