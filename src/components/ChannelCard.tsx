'use client'

import type { ChannelKey } from '@/lib/types'
import { CHANNEL_META } from '@/lib/channels'
import { ChannelLogo } from './ChannelLogo'
import { StatusBadge } from './StatusBadge'

interface ChannelCardProps {
  channel: ChannelKey
  connected: boolean
}

export function ChannelCard({ channel, connected }: ChannelCardProps) {
  const meta = CHANNEL_META[channel]

  return (
    <div
      style={{
        background: '#FFFFFF',
        border: `1px solid ${connected ? meta.color + '44' : '#E8DFD0'}`,
        borderRadius: '10px',
        padding: '20px 22px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <ChannelLogo channel={channel} size={40} />
        <div style={{ fontSize: '16px', fontWeight: 600, color: '#211B16' }}>{meta.name}</div>
      </div>
      <StatusBadge status={connected ? 'connected' : 'disconnected'} />
    </div>
  )
}
