'use client'

import { syncChannelDataToDb } from '@/lib/channel-data-sync'

/** Pull HT events/bookings from API and persist to MySQL. Surfaces errors to caller. */
export async function syncHightribeAfterConnect(): Promise<{ events: number; bookings: number }> {
  return syncChannelDataToDb('hightribe')
}
