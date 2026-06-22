import { getHtApiBase } from '@/lib/ht-api-base'
import type { HtChannelSettingsData } from '@/lib/channel-settings-shared'

export type { HtChannelSettingsData } from '@/lib/channel-settings-shared'
export {
  appSettingsToHtPatch,
  htDataToPublicForm,
  htDataToAppSettings,
} from '@/lib/channel-settings-shared'

type HtApiResponse = {
  status?: string
  message?: string
  error?: string
  data?: HtChannelSettingsData
}

function htUrl(path: string, query?: Record<string, string>): string {
  const base = getHtApiBase().replace(/\/$/, '')
  const url = new URL(`${base}/channel-integrations/${path}`)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v) url.searchParams.set(k, v)
    }
  }
  return url.toString()
}

async function parseHtResponse(res: Response): Promise<HtChannelSettingsData> {
  const raw = await res.text()
  let data: HtApiResponse = {}
  try {
    data = raw ? JSON.parse(raw) as HtApiResponse : {}
  } catch {
    throw new Error(raw.slice(0, 200) || `HTTP ${res.status}`)
  }
  if (!res.ok || data.status === 'error') {
    throw new Error(data.message || data.error || `HighTribe API HTTP ${res.status}`)
  }
  return data.data || {}
}

export async function fetchHtChannelSettings(
  authorization: string,
  masked = false,
): Promise<HtChannelSettingsData> {
  const res = await fetch(htUrl('settings', masked ? { masked: '1' } : undefined), {
    headers: {
      Accept: 'application/json',
      Authorization: authorization,
    },
    cache: 'no-store',
  })
  return parseHtResponse(res)
}

export async function saveHtChannelSettings(
  authorization: string,
  payload: HtChannelSettingsData,
): Promise<HtChannelSettingsData> {
  const res = await fetch(htUrl('settings'), {
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: authorization,
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  })
  return parseHtResponse(res)
}
