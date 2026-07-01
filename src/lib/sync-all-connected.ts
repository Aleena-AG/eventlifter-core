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
): Promise<Array<{ channel: ChannelKey; events: number; bookings: number }>> {
  const out: Array<{ channel: ChannelKey; events: number; bookings: number }> = []

  if (isHightribeChannelConnected()) {
    const r = await syncChannelDataToDb('hightribe')
    out.push({ channel: 'hightribe', ...r })
  }
  if (isLumaConnected(settings)) {
    const r = await syncChannelDataToDb('luma')
    out.push({ channel: 'luma', ...r })
  }
  if (isEventbriteConnected(settings)) {
    const r = await syncChannelDataToDb('eventbrite')
    out.push({ channel: 'eventbrite', ...r })
  }

  return out
}
