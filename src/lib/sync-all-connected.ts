'use client'

import type { ChannelKey } from '@/lib/types'
import {
  isEventbriteConnected,
  isHightribeConnected,
  isLumaConnected,
  type ChannelSettingsView,
} from '@/lib/channel-connection'
import { syncChannelDataToDb } from '@/lib/channel-data-sync'
import { syncChannelFromApi } from '@/lib/channel-connect'

export async function syncAllConnectedChannels(
  settings: ChannelSettingsView,
): Promise<Array<{ channel: ChannelKey; events: number; pruned: number; bookings: number }>> {
  const results: Array<{ channel: ChannelKey; events: number; pruned: number; bookings: number }> = []

  // Prefer remote sync-from-api after settings-based connect; fall back to client sync.
  async function syncOne(channel: ChannelKey) {
    try {
      await syncChannelFromApi(channel)
    } catch {
      // fall through to client-side sync
    }
    return syncChannelDataToDb(channel)
  }

  if (isHightribeConnected(settings)) {
    results.push({ channel: 'hightribe', ...(await syncOne('hightribe')) })
  }
  if (isLumaConnected(settings)) {
    results.push({ channel: 'luma', ...(await syncOne('luma')) })
  }
  if (isEventbriteConnected(settings)) {
    results.push({ channel: 'eventbrite', ...(await syncOne('eventbrite')) })
  }

  return results
}
