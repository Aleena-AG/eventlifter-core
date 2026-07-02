import type { ChannelName } from '../../../backend/src/services/events'

export function parseChannel(raw: string): ChannelName | null {
  if (raw === 'luma' || raw === 'eventbrite' || raw === 'hightribe') return raw
  return null
}
