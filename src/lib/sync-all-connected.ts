'use client'

import type { ChannelKey } from '@/lib/types'
import {
  isEventbriteConnected,
  isHightribeChannelConnected,
  isLumaConnected,
  type ChannelSettingsView,
} from '@/lib/channel-connection'
import { syncChannelDataToDb } from '@/lib/channel-data-sync'

export async function syncAllConnectedChannels(
  settings: ChannelSettingsView,
): Promise<Array<{ channel: ChannelKey; events: number; pruned: number; bookings: number }>> {
  const results: Array<{ channel: ChannelKey; events: number; pruned: number; bookings: number }> = []

  // Sync one channel at a time — avoids Chrome ERR_NETWORK_IO_SUSPENDED under load.
  if (isHightribeChannelConnected()) {
    results.push({ channel: 'hightribe', ...(await syncChannelDataToDb('hightribe')) })
  }
  if (isLumaConnected(settings)) {
    results.push({ channel: 'luma', ...(await syncChannelDataToDb('luma')) })
  }
  if (isEventbriteConnected(settings)) {
    results.push({ channel: 'eventbrite', ...(await syncChannelDataToDb('eventbrite')) })
  }

  return results
}
