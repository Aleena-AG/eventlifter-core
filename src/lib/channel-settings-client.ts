'use client'

import { authHeader } from '@/lib/auth'
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
  const auth = authHeader()
  if (!auth) throw new Error('Login to Hightribe first')

  const qs = masked ? '?masked=1' : ''
  const res = await fetch(`/api/hightribe/channel-integrations/settings${qs}`, {
    headers: { Accept: 'application/json', Authorization: auth },
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
  const auth = authHeader()
  if (!auth) throw new Error('Login to Hightribe first')

  const res = await fetch('/api/hightribe/channel-integrations/settings', {
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: auth,
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
