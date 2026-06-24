import type { ChannelKey } from './types'

interface ChannelCaps {
  publish: boolean
  update: boolean
  unpublish: boolean
  pullAttendees: boolean
  webhooks: boolean
  pricing: boolean
  capacitySync: boolean
}

interface ChannelMeta {
  name: string
  icon: string
  color: string
  authType: 'native' | 'oauth2' | 'api_key'
  caps: ChannelCaps
  desc: string
}

export const CHANNEL_META: Record<ChannelKey, ChannelMeta> = {
  hightribe: {
    name: 'Hightribe',
    icon: '🏔️',
    color: '#a78bfa',
    authType: 'native',
    caps: {
      publish: true,
      update: true,
      unpublish: true,
      pullAttendees: true,
      webhooks: true,
      pricing: true,
      capacitySync: true,
    },
    desc: 'Native channel — no external auth needed.',
  },
  eventbrite: {
    name: 'Eventbrite',
    icon: '🎫',
    color: '#fbbf24',
    authType: 'oauth2',
    caps: {
      publish: true,
      update: true,
      unpublish: true,
      pullAttendees: true,
      webhooks: true,
      pricing: true,
      capacitySync: true,
    },
    desc: 'Connect via OAuth2.',
  },
  luma: {
    name: 'Luma',
    icon: '✨',
    color: '#22d3ee',
    authType: 'api_key',
    caps: {
      publish: true,
      update: true,
      unpublish: false,
      pullAttendees: true,
      webhooks: true,
      pricing: true,
      capacitySync: false,
    },
    desc: 'Requires a Luma Plus API key.',
  },
}

export const CHANNEL_KEYS: ChannelKey[] = ['hightribe', 'eventbrite', 'luma']

export const CHANNEL_LOGOS: Record<ChannelKey, string> = {
  hightribe: '/channels/Hightribe.ico',
  eventbrite: '/channels/eventbrite.svg',
  luma: '/channels/luma.png',
}

export const CAP_LABELS: Record<keyof ChannelCaps, string> = {
  publish: 'Publish',
  update: 'Update',
  unpublish: 'Unpublish',
  pullAttendees: 'Pull Attendees',
  webhooks: 'Webhooks',
  pricing: 'Pricing',
  capacitySync: 'Capacity Sync',
}
