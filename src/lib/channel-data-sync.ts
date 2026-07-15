'use client'

import { channelFetch } from '@/lib/channel-fetch'
import {
  syncStoredEvents,
} from '@/lib/channel-events-store'
import type { ChannelKey } from '@/lib/types'

export const EVENTS_LIST_REFRESH_KEY = 'ew-events-list-refresh'

/** Tell the Events page to reload from the local store on next visit/focus. */
export function markEventsListStale(): void {
  try {
    sessionStorage.setItem(EVENTS_LIST_REFRESH_KEY, String(Date.now()))
  } catch {
    // ignore
  }
}

export function consumeEventsListRefresh(): boolean {
  try {
    const flag = sessionStorage.getItem(EVENTS_LIST_REFRESH_KEY)
    if (!flag) return false
    sessionStorage.removeItem(EVENTS_LIST_REFRESH_KEY)
    return true
  } catch {
    return false
  }
}

/** Fetch fresh copies of specific events from channel APIs and upsert into our store. */
export async function refreshStoredEventsForChannels(
  targets: Partial<Record<ChannelKey, string | number>>,
): Promise<void> {
  const entries = (['hightribe', 'luma', 'eventbrite'] as ChannelKey[])
    .map((ch) => ({ ch, id: targets[ch] }))
    .filter((e): e is { ch: ChannelKey; id: string | number } => e.id != null && e.id !== '')

  await Promise.all(entries.map(async ({ ch, id }) => {
    try {
      let raw: Record<string, unknown> | null = null

      if (ch === 'hightribe') {
        const res = await channelFetch(`/api/hightribe/events/${id}`)
        if (res.ok) {
          const data = await res.json() as Record<string, unknown>
          raw = (data.data as Record<string, unknown>) || data
          if (raw && raw.id == null) raw = { ...raw, id }
        }
      } else if (ch === 'luma') {
        const res = await channelFetch(
          `/api/luma/events?api_id=${encodeURIComponent(String(id))}`,
        )
        if (res.ok) {
          const data = await res.json() as {
            data?: Record<string, unknown>
            event?: Record<string, unknown>
          }
          raw = data.data || data.event || null
        }
      } else {
        const res = await channelFetch(`/api/eventbrite/events/${id}?expand=venue`)
        if (res.ok) raw = await res.json() as Record<string, unknown>
      }

      if (raw && Object.keys(raw).length > 0) {
        await syncStoredEvents(ch, [raw], { prune: false })
      }
    } catch {
      // best-effort — full channel sync can recover later
    }
  }))
}

/** Pull events + bookings via POST /api/v1/events/:channel/sync-from-api (body: {}). */
export async function syncChannelDataToDb(
  channel: ChannelKey,
): Promise<{ events: number; pruned: number; bookings: number }> {
  const { syncChannelFromApi } = await import('@/lib/channel-connect')
  return syncChannelFromApi(channel)
}

/** Remove all cached events, bookings, and registry links for a channel. */
export { purgeChannelDataFromDb } from '@/lib/channel-events-store'

export function formatEventSyncMessage(result: {
  events: number
  pruned: number
  bookings?: number
}): string {
  const parts: string[] = []
  if (result.events > 0) parts.push(`${result.events} event${result.events === 1 ? '' : 's'} synced`)
  if (result.pruned > 0) parts.push(`${result.pruned} stale removed`)
  if (result.bookings != null && result.bookings > 0) {
    parts.push(`${result.bookings} booking${result.bookings === 1 ? '' : 's'}`)
  }
  return parts.length > 0 ? parts.join(', ') : 'Sync complete'
}
