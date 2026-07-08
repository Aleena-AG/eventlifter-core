import { CHANNEL_KEYS } from '@/lib/channels'
import type { ChannelKey } from '@/lib/types'

function isChannelKey(v: string): v is ChannelKey {
  return CHANNEL_KEYS.includes(v as ChannelKey)
}

function toBase64Url(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): string {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/')
  return atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
}

/** Opaque per-event URL token that doesn't reveal the source channel. */
export function encodeEventRef(channel: ChannelKey, id: string | number): string {
  return toBase64Url(`${channel}:${id}`)
}

export function decodeEventRef(ref: string): { channel: ChannelKey; id: string } | null {
  try {
    const decoded = fromBase64Url(ref)
    const sep = decoded.indexOf(':')
    if (sep < 0) return null
    const channel = decoded.slice(0, sep)
    const id = decoded.slice(sep + 1)
    if (!isChannelKey(channel) || !id) return null
    return { channel, id }
  } catch {
    return null
  }
}
