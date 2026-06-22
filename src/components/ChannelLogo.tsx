'use client'

import type { ChannelKey } from '@/lib/types'
import { CHANNEL_LOGOS, CHANNEL_META } from '@/lib/channels'

type ChannelLogoProps = {
  channel: ChannelKey
  size?: number
}

export function ChannelLogo({ channel, size = 40 }: ChannelLogoProps) {
  const meta = CHANNEL_META[channel]

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(6, Math.round(size * 0.2)),
        background: '#FBF7F0',
        border: `1px solid ${meta.color}33`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
        padding: Math.round(size * 0.1),
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
