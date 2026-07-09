import type { RowDataPacket } from 'mysql2'
import { useDatabase } from '../config'
import { query } from '../db/pool'
import { localListBookings, localListEvents } from '../db/local-store'
import type { ChannelName } from './events'

export interface DashboardChannelStats {
  events: number
  bookings: number
  tickets: number
  /** Estimated / reported revenue for this channel. */
  revenue: number
  currency: string
}

export interface DashboardEventItem {
  id: string
  title: string
  startUtc: string
  endUtc: string | null
  coverUrl: string | null
  status: string | null
  channel: ChannelName
  priceLabel: string
}

export interface DashboardBookingTrendPoint {
  date: string
  count: number
  byChannel: Record<ChannelName, number>
}

export interface DashboardStatsPayload {
  channels: Record<ChannelName, DashboardChannelStats>
  totalEvents: number
  totalBookings: number
  totalTickets: number
  totalRevenue: number
  revenueCurrency: string
  unifiedAttendees: number
  recent: DashboardEventItem[]
  recentBookings: Array<{
    name: string
    email: string
    channel: ChannelName
    eventTitle: string
    registeredAt: string
  }>
  bookingTrend: DashboardBookingTrendPoint[]
}

const CHANNELS: ChannelName[] = ['hightribe', 'luma', 'eventbrite']

const EVENT_TABLE: Record<ChannelName, string> = {
  hightribe: 'hightribe_events',
  luma: 'luma_events',
  eventbrite: 'eventbrite_events',
}

function priceLabelFor(channel: ChannelName, isFree: unknown): string {
  if (channel === 'hightribe') return 'Hightribe'
  if (channel === 'luma') return 'Luma'
  return isFree ? 'Free' : 'Eventbrite'
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function parseMoney(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function parseEbCost(raw: unknown): number {
  if (raw == null) return 0
  const str = String(raw)
  const minorMatch = str.match(/(\d+)\s*$/)
  if (minorMatch && /[A-Z]{3}/i.test(str)) {
    return parseInt(minorMatch[1], 10) / 100
  }
  const major = parseMoney(raw)
  if (major == null) return 0
  return major > 1000 ? major / 100 : major
}

/** Pull amount + currency from a stored booking payload (channel-specific shapes). */
function revenueFromBookingPayload(
  channel: ChannelName,
  payload: Record<string, unknown>,
  ticketCount: number,
): { amount: number; currency: string | null } {
  if (channel === 'hightribe') {
    const amount = parseMoney(payload.total_price ?? payload.totalPrice ?? payload.amount) ?? 0
    const currency = payload.currency != null ? String(payload.currency) : null
    return { amount: Math.max(0, amount), currency }
  }

  if (channel === 'eventbrite') {
    const costs = asRecord(payload.costs)
    const gross = asRecord(costs?.gross)
    const major = parseMoney(gross?.major_value ?? costs?.gross)
    if (major != null) {
      return {
        amount: Math.max(0, major),
        currency: String(gross?.currency || payload.currency || 'USD'),
      }
    }
    const order = asRecord(payload.order) || asRecord(payload.barcodes && asRecord((payload.barcodes as unknown[])?.[0]))
    const orderCosts = asRecord(order?.costs)
    const orderGross = asRecord(orderCosts?.gross)
    const orderMajor = parseMoney(orderGross?.major_value)
    if (orderMajor != null) {
      return {
        amount: Math.max(0, orderMajor),
        currency: String(orderGross?.currency || 'USD'),
      }
    }
    return { amount: 0, currency: payload.currency != null ? String(payload.currency) : null }
  }

  if (channel === 'luma') {
    const cents = parseMoney(
      payload.amount_cents ?? payload.price_cents ?? payload.cents ?? asRecord(payload.payment)?.amount_cents,
    )
    if (cents != null) {
      return {
        amount: Math.max(0, cents / 100),
        currency: String(payload.currency || asRecord(payload.payment)?.currency || 'USD'),
      }
    }
    const major = parseMoney(payload.amount ?? payload.price ?? payload.total_price)
    return {
      amount: Math.max(0, major ?? 0),
      currency: payload.currency != null ? String(payload.currency) : null,
    }
  }

  return { amount: 0, currency: null }
}

/** Unit ticket price from a stored event payload — used when booking has no amount. */
function unitPriceFromEventPayload(
  channel: ChannelName,
  payload: Record<string, unknown>,
): { price: number; currency: string; isFree: boolean } {
  if (channel === 'hightribe') {
    const root = asRecord(payload.data) || payload
    const tickets = Array.isArray(root.tickets)
      ? root.tickets
      : Array.isArray(payload.tickets)
        ? payload.tickets
        : []
    const ticket = asRecord(tickets[0])
    const price = Math.max(0, parseMoney(ticket?.price) ?? 0)
    return {
      price,
      currency: String(ticket?.currency || root.currency || 'USD'),
      isFree: price <= 0,
    }
  }

  if (channel === 'eventbrite') {
    const currency = String(payload.currency || 'USD').toUpperCase()
    if (payload.is_free === true) return { price: 0, currency, isFree: true }
    const ticketClasses = Array.isArray(payload.ticket_classes)
      ? payload.ticket_classes
      : Array.isArray(payload.ticket_class)
        ? payload.ticket_class
        : []
    const paid = ticketClasses.map((t) => asRecord(t)).find((t) => t && !t.free && (t.cost != null || t.actual_cost != null))
    if (paid) {
      const price = parseEbCost(paid.cost ?? paid.actual_cost)
      return { price: Math.max(0, price), currency, isFree: price <= 0 }
    }
    return { price: 0, currency, isFree: !!payload.is_free }
  }

  if (channel === 'luma') {
    const event = asRecord(payload.event) || payload
    const ticketTypes = Array.isArray(event.ticket_types)
      ? event.ticket_types
      : Array.isArray(payload.ticket_types)
        ? payload.ticket_types
        : []
    const first = asRecord(ticketTypes[0])
    const cents = parseMoney(first?.cents ?? first?.price_cents ?? first?.amount_cents)
    const major = parseMoney(first?.price ?? first?.amount)
    let price = 0
    if (cents != null) price = cents / 100
    else if (major != null) price = major
    const isFree = price <= 0 || !!first?.is_free || String(first?.type || '').toLowerCase() === 'free'
    return {
      price: isFree ? 0 : Math.max(0, price),
      currency: String(first?.currency || event.currency || 'USD'),
      isFree,
    }
  }

  return { price: 0, currency: 'USD', isFree: false }
}

function emptyChannelStats(): DashboardChannelStats {
  return { events: 0, bookings: 0, tickets: 0, revenue: 0, currency: 'USD' }
}

function mapEventRow(row: {
  external_id: string
  title: string | null
  start_at: string | Date | null
  end_at?: string | Date | null
  cover_url?: string | null
  status?: string | null
  channel: ChannelName
  is_free?: unknown
}): DashboardEventItem {
  return {
    id: String(row.external_id),
    title: String(row.title || 'Untitled'),
    startUtc: row.start_at
      ? new Date(row.start_at as Date).toISOString()
      : new Date().toISOString(),
    endUtc: row.end_at ? new Date(row.end_at as Date).toISOString() : null,
    coverUrl: row.cover_url ? String(row.cover_url) : null,
    status: row.status ? String(row.status) : null,
    channel: row.channel,
    priceLabel: priceLabelFor(row.channel, row.is_free),
  }
}

function emptyChannelDayCounts(): Record<ChannelName, number> {
  return { hightribe: 0, luma: 0, eventbrite: 0 }
}

function buildBookingTrend(
  bookings: Array<{ registered_at: string; channel?: ChannelName }>,
  days = 7,
): DashboardBookingTrendPoint[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const points: DashboardBookingTrendPoint[] = []
  const byDay = new Map<string, Record<ChannelName, number>>()

  for (const b of bookings) {
    const d = new Date(b.registered_at)
    if (Number.isNaN(d.getTime())) continue
    d.setHours(0, 0, 0, 0)
    const key = d.toISOString().slice(0, 10)
    const row = byDay.get(key) || emptyChannelDayCounts()
    const ch = b.channel && CHANNELS.includes(b.channel) ? b.channel : null
    if (ch) row[ch] += 1
    byDay.set(key, row)
  }

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const byChannel = byDay.get(key) || emptyChannelDayCounts()
    const count = CHANNELS.reduce((sum, ch) => sum + byChannel[ch], 0)
    points.push({ date: key, count, byChannel })
  }
  return points
}

function applyBookingRevenue(
  channels: Record<ChannelName, DashboardChannelStats>,
  channel: ChannelName,
  ticketCount: number,
  payload: Record<string, unknown>,
  eventPriceByKey: Map<string, { price: number; currency: string; isFree: boolean }>,
  eventExternalId: string | null,
  eventTitle: string,
) {
  channels[channel].bookings += 1
  channels[channel].tickets += ticketCount

  const fromPayload = revenueFromBookingPayload(channel, payload, ticketCount)
  let amount = fromPayload.amount
  let currency = fromPayload.currency

  if (amount <= 0) {
    const byId = eventExternalId
      ? eventPriceByKey.get(`${channel}:id:${eventExternalId}`)
      : undefined
    const byTitle = eventPriceByKey.get(`${channel}:title:${eventTitle.trim().toLowerCase()}`)
    const pricing = byId || byTitle
    if (pricing && !pricing.isFree && pricing.price > 0) {
      amount = pricing.price * ticketCount
      currency = pricing.currency
    }
  }

  if (currency) channels[channel].currency = currency.toUpperCase()
  channels[channel].revenue = Math.round((channels[channel].revenue + Math.max(0, amount)) * 100) / 100
}

function summarizeTotals(channels: Record<ChannelName, DashboardChannelStats>) {
  const totalEvents = CHANNELS.reduce((sum, ch) => sum + channels[ch].events, 0)
  const totalBookings = CHANNELS.reduce((sum, ch) => sum + channels[ch].bookings, 0)
  const totalTickets = CHANNELS.reduce((sum, ch) => sum + channels[ch].tickets, 0)
  const totalRevenue =
    Math.round(CHANNELS.reduce((sum, ch) => sum + channels[ch].revenue, 0) * 100) / 100
  // Dashboard revenue is always shown in USD (no multi-currency mixing).
  return { totalEvents, totalBookings, totalTickets, totalRevenue, revenueCurrency: 'USD' }
}

export async function getDashboardStatsForUser(userId: number): Promise<DashboardStatsPayload> {
  const channels: Record<ChannelName, DashboardChannelStats> = {
    hightribe: emptyChannelStats(),
    luma: emptyChannelStats(),
    eventbrite: emptyChannelStats(),
  }

  if (!useDatabase()) {
    const eventPriceByKey = new Map<string, { price: number; currency: string; isFree: boolean }>()
    for (const ch of CHANNELS) {
      const events = localListEvents(ch, userId)
      channels[ch].events = events.length
      for (const row of events) {
        const pricing = unitPriceFromEventPayload(ch, row.payload_json || {})
        eventPriceByKey.set(`${ch}:id:${row.external_id}`, pricing)
        eventPriceByKey.set(`${ch}:title:${String(row.title || '').trim().toLowerCase()}`, pricing)
        if (pricing.currency) channels[ch].currency = pricing.currency
      }
    }

    const bookingRows = localListBookings(userId)
    for (const row of bookingRows) {
      applyBookingRevenue(
        channels,
        row.channel,
        row.ticket_count ?? 1,
        row.payload_json || {},
        eventPriceByKey,
        row.event_external_id,
        row.event_title,
      )
    }

    const unifiedAttendees = new Set(bookingRows.map((b) => b.guest_email.toLowerCase())).size
    const recent = CHANNELS.flatMap((ch) =>
      localListEvents(ch, userId).map((row) =>
        mapEventRow({
          external_id: row.external_id,
          title: row.title,
          start_at: row.start_at,
          end_at: row.end_at,
          cover_url: row.cover_url,
          status: row.status,
          channel: ch,
          is_free: row.is_free,
        }),
      ),
    ).sort((a, b) => new Date(b.startUtc).getTime() - new Date(a.startUtc).getTime())

    const recentBookings = bookingRows.slice(0, 8).map((row) => ({
      name: row.guest_name,
      email: row.guest_email,
      channel: row.channel,
      eventTitle: row.event_title,
      registeredAt: row.registered_at,
    }))

    return {
      channels,
      ...summarizeTotals(channels),
      unifiedAttendees,
      recent,
      recentBookings,
      bookingTrend: buildBookingTrend(bookingRows),
    }
  }

  const eventPriceByKey = new Map<string, { price: number; currency: string; isFree: boolean }>()
  await Promise.all(
    CHANNELS.map(async (ch) => {
      const table = EVENT_TABLE[ch]
      const rows = await query<RowDataPacket[]>(
        `SELECT external_id, title, payload_json FROM ${table} WHERE user_id = ?`,
        [userId],
      )
      channels[ch].events = rows.length
      for (const row of rows) {
        const payload =
          typeof row.payload_json === 'string'
            ? (JSON.parse(row.payload_json) as Record<string, unknown>)
            : ((row.payload_json || {}) as Record<string, unknown>)
        const pricing = unitPriceFromEventPayload(ch, payload)
        eventPriceByKey.set(`${ch}:id:${String(row.external_id)}`, pricing)
        eventPriceByKey.set(
          `${ch}:title:${String(row.title || '').trim().toLowerCase()}`,
          pricing,
        )
        if (pricing.currency) channels[ch].currency = pricing.currency
      }
    }),
  )

  let unifiedAttendees = 0
  try {
    const bookingRows = await query<RowDataPacket[]>(
      `SELECT channel, event_external_id, event_title, ticket_count, payload_json, guest_email
       FROM channel_bookings
       WHERE user_id = ?`,
      [userId],
    )
    const emails = new Set<string>()
    for (const row of bookingRows) {
      const ch = row.channel as ChannelName
      if (!channels[ch]) continue
      const payload =
        typeof row.payload_json === 'string'
          ? (JSON.parse(row.payload_json) as Record<string, unknown>)
          : ((row.payload_json || {}) as Record<string, unknown>)
      applyBookingRevenue(
        channels,
        ch,
        row.ticket_count != null ? Number(row.ticket_count) : 1,
        payload,
        eventPriceByKey,
        row.event_external_id ? String(row.event_external_id) : null,
        String(row.event_title || ''),
      )
      const email = String(row.guest_email || '').toLowerCase().trim()
      if (email) emails.add(email)
    }
    unifiedAttendees = emails.size
  } catch (err) {
    console.warn(
      '[getDashboardStatsForUser] channel_bookings unavailable:',
      err instanceof Error ? err.message : err,
    )
  }

  const recentEventRows = await query<RowDataPacket[]>(
    `(SELECT external_id, title, start_at, end_at, cover_url, status, 'hightribe' AS channel, NULL AS is_free
      FROM hightribe_events WHERE user_id = ?)
     UNION ALL
     (SELECT external_id, title, start_at, end_at, cover_url, status, 'luma' AS channel, NULL AS is_free
      FROM luma_events WHERE user_id = ?)
     UNION ALL
     (SELECT external_id, title, start_at, end_at, cover_url, status, 'eventbrite' AS channel, is_free
      FROM eventbrite_events WHERE user_id = ?)
     ORDER BY start_at DESC
     LIMIT 60`,
    [userId, userId, userId],
  )

  const recent = recentEventRows.map((row) =>
    mapEventRow({
      external_id: String(row.external_id),
      title: row.title as string | null,
      start_at: row.start_at as Date | null,
      end_at: row.end_at as Date | null,
      cover_url: row.cover_url as string | null,
      status: row.status as string | null,
      channel: row.channel as ChannelName,
      is_free: row.is_free,
    }),
  )

  let recentBookings: DashboardStatsPayload['recentBookings'] = []
  let bookingTrend: DashboardBookingTrendPoint[] = buildBookingTrend([])
  try {
    const recentBookingRows = await query<RowDataPacket[]>(
      `SELECT channel, event_title, guest_name, guest_email, registered_at
       FROM channel_bookings
       WHERE user_id = ?
       ORDER BY registered_at DESC
       LIMIT 8`,
      [userId],
    )

    recentBookings = recentBookingRows.map((row) => ({
      name: String(row.guest_name || ''),
      email: String(row.guest_email || ''),
      channel: row.channel as ChannelName,
      eventTitle: String(row.event_title || ''),
      registeredAt: row.registered_at
        ? new Date(row.registered_at as Date).toISOString()
        : new Date().toISOString(),
    }))

    const trendRows = await query<RowDataPacket[]>(
      `SELECT DATE(registered_at) AS day, channel, COUNT(*) AS cnt
       FROM channel_bookings
       WHERE user_id = ?
         AND registered_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
       GROUP BY DATE(registered_at), channel
       ORDER BY day ASC`,
      [userId],
    )

    const byDay = new Map<string, Record<ChannelName, number>>()
    for (const row of trendRows) {
      const day = row.day
        ? new Date(row.day as Date).toISOString().slice(0, 10)
        : ''
      if (!day) continue
      const ch = row.channel as ChannelName
      if (!CHANNELS.includes(ch)) continue
      const bucket = byDay.get(day) || emptyChannelDayCounts()
      bucket[ch] = Number(row.cnt || 0)
      byDay.set(day, bucket)
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    bookingTrend = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      const byChannel = byDay.get(key) || emptyChannelDayCounts()
      const count = CHANNELS.reduce((sum, ch) => sum + byChannel[ch], 0)
      bookingTrend.push({ date: key, count, byChannel })
    }
  } catch (err) {
    console.warn(
      '[getDashboardStatsForUser] recent bookings unavailable:',
      err instanceof Error ? err.message : err,
    )
  }

  return {
    channels,
    ...summarizeTotals(channels),
    unifiedAttendees,
    recent,
    recentBookings,
    bookingTrend,
  }
}
