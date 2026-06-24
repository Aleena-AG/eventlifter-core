export type ChannelKey = 'hightribe' | 'eventbrite' | 'luma'
export type TicketType = 'free' | 'paid' | 'donation'
export type EventFormat = 'in_person' | 'online' | 'hybrid'
export type Visibility = 'public' | 'unlisted' | 'private' | 'member_only'
export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'partial' | 'failed' | 'manual'

export interface MasterEvent {
  id: string
  hostId: string
  title: string
  summary?: string
  description?: string
  startUtc: string
  endUtc: string
  timezone: string
  format: EventFormat
  ticketType: TicketType
  priceCents: number
  currency: string
  capacity?: number
  visibility: Visibility
  tags: string[]
  venueName?: string
  address?: string
  city?: string
  country?: string
  onlineUrl?: string
}

export interface PublishResult {
  channel: ChannelKey
  status: SyncStatus
  error?: string
  ref?: {
    externalEventId: string
    externalEventUrl: string
  }
}

export interface ChannelStatus {
  channel: ChannelKey
  status: string
}

export interface HealthResponse {
  ok: boolean
  channels: ChannelStatus[]
}

export interface ConnectionsResponse {
  channels: ChannelStatus[]
}

export interface EventsResponse {
  events: MasterEvent[]
}

export interface EventStatusResponse {
  channels: PublishResult[]
}

export interface AppSettings {
  eventbrite?: {
    clientId?: string
    clientSecret?: string
    redirectUri?: string
    privateToken?: string
    publicToken?: string
  }
  luma?: {
    apiKey?: string
    calendarId?: string
    apiBaseUrl?: string
    discoverBaseUrl?: string
  }
  Hightribe?: {
    serviceUrl?: string
    apiKey?: string
  }
}

export interface CreateEventPayload {
  hostId: string
  title: string
  summary?: string
  description?: string
  startUtc: string
  endUtc: string
  timezone: string
  format: EventFormat
  ticketType: TicketType
  priceCents?: number
  currency?: string
  capacity?: number
  visibility: Visibility
  tags?: string[]
  venueName?: string
  address?: string
  city?: string
  country?: string
  onlineUrl?: string
  channels?: ChannelKey[]
}
