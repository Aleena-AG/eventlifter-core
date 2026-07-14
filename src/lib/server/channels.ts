import type { ChannelKey } from '@/lib/types'

export type ChannelName = 'hightribe' | 'luma' | 'eventbrite'

export function parseChannel(raw: string): ChannelName | null {
  const value = raw.trim().toLowerCase()
  if (value === 'hightribe' || value === 'luma' || value === 'eventbrite') return value
  return null
}

export function isChannelKey(value: string): value is ChannelKey {
  return value === 'hightribe' || value === 'luma' || value === 'eventbrite'
}
