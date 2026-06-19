'use client'

import { authHeader, getUser } from '@/lib/auth'
import { fetchHtEventsPage, fetchHtHostStats } from '@/lib/hightribe-events'
import type { ChannelKey } from '@/lib/types'

export interface ChannelStats {
  events: number
  tickets: number
  bookings: number
  configured: boolean
}

export interface DashboardBooking {
  name: string
  email: string
  channel: ChannelKey
  eventTitle: string
  registeredAt: string
}

export interface DashboardRecentEvent {
  id: string
  title: string
  startUtc: string
  channel: ChannelKey
  priceLabel: string
}

export interface DashboardStats {
  channels: Record<ChannelKey, ChannelStats>
  totalEvents: number
  totalTickets: number
  totalBookings: number
  unifiedAttendees: number
  recent: DashboardRecentEvent[]
  recentBookings: DashboardBooking[]
}

function registryByChannel(events: Array<{ attendees?: Array<{ source: ChannelKey; email: string }> }>) {
  const byChannel: Record<ChannelKey, number> = { hightribe: 0, luma: 0, eventbrite: 0 }
  const seen = new Set<string>()
  for (const m of events) {
    for (const a of m.attendees || []) {
      byChannel[a.source] = (byChannel[a.source] || 0) + 1
      seen.add(a.email.toLowerCase())
    }
  }
  return { byChannel, unified: seen.size, total: Object.values(byChannel).reduce((s, n) => s + n, 0) }
}

function bookingsFromRegistry(events: Array<{
  title?: string
  attendees?: Array<{ source: ChannelKey; email: string; name?: string; registeredAt?: string }>
}>) {
  const byChannel: Record<ChannelKey, number> = { hightribe: 0, luma: 0, eventbrite: 0 }
  const recent: DashboardBooking[] = []
  for (const m of events) {
    for (const a of m.attendees || []) {
      byChannel[a.source] = (byChannel[a.source] || 0) + 1
      recent.push({
        name: a.name || a.email.split('@')[0] || 'Guest',
        email: a.email,
        channel: a.source,
        eventTitle: m.title || 'Untitled',
        registeredAt: a.registeredAt || new Date().toISOString(),
      })
    }
  }
  recent.sort((a, b) => new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime())
  return { byChannel, recent }
}

function pickCount(apiCount: number, registryCount: number): number {
  return Math.max(apiCount, registryCount)
}

function ticketSoldFromRecord(t: Record<string, unknown>): number {
  for (const k of ['sold', 'sold_quantity', 'quantity_sold', 'booked']) {
    const n = Number(t[k])
    if (Number.isFinite(n) && n >= 0) return n
  }
  const qty = Number(t.quantity)
  const avail = Number(t.available ?? t.remaining ?? t.quantity_available)
  if (Number.isFinite(qty) && Number.isFinite(avail) && qty >= avail) return qty - avail
  return 0
}

async function fetchEbTicketsSold(events: Array<{ id: string }>): Promise<number> {
  const counts = await Promise.all(events.map(async (e) => {
    try {
      const res = await fetch(`/api/eventbrite/events/${e.id}/ticket_classes`)
      if (!res.ok) return 0
      const data = await res.json() as { ticket_classes?: Array<{ quantity_sold?: number }> }
      return (data.ticket_classes || []).reduce((s, tc) => s + (tc.quantity_sold || 0), 0)
    } catch {
      return 0
    }
  }))
  return counts.reduce((s, n) => s + n, 0)
}

async function fetchLumaBookings(events: Array<{ api_id: string }>): Promise<number> {
  const counts = await Promise.all(events.map(async (e) => {
    try {
      const res = await fetch(`/api/luma/guests?event_api_id=${encodeURIComponent(e.api_id)}`)
      if (!res.ok) return 0
      const raw = await res.json() as {
        data?: { entries?: unknown[]; count?: number; total?: number }
        entries?: unknown[]
        count?: number
        total?: number
      }
      const d = raw.data || raw
      if (typeof d.total === 'number') return d.total
      if (typeof d.count === 'number') return d.count
      return (d.entries || raw.entries || []).length
    } catch {
      return 0
    }
  }))
  return counts.reduce((s, n) => s + n, 0)
}

async function fetchLumaTicketsSold(events: Array<{ api_id: string }>): Promise<number> {
  const counts = await Promise.all(events.map(async (e) => {
    try {
      const res = await fetch(`/api/luma/ticket-types?event_api_id=${encodeURIComponent(e.api_id)}`)
      if (!res.ok) return 0
      const raw = await res.json() as {
        data?: { entries?: Array<Record<string, unknown>>; ticket_types?: Array<Record<string, unknown>> }
        entries?: Array<Record<string, unknown>>
        ticket_types?: Array<Record<string, unknown>>
      }
      const d = raw.data || raw
      const entries = d.entries || d.ticket_types || raw.entries || raw.ticket_types || []
      if (!entries.length) return 0
      return entries.reduce((s, t) => s + ticketSoldFromRecord(t), 0)
    } catch {
      return 0
    }
  }))
  return counts.reduce((s, n) => s + n, 0)
}

async function fetchEbBookings(events: Array<{ id: string }>): Promise<number> {
  const counts = await Promise.all(events.map(async (e) => {
    try {
      let total = 0
      let page = 1
      let hasMore = true
      while (hasMore && page <= 5) {
        const res = await fetch(
          `/api/eventbrite/events/${e.id}/attendees?status=attending&page=${page}&page_size=200`,
        )
        if (!res.ok) break
        const data = await res.json() as {
          attendees?: unknown[]
          pagination?: { has_more_items?: boolean }
        }
        total += (data.attendees || []).length
        hasMore = !!data.pagination?.has_more_items
        page++
      }
      return total
    } catch {
      return 0
    }
  }))
  return counts.reduce((s, n) => s + n, 0)
}

export async function loadDashboardStats(settings: {
  luma?: { configured?: boolean }
  eventbrite?: { configured?: boolean; hasPrivateToken?: boolean }
}): Promise<DashboardStats> {
  const htUser = getUser()
  const htConfigured = !!htUser
  const lumaConfigured = !!settings.luma?.configured
  const ebConfigured = !!(settings.eventbrite?.configured || settings.eventbrite?.hasPrivateToken)

  const channels: Record<ChannelKey, ChannelStats> = {
    hightribe: { events: 0, tickets: 0, bookings: 0, configured: htConfigured },
    luma: { events: 0, tickets: 0, bookings: 0, configured: lumaConfigured },
    eventbrite: { events: 0, tickets: 0, bookings: 0, configured: ebConfigured },
  }

  const recent: DashboardRecentEvent[] = []

  const registryPromise = fetch('/api/registry')
    .then(r => r.json())
    .catch(() => ({ events: [] })) as Promise<{ events?: Array<{
      title?: string
      attendees?: Array<{ source: ChannelKey; email: string; name?: string; registeredAt?: string }>
    }> }>

  const htPromise = htConfigured
    ? fetchHtEventsPage(1, 12)
      .then(({ events, total }) => ({ events, total }))
      .catch(() => ({ events: [], total: 0 }))
    : Promise.resolve({ events: [], total: 0 })

  const htStatsPromise = htConfigured
    ? fetchHtHostStats().catch(() => ({ totalBookings: 0, ticketsSold: 0 }))
    : Promise.resolve({ totalBookings: 0, ticketsSold: 0 })

  const lumaPromise = lumaConfigured
    ? fetch('/api/luma/events/hosted?upcoming_only=false&fetch_all=true', { headers: { Authorization: authHeader() } })
      .then(async (res) => {
        if (!res.ok) return []
        const raw = await res.json() as { data?: { entries?: unknown[] }; entries?: unknown[] }
        const entries = raw.data?.entries || raw.entries || []
        return entries.map((e: unknown) => {
          const entry = e as Record<string, unknown>
          const ev = (entry.event || entry) as Record<string, unknown>
          return {
            api_id: String(ev.id || ev.api_id || entry.id || ''),
            name: String(ev.name || entry.name || 'Untitled'),
            start_at: String(ev.start_at || entry.start_at || ''),
          }
        }).filter((ev: { api_id: string }) => ev.api_id)
      })
      .catch(() => [])
    : Promise.resolve([])

  const ebPromise = ebConfigured
    ? (async () => {
        const orgRes = await fetch('/api/eventbrite/users/me/organizations')
        if (!orgRes.ok) return []
        const orgData = await orgRes.json() as { organizations?: Array<{ id: string }> }
        const orgId = orgData.organizations?.[0]?.id
        if (!orgId) return []
        const evtRes = await fetch(`/api/eventbrite/organizations/${orgId}/events?page_size=100`)
        if (!evtRes.ok) return []
        const evtData = await evtRes.json() as { events?: Array<{ id: string; name?: { text?: string }; start?: { utc?: string }; is_free?: boolean }> }
        return evtData.events || []
      })()
    : Promise.resolve([])

  const [registryData, htResult, htStats, lumaEvents, ebEvents] = await Promise.all([
    registryPromise, htPromise, htStatsPromise, lumaPromise, ebPromise,
  ])
  const htEvents = htResult.events

  channels.hightribe.events = htResult.total
  channels.luma.events = lumaEvents.length
  channels.eventbrite.events = ebEvents.length

  const registryStats = registryByChannel(registryData.events || [])
  const bookingStats = bookingsFromRegistry(registryData.events || [])

  const [lumaTickets, ebTickets, lumaBookings, ebBookings] = await Promise.all([
    lumaConfigured && lumaEvents.length ? fetchLumaTicketsSold(lumaEvents) : Promise.resolve(0),
    ebConfigured && ebEvents.length ? fetchEbTicketsSold(ebEvents) : Promise.resolve(0),
    lumaConfigured && lumaEvents.length ? fetchLumaBookings(lumaEvents) : Promise.resolve(0),
    ebConfigured && ebEvents.length ? fetchEbBookings(ebEvents) : Promise.resolve(0),
  ])

  channels.hightribe.tickets = htStats.ticketsSold
  channels.luma.tickets = lumaTickets
  channels.eventbrite.tickets = ebTickets

  channels.hightribe.bookings = pickCount(htStats.totalBookings, bookingStats.byChannel.hightribe)
  channels.luma.bookings = pickCount(lumaBookings, bookingStats.byChannel.luma)
  channels.eventbrite.bookings = pickCount(ebBookings, bookingStats.byChannel.eventbrite)

  for (const e of htEvents) {
    const start = e.dates?.starts_at || (e.dates?.start_date ? `${e.dates.start_date}T${e.dates.start_time || '00:00'}` : '')
    recent.push({
      id: String(e.id),
      title: e.title,
      startUtc: start || new Date().toISOString(),
      channel: 'hightribe',
      priceLabel: 'HighTribe',
    })
  }
  for (const e of lumaEvents) {
    recent.push({
      id: e.api_id,
      title: e.name,
      startUtc: e.start_at || new Date().toISOString(),
      channel: 'luma',
      priceLabel: 'Luma',
    })
  }
  for (const e of ebEvents) {
    recent.push({
      id: e.id,
      title: e.name?.text || 'Untitled',
      startUtc: e.start?.utc || new Date().toISOString(),
      channel: 'eventbrite',
      priceLabel: e.is_free ? 'Free' : 'Eventbrite',
    })
  }

  recent.sort((a, b) => new Date(b.startUtc).getTime() - new Date(a.startUtc).getTime())

  const totalTickets =
    channels.hightribe.tickets + channels.luma.tickets + channels.eventbrite.tickets
  const totalBookings =
    channels.hightribe.bookings + channels.luma.bookings + channels.eventbrite.bookings

  return {
    channels,
    totalEvents: channels.hightribe.events + channels.luma.events + channels.eventbrite.events,
    totalTickets,
    totalBookings,
    unifiedAttendees: registryStats.unified || totalBookings,
    recent: recent.slice(0, 5),
    recentBookings: bookingStats.recent.slice(0, 8),
  }
}
