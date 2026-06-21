import { getHtApiBase } from '@/lib/ht-api-base'
import type { AppSettings } from '@/lib/settings-store'

export interface HtChannelSettingsData {
  luma?: {
    api_key?: string
    calendar_id?: string
    api_base_url?: string
    discover_base_url?: string
    configured?: boolean
  }
  eventbrite?: {
    client_id?: string
    client_secret?: string
    redirect_uri?: string
    private_token?: string
    public_token?: string
    configured?: boolean
    has_private_token?: boolean
  }
}

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

export function appSettingsToHtPatch(patch: Partial<AppSettings>): HtChannelSettingsData {
  const out: HtChannelSettingsData = {}
  if (patch.luma) {
    out.luma = {
      api_key: patch.luma.apiKey,
      calendar_id: patch.luma.calendarId,
      api_base_url: patch.luma.apiBaseUrl,
      discover_base_url: patch.luma.discoverBaseUrl,
    }
  }
  if (patch.eventbrite) {
    out.eventbrite = {
      client_id: patch.eventbrite.clientId,
      client_secret: patch.eventbrite.clientSecret,
      redirect_uri: patch.eventbrite.redirectUri,
      private_token: patch.eventbrite.privateToken,
      public_token: patch.eventbrite.publicToken,
    }
  }
  return out
}

export function htDataToAppSettings(data: HtChannelSettingsData): Partial<AppSettings> {
  const out: Partial<AppSettings> = {}
  if (data.luma) {
    out.luma = {
      apiKey: data.luma.api_key || '',
      calendarId: data.luma.calendar_id || '',
      apiBaseUrl: data.luma.api_base_url || '',
      discoverBaseUrl: data.luma.discover_base_url || '',
    }
  }
  if (data.eventbrite) {
    out.eventbrite = {
      clientId: data.eventbrite.client_id || '',
      clientSecret: data.eventbrite.client_secret || '',
      redirectUri: data.eventbrite.redirect_uri || '',
      privateToken: data.eventbrite.private_token || '',
      publicToken: data.eventbrite.public_token || '',
    }
  }
  return out
}

/** GET /api/channel-integrations/settings from HighTribe Laravel backend */
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

/** PUT /api/channel-integrations/settings on HighTribe Laravel backend */
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
