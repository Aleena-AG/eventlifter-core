'use client'

import { getUser } from '@/lib/auth'
import { channelFetch } from '@/lib/channel-fetch'
import { fetchHtBookingsPage } from '@/lib/hightribe-events'
import { lumaHostedEventRef } from '@/lib/luma-event-utils'
import type { ChannelKey } from '@/lib/types'

export interface BookingListItem {
  id: string
  name: string
  email: string
  channel: ChannelKey
  eventTitle: string
  registeredAt: string
  status?: string
  ticketCount?: number
  source: 'webhook' | 'api'
}

function optStr(v: unknown): string | undefined {
  const s = v != null ? String(v).trim() : ''
  return s || undefined
}

function bookingsFromRegistry(events: Array<{
  title?: string
  attendees?: Array<{ source: ChannelKey; email: string; name?: string; registeredAt?: string }>
}>): BookingListItem[] {
  const list: BookingListItem[] = []
  for (const m of events) {
    for (const a of m.attendees || []) {
      list.push({
        id: `webhook-${a.email}-${a.registeredAt || m.title}`,
        name: a.name || a.email.split('@')[0] || 'Guest',
        email: a.email,
        channel: a.source,
        eventTitle: m.title || 'Untitled',
        registeredAt: a.registeredAt || new Date().toISOString(),
        source: 'webhook',
      })
    }
  }
  return list
}

function normalizeHtBooking(raw: Record<string, unknown>): BookingListItem {
  const user = raw.user as Record<string, unknown> | undefined
  const email = String(user?.email || raw.email || raw.phone || '—')
  const registeredAt = String(raw.booking_date || raw.created_at || new Date().toISOString())
  return {
    id: `ht-${raw.id ?? registeredAt}`,
    name: String(raw.guest_name || user?.name || 'Guest'),
    email,
    channel: 'hightribe',
    eventTitle: String(raw.title || 'Event'),
    registeredAt,
    status: raw.status ? String(raw.status) : undefined,
    ticketCount: typeof raw.ticket_count === 'number' ? raw.ticket_count : undefined,
    source: 'api',
  }
}

function normalizeEbAttendee(
  raw: Record<string, unknown>,
  eventTitle: string,
): BookingListItem | null {
  const profile = raw.profile as Record<string, unknown> | undefined
  const email = optStr(profile?.email) || optStr(raw.email)
  if (!email) return null
  const first = optStr(profile?.first_name)
  const last = optStr(profile?.last_name)
  const name = optStr(profile?.name) || [first, last].filter(Boolean).join(' ') || email.split('@')[0] || 'Guest'
  const registeredAt = String(raw.created || raw.changed || new Date().toISOString())
  return {
    id: `eb-${raw.id ?? email}-${registeredAt}`,
    name,
    email,
    channel: 'eventbrite',
    eventTitle,
    registeredAt,
    status: optStr(raw.status),
    source: 'api',
  }
}

function normalizeLumaGuest(
  raw: Record<string, unknown>,
  eventTitle: string,
): BookingListItem | null {
  const guest = (raw.guest || raw.user) as Record<string, unknown> | undefined
  const email = optStr(guest?.email) || optStr(raw.email) || optStr(raw.user_email)
  if (!email) return null
  const name = optStr(guest?.name) || optStr(raw.name) || optStr(raw.user_name) || email.split('@')[0] || 'Guest'
  const registeredAt = String(
    raw.registered_at || raw.created_at || raw.approval_status_at || new Date().toISOString(),
  )
  return {
    id: `luma-${raw.api_id || raw.id || email}-${registeredAt}`,
    name,
    email,
    channel: 'luma',
    eventTitle,
    registeredAt,
    status: optStr(raw.approval_status) || optStr(raw.registration_status),
    source: 'api',
  }
}

function dedupeBookings(items: BookingListItem[]): BookingListItem[] {
  const seen = new Set<string>()
  const out: BookingListItem[] = []
  for (const b of items) {
    const key = `${b.email.toLowerCase()}|${b.eventTitle.toLowerCase()}|${b.channel}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(b)
  }
  return out
}

async function fetchAllHtBookings(): Promise<BookingListItem[]> {
  const list: BookingListItem[] = []
  let page = 1
  let lastPage = 1

  while (page <= lastPage && page <= 20) {
    const res = await fetchHtBookingsPage(page, 50)
    for (const raw of res.bookings) {
      if (raw && typeof raw === 'object') {
        list.push(normalizeHtBooking(raw as Record<string, unknown>))
      }
    }
    lastPage = res.lastPage
    page++
  }

  return list
}

export async function fetchEbBookingList(
  events: Array<{ id: string; name?: { text?: string } | string }>,
): Promise<BookingListItem[]> {
  const list: BookingListItem[] = []

  await Promise.all(events.map(async (e) => {
    const eventTitle = typeof e.name === 'string' ? e.name : (e.name?.text || 'Untitled')
    try {
      let page = 1
      let hasMore = true
      while (hasMore && page <= 5) {
        const res = await channelFetch(
          `/api/eventbrite/events/${e.id}/attendees?status=attending&page=${page}&page_size=50`,
        )
        if (!res.ok) break
        const data = await res.json() as {
          attendees?: Array<Record<string, unknown>>
          pagination?: { has_more_items?: boolean }
        }
        for (const raw of data.attendees || []) {
          const item = normalizeEbAttendee(raw, eventTitle)
          if (item) list.push(item)
        }
        hasMore = !!data.pagination?.has_more_items
        page++
      }
    } catch {
      // skip event
    }
  }))

  return list
}

export async function fetchLumaBookingList(
  events: Array<{ api_id: string; name: string }>,
): Promise<BookingListItem[]> {
  const list: BookingListItem[] = []

  await Promise.all(events.map(async (e) => {
    try {
      const res = await channelFetch(`/api/luma/guests?event_id=${encodeURIComponent(e.api_id)}`)
      if (!res.ok) return
      const raw = await res.json() as {
        data?: { entries?: Array<Record<string, unknown>> }
        entries?: Array<Record<string, unknown>>
      }
      const d = raw.data || raw
      const entries = d.entries || raw.entries || []
      for (const entry of entries) {
        const item = normalizeLumaGuest(entry, e.name)
        if (item) list.push(item)
      }
    } catch {
      // skip event
    }
  }))

  return list
}

async function fetchEbEvents(): Promise<Array<{ id: string; name?: { text?: string } }>> {
  const orgRes = await channelFetch('/api/eventbrite/users/me/organizations')
  if (!orgRes.ok) return []
  const orgData = await orgRes.json() as { organizations?: Array<{ id: string }> }
  const orgId = orgData.organizations?.[0]?.id
  if (!orgId) return []
  const evtRes = await channelFetch(`/api/eventbrite/organizations/${orgId}/events?page_size=50`)
  if (!evtRes.ok) return []
  const evtData = await evtRes.json() as { events?: Array<{ id: string; name?: { text?: string } }> }
  return evtData.events || []
}

async function fetchLumaEvents(): Promise<Array<{ api_id: string; name: string }>> {
  const res = await channelFetch('/api/luma/events/hosted?upcoming_only=false&fetch_all=true')
  if (!res.ok) return []
  const raw = await res.json() as { data?: { entries?: unknown[] }; entries?: unknown[] }
  const entries = raw.data?.entries || raw.entries || []
  return entries.map((entry: unknown) => {
    const ref = lumaHostedEventRef(entry)
    return { api_id: ref.id, name: ref.name }
  }).filter(ev => ev.api_id)
}

export async function loadAllBookings(opts?: {
  ebConfigured?: boolean
  lumaConfigured?: boolean
  ebEvents?: Array<{ id: string; name?: { text?: string } }>
  lumaEvents?: Array<{ api_id: string; name: string }>
}): Promise<BookingListItem[]> {
  const ebConfigured = !!opts?.ebConfigured
  const lumaConfigured = !!opts?.lumaConfigured

  const registryPromise = fetch('/api/registry')
    .then(r => r.json())
    .catch(() => ({ events: [] })) as Promise<{ events?: Array<{
      title?: string
      attendees?: Array<{ source: ChannelKey; email: string; name?: string; registeredAt?: string }>
    }> }>

  const htPromise = getUser()
    ? fetchAllHtBookings().catch(() => [])
    : Promise.resolve([])

  const ebPromise = ebConfigured
    ? (async () => {
        const events = opts?.ebEvents?.length ? opts.ebEvents : await fetchEbEvents()
        return events.length ? fetchEbBookingList(events) : []
      })().catch(() => [])
    : Promise.resolve([])

  const lumaPromise = lumaConfigured
    ? (async () => {
        const events = opts?.lumaEvents?.length ? opts.lumaEvents : await fetchLumaEvents()
        return events.length ? fetchLumaBookingList(events) : []
      })().catch(() => [])
    : Promise.resolve([])

  const [registryData, htBookings, ebBookings, lumaBookings] = await Promise.all([
    registryPromise, htPromise, ebPromise, lumaPromise,
  ])

  const webhookBookings = bookingsFromRegistry(registryData.events || [])
  const combined = dedupeBookings([...webhookBookings, ...htBookings, ...ebBookings, ...lumaBookings])
  combined.sort((a, b) => new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime())
  return combined
}
