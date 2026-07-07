'use client'

import { channelFetch } from '@/lib/channel-fetch'

export interface HtEventListItem {
  id: string | number
  user_id?: string | number
  title: string
  cover_image?: string
  cover_image_aspect_ratio?: Array<{ image?: string }>
  status?: string
  publish_status?: string
  is_public?: boolean
  tickets_sold?: number
  dates?: {
    starts_at?: string
    start_date?: string
    start_time?: string
  }
  location?: {
    address?: string
    city?: string
    country?: string
    venue_name?: string
  }
  slug?: string
  share_url?: string
}

export interface HtEventsPage {
  events: HtEventListItem[]
  currentPage: number
  lastPage: number
  total: number
}

export interface HtHostStats {
  totalBookings: number
  ticketsSold: number
}

type HtPaginatedResponse = {
  data?: HtEventListItem[]
  meta?: {
    current_page?: number
    last_page?: number
    total?: number
    per_page?: number
  }
  current_page?: number
  last_page?: number
  total?: number
}

function parseHtPagination(data: HtPaginatedResponse, page: number, fallbackCount: number) {
  const meta = data.meta
  return {
    currentPage: meta?.current_page ?? data.current_page ?? page,
    lastPage: meta?.last_page ?? data.last_page ?? 1,
    total: meta?.total ?? data.total ?? fallbackCount,
  }
}

/**
 * Logged-in host's own events (Laravel EventRepository::getAllEvents).
 * GET /api/events — scoped by Bearer token, not /events/all.
 * Pagination lives under `meta` (Laravel Resource collection).
 */
export async function fetchHtEventsPage(page = 1, perPage = 12): Promise<HtEventsPage> {
  const params = new URLSearchParams({
    per_page: String(perPage),
    page: String(page),
  })

  const res = await channelFetch(`/api/hightribe/events?${params}`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const data = await res.json() as HtPaginatedResponse
  const events = data.data || []
  const pagination = parseHtPagination(data, page, events.length)

  return { events, ...pagination }
}

/** Host-wide stats for dashboard — GET /api/events/stats */
export async function fetchHtHostStats(): Promise<HtHostStats> {
  const res = await channelFetch('/api/hightribe/events/stats', {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const data = await res.json() as { total_bookings?: number; tickets_sold?: number }
  return {
    totalBookings: data.total_bookings ?? 0,
    ticketsSold: data.tickets_sold ?? 0,
  }
}

/** Paginated host bookings — GET /api/events/bookings */
export async function fetchHtBookingsPage(page = 1, perPage = 10): Promise<{
  bookings: unknown[]
  total: number
  currentPage: number
  lastPage: number
}> {
  const params = new URLSearchParams({
    per_page: String(perPage),
    page: String(page),
  })

  const res = await channelFetch(`/api/hightribe/events/bookings?${params}`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const data = await res.json() as {
    data?: unknown[]
    total?: number
    current_page?: number
    last_page?: number
  }

  return {
    bookings: data.data || [],
    total: data.total ?? (data.data?.length ?? 0),
    currentPage: data.current_page ?? page,
    lastPage: data.last_page ?? 1,
  }
}
