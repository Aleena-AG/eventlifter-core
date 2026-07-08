'use client'

import { channelFetch } from '@/lib/channel-fetch'
import { resolveHtApiAuthHeader } from '@/lib/ewentcast-session'
import type { HtChannelSettingsData } from '@/lib/channel-settings-shared'

export type { HtChannelSettingsData } from '@/lib/channel-settings-shared'
export { appSettingsToHtPatch, htDataToPublicForm } from '@/lib/channel-settings-shared'

type HtApiResponse = {
  status?: string
  message?: string
  error?: string
  data?: HtChannelSettingsData
}

export async function fetchChannelSettingsViaProxy(masked = true): Promise<HtChannelSettingsData> {
  const auth = await resolveHtApiAuthHeader()
  if (!auth) throw new Error('HighTribe session expired. Reconnect in Settings → Hightribe.')

  const qs = masked ? '?masked=1' : ''
  const res = await channelFetch(`/api/hightribe/channel-integrations/settings${qs}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })
  const raw = await res.json() as HtApiResponse
  if (!res.ok || raw.status === 'error') {
    throw new Error(raw.message || raw.error || `Hightribe API HTTP ${res.status}`)
  }
  return raw.data || {}
}

export async function saveChannelSettingsViaProxy(
  payload: HtChannelSettingsData,
): Promise<HtChannelSettingsData> {
  const auth = await resolveHtApiAuthHeader()
  if (!auth) throw new Error('HighTribe session expired. Reconnect in Settings → Hightribe.')

  const res = await channelFetch('/api/hightribe/channel-integrations/settings', {
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  })
  const raw = await res.json() as HtApiResponse
  if (!res.ok || raw.status === 'error') {
    throw new Error(raw.message || raw.error || `Hightribe API HTTP ${res.status}`)
  }
  return raw.data || {}
}
