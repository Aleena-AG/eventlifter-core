'use client'

import type { ChannelKey } from '@/lib/types'
import { CHANNEL_LOGOS, CHANNEL_META } from '@/lib/channels'

type ChannelLogoProps = {
  channel: ChannelKey
  size?: number
}

export function ChannelLogo({ channel, size = 40 }: ChannelLogoProps) {
  const meta = CHANNEL_META[channel]

  const isMarkLogo = channel === 'hightribe' || channel === 'eventbrite' || channel === 'luma'

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(6, Math.round(size * 0.2)),
        background: isMarkLogo ? 'transparent' : '#FBF7F0',
        border: isMarkLogo ? 'none' : `1px solid ${meta.color}33`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
        padding: isMarkLogo ? 0 : Math.round(size * 0.1),
      }}
    >
      <img
        src={CHANNEL_LOGOS[channel]}
        alt={`${meta.name} logo`}
        width={size}
        height={size}
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
      />
    </div>
  )
}
