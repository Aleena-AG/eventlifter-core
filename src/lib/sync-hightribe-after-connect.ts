'use client'

import { syncChannelFromApi } from '@/lib/channel-connect'

/** Pull HT events from the provider via POST /api/v1/events/hightribe/sync-from-api. */
export async function syncHightribeAfterConnect(): Promise<{ events: number; bookings: number }> {
  const result = await syncChannelFromApi('hightribe')
  return { events: result.events, bookings: result.bookings }
}
