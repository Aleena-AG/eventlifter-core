export type ChannelKey = 'hightribe' | 'luma' | 'eventbrite'

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

export interface MasterEventRecord {
  id: string
  title: string
  capacity: number
  sold: number
  channels: Partial<Record<ChannelKey, ChannelRef>>
  attendees: AttendeeRecord[]
  createdAt: string
  updatedAt: string
}
