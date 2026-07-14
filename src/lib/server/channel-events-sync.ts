import { upsertChannelEvents } from '@/lib/server/channel-events'
import type { ChannelName } from '@/lib/server/channels'
import { resolveAppSettings } from '@/lib/channel-settings-server'
import { proxyLumaPath } from '@/lib/luma-api'

/** Best-effort Luma event sync via remote API upsert. */
export async function maybeSyncChannelEvents(
  channel: ChannelName,
  userId: number,
  authorization: string,
  opts?: { force?: boolean; existingCount?: number },
) {
  if (channel !== 'luma') return
  if (!opts?.force && (opts?.existingCount || 0) > 0) return

  const settings = await resolveAppSettings(authorization)
  if (!settings.luma.apiKey?.trim()) return

  const res = await proxyLumaPath(
    ['events', 'hosted'],
    'GET',
    { upcoming_only: 'false' },
    undefined,
    settings,
  ) as {
    entries?: Array<{ event?: Record<string, unknown>; id?: string }>
    data?: { entries?: Array<{ event?: Record<string, unknown>; id?: string }> }
  }

  const entries = res.data?.entries || res.entries || []
  const events = entries.map((e) => {
    const ev = e.event || e
    return {
      external_id: String((ev as { api_id?: string }).api_id || (ev as { id?: string }).id || ''),
      title: String((ev as { name?: string }).name || 'Untitled'),
      start_at: (ev as { start_at?: string }).start_at || null,
      end_at: (ev as { end_at?: string }).end_at || null,
      timezone: (ev as { timezone?: string }).timezone || null,
      raw: ev,
    }
  }).filter((e) => e.external_id)

  if (events.length === 0) return

  await upsertChannelEvents(channel, userId, events, { prune: true }, authorization)
}
