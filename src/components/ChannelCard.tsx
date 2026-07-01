'use client'

import type { ChannelKey } from '@/lib/types'
import { CHANNEL_META } from '@/lib/channels'
import { ChannelLogo } from './ChannelLogo'
import { StatusBadge } from './StatusBadge'
import { InlineLoader } from './Loader'
import { channelDisconnectLabel } from '@/lib/channel-disconnect'

interface ChannelCardProps {
  channel: ChannelKey
  connected: boolean
  onDisconnect?: () => void
  disconnecting?: boolean
}

const BTN_DISCONNECT: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #E8DFD0',
  borderRadius: '6px',
  color: '#C2502E',
  padding: '6px 12px',
  fontSize: '12px',
  fontWeight: 500,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

export function ChannelCard({
  channel,
  connected,
  onDisconnect,
  disconnecting = false,
}: ChannelCardProps) {
  const meta = CHANNEL_META[channel]
  const disconnectLabel = channelDisconnectLabel(channel, connected)

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
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
        <ChannelLogo channel={channel} size={40} />
        <div style={{ fontSize: '16px', fontWeight: 600, color: '#211B16' }}>{meta.name}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <StatusBadge status={connected ? 'connected' : 'disconnected'} />
        {connected && onDisconnect && disconnectLabel && (
          <button
            type="button"
            onClick={onDisconnect}
            disabled={disconnecting}
            style={{ ...BTN_DISCONNECT, opacity: disconnecting ? 0.6 : 1, cursor: disconnecting ? 'default' : 'pointer' }}
          >
            {disconnecting ? <InlineLoader label="…" /> : disconnectLabel}
          </button>
        )}
      </div>
    </div>
  )
}
