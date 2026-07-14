/**
 * Remote settings API contract (GET/PUT /api/v1/settings):
 *
 *   { success: true, data: { luma: { configured, ... }, eventbrite: {...}, hightribe: {...} } }
 *
 * Local / legacy responses may be the channel object at the top level (no wrapper).
 */

export type ChannelSettingsPublic = {
  luma?: {
    configured?: boolean
    apiKey?: string
    calendarId?: string
    apiBaseUrl?: string
    discoverBaseUrl?: string
    [key: string]: unknown
  }
  eventbrite?: {
    configured?: boolean
    hasPrivateToken?: boolean
    clientId?: string
    clientSecret?: string
    redirectUri?: string
    privateToken?: string
    publicToken?: string
    [key: string]: unknown
  }
  hightribe?: {
    configured?: boolean
    serviceUrl?: string
    apiKey?: string
    webhookSecret?: string
    hasApiKey?: boolean
    [key: string]: unknown
  }
}

function looksLikeSettingsPayload(value: unknown): value is ChannelSettingsPublic {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const o = value as Record<string, unknown>
  return 'luma' in o || 'eventbrite' in o || 'hightribe' in o
}

/** Unwrap `{ success, data }` (or `{ data }`) into the channel settings object. */
export function unwrapSettingsResponse(raw: unknown): ChannelSettingsPublic {
  if (!raw || typeof raw !== 'object') return {}

  const root = raw as Record<string, unknown>
  if (looksLikeSettingsPayload(root.data)) {
    return root.data
  }
  if (looksLikeSettingsPayload(root)) {
    return root
  }
  return {}
}

/** Map full=1 / AppSettings-ish payloads into a shape usable by proxies. */
export function settingsPayloadToAppPartial(payload: ChannelSettingsPublic): {
  luma?: { apiKey?: string; calendarId?: string; apiBaseUrl?: string; discoverBaseUrl?: string }
  eventbrite?: {
    clientId?: string
    clientSecret?: string
    redirectUri?: string
    privateToken?: string
    publicToken?: string
  }
  hightribe?: { serviceUrl?: string; apiKey?: string; webhookSecret?: string }
} {
  const luma = payload.luma || {}
  const eb = payload.eventbrite || {}
  const ht = payload.hightribe || {}
  return {
    luma: {
      apiKey: String(luma.apiKey ?? luma.api_key ?? ''),
      calendarId: String(luma.calendarId ?? luma.calendar_id ?? ''),
      apiBaseUrl: String(luma.apiBaseUrl ?? luma.api_base_url ?? ''),
      discoverBaseUrl: String(luma.discoverBaseUrl ?? luma.discover_base_url ?? ''),
    },
    eventbrite: {
      clientId: String(eb.clientId ?? eb.client_id ?? ''),
      clientSecret: String(eb.clientSecret ?? eb.client_secret ?? ''),
      redirectUri: String(eb.redirectUri ?? eb.redirect_uri ?? ''),
      privateToken: String(eb.privateToken ?? eb.private_token ?? ''),
      publicToken: String(eb.publicToken ?? eb.public_token ?? ''),
    },
    hightribe: {
      serviceUrl: String(ht.serviceUrl ?? ht.service_url ?? ''),
      apiKey: String(ht.apiKey ?? ht.api_key ?? ''),
      webhookSecret: String(ht.webhookSecret ?? ht.webhook_secret ?? ''),
    },
  }
}
