import { backendJson } from '@/lib/backend-client'

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
  [key: string]: unknown
}

export async function getDashboardStatsForUser(
  _userId: number,
  authorization?: string,
): Promise<DashboardStatsPayload> {
  try {
    return await backendJson<DashboardStatsPayload>('dashboard/stats', {
      headers: authorization ? { Authorization: authorization } : undefined,
    })
  } catch {
    return { channels: {}, events: [], bookings: [], trend: [] }
  }
}
