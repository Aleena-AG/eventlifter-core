import { backendFetch } from '@/lib/backend-client'
import { unwrapApiData } from '@/lib/api-response'
import type { ChannelKey } from '@/lib/types'

type ChannelStats = {
  events: number
  tickets: number
  bookings: number
  revenue: number
  currency: string
  configured: boolean
}

type DashboardBooking = {
  name: string
  email: string
  channel: ChannelKey
  eventTitle: string
  registeredAt: string
}

type DashboardRecentEvent = {
  id: string
  title: string
  startUtc: string
  endUtc?: string | null
  coverUrl?: string | null
  status?: string | null
  channel: ChannelKey
  priceLabel: string
}

type DashboardBookingTrendPoint = {
  date: string
  count: number
  byChannel: Record<ChannelKey, number>
}

export type DerivedDashboardStats = {
  success: true
  derived: true
  channels: Record<ChannelKey, ChannelStats>
  totalEvents: number
  totalTickets: number
  totalBookings: number
  totalRevenue: number
  revenueCurrency: string
  unifiedAttendees: number
  recent: DashboardRecentEvent[]
  recentBookings: DashboardBooking[]
  bookingTrend: DashboardBookingTrendPoint[]
}

type StoredEvent = {
  external_id?: string
  title?: string
  start_at?: string | null
  end_at?: string | null
  cover_url?: string | null
  status?: string | null
}

type StoredBooking = {
  channel?: string
  guest_name?: string
  guest_email?: string
  event_title?: string
  registered_at?: string
  ticket_count?: number | null
  total_price?: number | null
  payload?: Record<string, unknown>
}

type MasterRow = {
  sold?: number
}

const CHANNELS: ChannelKey[] = ['hightribe', 'luma', 'eventbrite']

function emptyDayCounts(): Record<ChannelKey, number> {
  return { hightribe: 0, luma: 0, eventbrite: 0 }
}

function emptyTrend(days = 7): DashboardBookingTrendPoint[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const points: DashboardBookingTrendPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    points.push({
      date: d.toISOString().slice(0, 10),
      count: 0,
      byChannel: emptyDayCounts(),
    })
  }
  return points
}

async function fetchJson(
  path: string,
  authorization: string,
): Promise<unknown> {
  const res = await backendFetch(path, {
    headers: { Authorization: authorization },
  })
  if (!res.ok) return null
  return res.json().catch(() => null)
}

function asChannel(raw: unknown): ChannelKey | null {
  const s = String(raw || '')
  if (s === 'hightribe' || s === 'luma' || s === 'eventbrite') return s
  return null
}

function ticketCount(b: StoredBooking): number {
  if (typeof b.ticket_count === 'number' && b.ticket_count > 0) return b.ticket_count
  const payloadTickets = b.payload?.tickets
  if (Array.isArray(payloadTickets) && payloadTickets.length) {
    return payloadTickets.reduce((s: number, t: unknown) => {
      const q = t && typeof t === 'object' ? Number((t as { quantity?: unknown }).quantity) : 1
      return s + (Number.isFinite(q) && q > 0 ? q : 1)
    }, 0) || 1
  }
  return 1
}

/**
 * Build dashboard KPIs from existing v1 APIs when /dashboard/stats is missing:
 * bookings + registry + per-channel events.
 */
export async function deriveDashboardStatsFromApis(
  authorization: string,
): Promise<DerivedDashboardStats> {
  const auth = authorization.trim()
  const [bookingsRaw, registryRaw, settingsRaw, ...channelRaws] = await Promise.all([
    fetchJson('events/bookings', auth),
    fetchJson('registry', auth),
    fetchJson('settings', auth),
    ...CHANNELS.map((ch) => fetchJson(`events/${ch}`, auth)),
  ])

  const settingsData = unwrapApiData<{
    luma?: { configured?: boolean }
    eventbrite?: { configured?: boolean }
    hightribe?: { configured?: boolean }
  }>(settingsRaw)
  const configured: Record<ChannelKey, boolean> = {
    hightribe: settingsData.hightribe?.configured === true,
    luma: settingsData.luma?.configured === true,
    eventbrite: settingsData.eventbrite?.configured === true,
  }

  const bookingsData = unwrapApiData<{ bookings?: StoredBooking[] } | StoredBooking[]>(bookingsRaw)
  const bookings: StoredBooking[] = Array.isArray(bookingsData)
    ? bookingsData
    : (bookingsData.bookings || [])

  const registryData = unwrapApiData<{ events?: MasterRow[] } | MasterRow[]>(registryRaw)
  const masters: MasterRow[] = Array.isArray(registryData)
    ? registryData
    : (registryData.events || [])

  const eventsByChannel = CHANNELS.map((ch, i) => {
    const raw = unwrapApiData<{ events?: StoredEvent[] } | StoredEvent[]>(channelRaws[i])
    const events: StoredEvent[] = Array.isArray(raw) ? raw : (raw.events || [])
    return { channel: ch, events }
  })

  const bookingsByChannel: Record<ChannelKey, StoredBooking[]> = {
    hightribe: [],
    luma: [],
    eventbrite: [],
  }
  for (const b of bookings) {
    const ch = asChannel(b.channel)
    if (ch) bookingsByChannel[ch].push(b)
  }

  const registrySold = masters.reduce((s, m) => s + (Number(m.sold) || 0), 0)
  const ticketsFromBookings = bookings.reduce((s, b) => s + ticketCount(b), 0)
  const totalTickets = registrySold > 0 ? registrySold : ticketsFromBookings

  let totalRevenue = 0
  const revenueByChannel = emptyDayCounts()
  for (const b of bookings) {
    const price =
      typeof b.total_price === 'number'
        ? b.total_price
        : typeof b.payload?.total_price === 'number'
          ? Number(b.payload.total_price)
          : 0
    if (price <= 0) continue
    totalRevenue += price
    const ch = asChannel(b.channel)
    if (ch) revenueByChannel[ch] += price
  }

  const uniqueEmails = new Set(
    bookings
      .map((b) => String(b.guest_email || '').trim().toLowerCase())
      .filter((e) => e && e !== '—'),
  )

  const channels = {} as Record<ChannelKey, ChannelStats>
  for (const { channel, events } of eventsByChannel) {
    const chBookings = bookingsByChannel[channel]
    channels[channel] = {
      events: events.length,
      bookings: chBookings.length,
      tickets: chBookings.reduce((s, b) => s + ticketCount(b), 0),
      revenue: Math.round(revenueByChannel[channel] * 100) / 100,
      currency: 'USD',
      configured: configured[channel],
    }
  }

  const recent = eventsByChannel
    .flatMap(({ channel, events }) =>
      events.map((row) => ({
        id: String(row.external_id || ''),
        title: row.title || 'Untitled',
        startUtc: row.start_at || new Date().toISOString(),
        endUtc: row.end_at,
        coverUrl: row.cover_url,
        status: row.status,
        channel,
        priceLabel: '',
      })),
    )
    .filter((e) => e.id)
    .sort((a, b) => new Date(b.startUtc).getTime() - new Date(a.startUtc).getTime())
    .slice(0, 60)

  const sortedBookings = [...bookings].sort(
    (a, b) =>
      new Date(String(b.registered_at || 0)).getTime()
      - new Date(String(a.registered_at || 0)).getTime(),
  )

  const recentBookings: DashboardBooking[] = sortedBookings.slice(0, 20).map((b) => ({
    name: String(b.guest_name || 'Guest'),
    email: String(b.guest_email || ''),
    channel: asChannel(b.channel) || 'hightribe',
    eventTitle: String(b.event_title || 'Event'),
    registeredAt: String(b.registered_at || new Date().toISOString()),
  }))

  const bookingTrend = emptyTrend(7)
  const byDate = new Map(bookingTrend.map((p) => [p.date, p]))
  for (const b of bookings) {
    const day = String(b.registered_at || '').slice(0, 10)
    const point = byDate.get(day)
    if (!point) continue
    point.count += 1
    const ch = asChannel(b.channel)
    if (ch) point.byChannel[ch] += 1
  }

  const totalEvents = CHANNELS.reduce((s, ch) => s + channels[ch].events, 0)

  return {
    success: true,
    derived: true,
    channels,
    totalEvents,
    totalTickets,
    totalBookings: bookings.length,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    revenueCurrency: 'USD',
    unifiedAttendees: uniqueEmails.size,
    recent,
    recentBookings,
    bookingTrend,
  }
}
