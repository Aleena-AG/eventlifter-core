import { upsertChannelEvents } from '../../../backend/src/services/events'
import type { ChannelName } from '../../../backend/src/services/events'
import { resolveAppSettings } from '@/lib/channel-settings-server'
import { listHostedEvents } from '@/lib/luma-api'

/** Pull Luma hosted events from API and upsert into MySQL for this user. */
export async function syncLumaEventsFromApi(
  userId: number,
  authorization: string,
): Promise<number> {
  const settings = await resolveAppSettings(authorization)
  const result = await listHostedEvents(settings, {
    upcoming_only: 'false',
    fetch_all: 'true',
  })
  const entries = Array.isArray(result.entries)
    ? result.entries as Array<Record<string, unknown>>
    : []
  if (!entries.length) return 0
  const { upserted } = await upsertChannelEvents('luma', userId, entries)
  return upserted
}

export async function maybeSyncChannelEvents(
  channel: ChannelName,
  userId: number,
  authorization: string,
  opts?: { force?: boolean; existingCount?: number },
): Promise<void> {
  if (channel !== 'luma') return
  if (!opts?.force && (opts?.existingCount ?? 0) > 0) return
  await syncLumaEventsFromApi(userId, authorization)
}
