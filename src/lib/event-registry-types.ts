import type { ChannelKey } from '@/lib/types'

export interface ChannelRef {
  eventId: string
  ticketId?: string
  url?: string
}

export interface AttendeeRecord {
  email: string
  name: string
  source: ChannelKey
  registeredAt: string
  merged?: boolean
}

export interface MasterLocation {
  venue_name?: string
  city?: string
  country?: string
  address?: string
  region?: string
  postal_code?: string
  latitude?: number | null
  longitude?: number | null
}

export interface MasterTicketDetail {
  name?: string
  start_date?: string
  end_date?: string
  price?: number
  currency?: string
  quantity?: number
}

export interface MasterEventRecord {
  id: string
  title: string
  capacity: number
  sold: number
  channels: Partial<Record<ChannelKey, ChannelRef>>
  attendees: AttendeeRecord[]
  createdAt: string
  updatedAt: string
  /** Extended master fields (PATCH/GET) */
  category?: string
  timezone?: string
  format?: string
  startAt?: string
  endAt?: string
  location?: MasterLocation
  details?: { tickets?: MasterTicketDetail[] }
}
