import type { AppSettings } from '@/lib/settings-types'

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

export function htDataToPublicForm(data: HtChannelSettingsData): Partial<AppSettings> {
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

export const htDataToAppSettings = htDataToPublicForm
