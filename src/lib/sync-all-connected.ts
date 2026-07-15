'use client'

import type { ChannelKey } from '@/lib/types'
import {
  isEventbriteConnected,
  isHightribeConnected,
  isLumaConnected,
  type ChannelSettingsView,
} from '@/lib/channel-connection'
import { syncChannelFromApi } from '@/lib/channel-connect'

export async function syncAllConnectedChannels(
  settings: ChannelSettingsView,
): Promise<Array<{ channel: ChannelKey; events: number; pruned: number; bookings: number }>> {
  const results: Array<{ channel: ChannelKey; events: number; pruned: number; bookings: number }> = []

  if (isHightribeConnected(settings)) {
    results.push({ channel: 'hightribe', ...(await syncChannelFromApi('hightribe')) })
  }
  if (isLumaConnected(settings)) {
    results.push({ channel: 'luma', ...(await syncChannelFromApi('luma')) })
  }
  if (isEventbriteConnected(settings)) {
    results.push({ channel: 'eventbrite', ...(await syncChannelFromApi('eventbrite')) })
  }

  return results
}
