'use client'

import { authHeader } from '@/lib/auth'
import type { AttendeeRecord, MasterEventRecord } from '@/lib/event-registry'
import { getStoredEvent, listAllStoredBookings, listStoredEvents, syncStoredBookings } from '@/lib/channel-events-store'
import { fetchLumaGuestsForEvent } from '@/lib/bookings'
import type { ChannelKey } from '@/lib/types'
import { CHANNEL_KEYS } from '@/lib/channels'

export interface EventDashboardData {
  title: string
  capacity: number
  attendees: AttendeeRecord[]
  channels: ChannelKey[]
  channelCounts: Partial<Record<ChannelKey, number>>
  registrations: number
  uniqueAttendees: number
  masterId: string | null
}

const DEFAULT_CAPACITY = 150

function isChannelKey(v: string): v is ChannelKey {
  return CHANNEL_KEYS.includes(v as ChannelKey)
}

async function fetchMasterEvent(channel: ChannelKey, eventId: string): Promise<MasterEventRecord | null> {
  const lookupRes = await fetch(
    `/api/registry?channel=${encodeURIComponent(channel)}&eventId=${encodeURIComponent(eventId)}`,
    { headers: { Authorization: authHeader(), Accept: 'application/json' } },
  )
  if (!lookupRes.ok) return null

  const lookup = await lookupRes.json() as { master?: { id: string } | null }
  if (!lookup.master?.id) return null

  const res = await fetch('/api/registry', {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ masterId: lookup.master.id }),
  })
  if (!res.ok) return null
  return res.json() as Promise<MasterEventRecord>
}

function bookingsToAttendees(
  bookings: Array<{ guest_email: string; guest_name: string; channel: ChannelKey; registered_at: string }>,
): AttendeeRecord[] {
  const seen = new Set<string>()
  const list: AttendeeRecord[] = []
  for (const b of bookings) {
    const email = b.guest_email.toLowerCase().trim()
    if (!email || seen.has(email)) continue
    seen.add(email)
    list.push({
      email,
      name: b.guest_name || email.split('@')[0] || 'Guest',
      source: b.channel,
      registeredAt: b.registered_at,
    })
  }
  return list
}

function countByChannel(attendees: AttendeeRecord[]): Partial<Record<ChannelKey, number>> {
  const counts: Partial<Record<ChannelKey, number>> = {}
  for (const a of attendees) {
    counts[a.source] = (counts[a.source] || 0) + 1
  }
  return counts
}

function filterStoredBookings(
  allBookings: Awaited<ReturnType<typeof listAllStoredBookings>>,
  channel: ChannelKey,
  eventId: string,
  title: string,
) {
  const normTitle = title.trim().toLowerCase()
  return allBookings.filter((b) => {
    if (b.channel !== channel) return false
    if (b.event_external_id && String(b.event_external_id) === String(eventId)) return true
    return b.event_title.trim().toLowerCase() === normTitle
  })
}

async function pullLumaGuestsLive(
  eventId: string,
  title: string,
  persist: boolean,
): Promise<Array<{ guest_email: string; guest_name: string; channel: ChannelKey; registered_at: string; ticket_count?: number | null }>> {
  let live = await fetchLumaGuestsForEvent(eventId, title)

  if (!live.length) {
    const normTitle = title.trim().toLowerCase()
    const events = await listStoredEvents('luma')
    for (const ev of events) {
      if (ev.external_id === eventId) continue
      if (ev.title.trim().toLowerCase() !== normTitle) continue
      live = await fetchLumaGuestsForEvent(ev.external_id, title)
      if (live.length) break
    }
  }

  if (!live.length) return []

  if (persist) {
    try {
      await syncStoredBookings('luma', live.map((g) => ({
        id: g.id,
        email: g.email,
        name: g.name,
        event_title: g.eventTitle,
        event_external_id: g.eventExternalId || eventId,
        registered_at: g.registeredAt,
        status: g.status,
        ticket_count: g.ticketCount,
      })))
    } catch {
      /* display live data even if cache write fails */
    }
  }

  return live.map((g) => ({
    guest_email: g.email,
    guest_name: g.name,
    channel: 'luma' as const,
    registered_at: g.registeredAt,
    ticket_count: g.ticketCount ?? 1,
  }))
}

export async function loadEventDashboardData(
  channel: ChannelKey,
  eventId: string,
  opts?: { refresh?: boolean },
): Promise<EventDashboardData> {
  const refresh = !!opts?.refresh
  const [stored, master, allBookings] = await Promise.all([
    getStoredEvent(channel, eventId),
    fetchMasterEvent(channel, eventId),
    listAllStoredBookings(),
  ])

  const title = master?.title || stored?.title || 'Untitled event'
  const capacity = master?.capacity || DEFAULT_CAPACITY

  const masterAttendees = master?.attendees || []
  if (master && masterAttendees.length > 0) {
    const channels = Object.keys(master.channels).filter(isChannelKey) as ChannelKey[]
    const registrations = master.sold || masterAttendees.length
    return {
      title,
      capacity,
      attendees: masterAttendees,
      channels: channels.length ? channels : [channel],
      channelCounts: countByChannel(masterAttendees),
      registrations,
      uniqueAttendees: masterAttendees.length,
      masterId: master.id,
    }
  }

  let eventBookings = filterStoredBookings(allBookings, channel, eventId, title)

  if (channel === 'luma' && (refresh || eventBookings.length === 0)) {
    const live = await pullLumaGuestsLive(eventId, title, refresh)
    if (live.length) {
      eventBookings = live
    }
  }

  const attendees = bookingsToAttendees(eventBookings)
  const registrations = eventBookings.reduce((sum, b) => sum + (b.ticket_count || 1), 0)

  return {
    title,
    capacity,
    attendees,
    channels: [channel],
    channelCounts: countByChannel(attendees),
    registrations,
    uniqueAttendees: attendees.length,
    masterId: master?.id || null,
  }
}
