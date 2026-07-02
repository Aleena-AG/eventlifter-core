import { getUser } from '@/lib/auth'
import { getEwentcastAccount } from '@/lib/ewentcast-session'
import type { ChannelKey } from '@/lib/types'

export interface ChannelSettingsView {
  luma?: { configured?: boolean }
  eventbrite?: { configured?: boolean; hasPrivateToken?: boolean }
  hightribe?: { configured?: boolean }
}

export function isLumaConnected(settings: ChannelSettingsView): boolean {
  return !!settings.luma?.configured
}

export function isEventbriteConnected(settings: ChannelSettingsView): boolean {
  return !!(settings.eventbrite?.hasPrivateToken || settings.eventbrite?.configured)
}

export function isHightribeChannelConnected(): boolean {
  const account = getEwentcastAccount()
  if (account?.auth_source === 'ewentcast_signup') {
    return !!account.ht_connected
  }
  if (account?.auth_source === 'hightribe_native') {
    return !!getUser()
  }
  return false
}

export function channelConnectionMap(settings: ChannelSettingsView): Record<ChannelKey, boolean> {
  return {
    hightribe: isHightribeChannelConnected(),
    luma: isLumaConnected(settings),
    eventbrite: isEventbriteConnected(settings),
  }
}

export function connectedChannels(settings: ChannelSettingsView): ChannelKey[] {
  const map = channelConnectionMap(settings)
  return (['hightribe', 'luma', 'eventbrite'] as ChannelKey[]).filter((k) => map[k])
}

export function isChannelConnected(channel: ChannelKey, settings: ChannelSettingsView): boolean {
  return channelConnectionMap(settings)[channel]
}
