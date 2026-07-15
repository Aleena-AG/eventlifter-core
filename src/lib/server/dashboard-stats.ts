import { backendFetch } from '@/lib/backend-client'
import { unwrapApiData } from '@/lib/api-response'

export type DashboardChannelStats = {
  channel: string
  events: number
  bookings: number
  [key: string]: unknown
}

export type DashboardEventItem = {
  id?: string
  title?: string
  [key: string]: unknown
}

export type DashboardBookingTrendPoint = {
  date?: string
  count?: number
  [key: string]: unknown
}

export type DashboardStatsPayload = {
  channels?: Record<string, DashboardChannelStats> | DashboardChannelStats[]
  events?: DashboardEventItem[]
  bookings?: unknown[]
  trend?: DashboardBookingTrendPoint[]
  derived?: boolean
  [key: string]: unknown
}

export async function getDashboardStatsForUser(
  _userId: number,
  authorization?: string,
): Promise<DashboardStatsPayload> {
  if (!authorization?.trim()) {
    return { channels: {}, events: [], bookings: [], trend: [] }
  }

  const res = await backendFetch('dashboard/stats', {
    headers: { Authorization: authorization },
  })
  if (!res.ok) {
    return { channels: {}, events: [], bookings: [], trend: [] }
  }

  const raw = await res.json()
  return unwrapApiData<DashboardStatsPayload>(raw)
}
