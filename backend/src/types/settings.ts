export interface AppSettings {
  eventbrite: {
    clientId: string
    clientSecret: string
    redirectUri: string
    privateToken: string
    publicToken: string
  }
  luma: {
    apiKey: string
    calendarId: string
    apiBaseUrl: string
    discoverBaseUrl: string
  }
  hightribe: {
    serviceUrl: string
    apiKey: string
    webhookSecret: string
  }
}

export type ChannelSettingsKey = 'eventbrite' | 'luma' | 'hightribe'
