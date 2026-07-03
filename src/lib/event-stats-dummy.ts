import type { ChannelKey } from './types'
import { CHANNEL_META } from './channels'

export type PlatformEventStat = {
  channel: ChannelKey
  published: boolean
  bookings: number
  tickets: number
  revenue: number
  pendingRevenue: number
  pendingBookings: number
  refunded: number
  lastBookingAt?: string
}

export type EventBookingStats = {
  currency: string
  platforms: PlatformEventStat[]
  totalBookings: number
  totalTickets: number
  totalRevenue: number
  totalPendingRevenue: number
  totalRefunded: number
  activePlatforms: number
}

const PLATFORMS: ChannelKey[] = ['hightribe', 'luma', 'eventbrite']

function hashSeed(input: string): number {
  let h = 0
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0
  }
  return h || 1
}

function pick(seed: number, min: number, max: number): number {
  return min + (seed % (max - min + 1))
}

/** Deterministic dummy stats per event title — replace with API data later. */
export function getDummyEventStats(eventTitle: string, primaryChannel?: ChannelKey): EventBookingStats {
  const seed = hashSeed(eventTitle.trim().toLowerCase())
  const currency = 'PKR'

  const platforms: PlatformEventStat[] = PLATFORMS.map((channel, i) => {
    const chSeed = seed + i * 97
    const published = channel === primaryChannel || chSeed % 3 !== 0
    const bookings = published ? pick(chSeed, 8, 64) : 0
    const tickets = published ? bookings + pick(chSeed + 3, 0, 12) : 0
    const avgTicket = pick(chSeed + 7, 2500, 8500)
    const revenue = bookings * avgTicket
    const pendingBookings = published ? pick(chSeed + 11, 0, Math.min(6, bookings)) : 0
    const pendingRevenue = pendingBookings * avgTicket
    const refunded = published && chSeed % 5 === 0 ? pick(chSeed + 13, 1, 3) : 0
    const daysAgo = pick(chSeed + 17, 0, 14)
    const lastBookingAt = published
      ? new Date(Date.now() - daysAgo * 86_400_000 - pick(chSeed + 19, 1, 8) * 3_600_000).toISOString()
      : undefined

    return { channel, published, bookings, tickets, revenue, pendingRevenue, pendingBookings, refunded, lastBookingAt }
  })

  const totalBookings = platforms.reduce((s, p) => s + p.bookings, 0)
  const totalTickets = platforms.reduce((s, p) => s + p.tickets, 0)
  const totalRevenue = platforms.reduce((s, p) => s + p.revenue, 0)
  const totalPendingRevenue = platforms.reduce((s, p) => s + p.pendingRevenue, 0)
  const totalRefunded = platforms.reduce((s, p) => s + p.refunded, 0)
  const activePlatforms = platforms.filter(p => p.published).length

  return {
    currency,
    platforms,
    totalBookings,
    totalTickets,
    totalRevenue,
    totalPendingRevenue,
    totalRefunded,
    activePlatforms,
  }
}

export function formatEventMoney(amount: number, currency: string): string {
  if (amount === 0) return '—'
  try {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${amount.toLocaleString()} ${currency}`
  }
}

export function formatRelativeBookingTime(iso?: string): string {
  if (!iso) return '—'
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60_000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    if (days < 30) return `${days}d ago`
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return '—'
  }
}

export function platformLabel(channel: ChannelKey): string {
  return CHANNEL_META[channel].name
}

export function platformColor(channel: ChannelKey): string {
  return CHANNEL_META[channel].color
}
