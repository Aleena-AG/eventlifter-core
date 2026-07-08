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
  const tasks: Array<Promise<{ channel: ChannelKey; events: number; pruned: number; bookings: number }>> = []

  if (isHightribeChannelConnected()) {
    tasks.push(
      syncChannelDataToDb('hightribe').then((r) => ({ channel: 'hightribe' as const, ...r })),
    )
  }
  if (isLumaConnected(settings)) {
    tasks.push(
      syncChannelDataToDb('luma').then((r) => ({ channel: 'luma' as const, ...r })),
    )
  }
  if (isEventbriteConnected(settings)) {
    tasks.push(
      syncChannelDataToDb('eventbrite').then((r) => ({ channel: 'eventbrite' as const, ...r })),
    )
  }

  return Promise.all(tasks)
}
