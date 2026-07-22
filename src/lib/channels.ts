import type { ChannelKey } from './types'
import { HIGHTRIBE_COLOR, LUMA_COLOR, EVENTBRITE_COLOR, EVENTBRITE_LOGO, LUMA_LOGO } from './brand'

interface ChannelMeta {
  name: string
  icon: string
  color: string
  authType: 'native' | 'oauth2' | 'api_key'
  desc: string
}

export const CHANNEL_META: Record<ChannelKey, ChannelMeta> = {
  hightribe: {
    name: 'Hightribe',
    icon: '🏔️',
    color: HIGHTRIBE_COLOR,
    authType: 'native',
    desc: 'Native channel — no external auth needed.',
  },
  eventbrite: {
    name: 'Eventbrite',
    icon: '🎫',
    color: EVENTBRITE_COLOR,
    authType: 'oauth2',
    desc: 'Connect via OAuth2.',
  },
  luma: {
    name: 'Luma',
    icon: '✨',
    color: LUMA_COLOR,
    authType: 'api_key',
    desc: 'Requires a Luma Plus API key.',
  },
}

export const CHANNEL_KEYS: ChannelKey[] = ['hightribe', 'eventbrite', 'luma']

export const CHANNEL_LOGOS: Record<ChannelKey, string> = {
  hightribe: '/channels/hightribe.ico',
  eventbrite: EVENTBRITE_LOGO,
  luma: LUMA_LOGO,
}
