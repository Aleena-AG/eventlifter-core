'use client'

import Link from 'next/link'
import type { ChannelKey } from '@/lib/types'
import { CAP_LABELS, CHANNEL_META } from '@/lib/channels'
import { channelDisconnectLabel } from '@/lib/channel-disconnect'
import { ChannelLogo } from './ChannelLogo'
import { InlineLoader } from './Loader'

const AUTH_LABELS: Record<string, string> = {
  native: 'Native',
  oauth2: 'OAuth 2.0',
  api_key: 'API Key',
}

const FEATURED_CAPS = ['publish', 'webhooks', 'capacitySync', 'pullAttendees'] as const

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
  const settingsHref = `/settings?channel=${channel}`
  const disconnectLabel = channelDisconnectLabel(channel, connected)

  return (
    <article
      className={`channel-card${connected ? ' channel-card--connected' : ''}`}
      style={{ '--ch-color': meta.color } as React.CSSProperties}
    >
      <div className="channel-card__glow" aria-hidden="true" />
      <div className="channel-card__stripe" aria-hidden="true" />

      <div className="channel-card__top">
        <div className="channel-card__brand">
          <div className="channel-card__logo-wrap">
            <ChannelLogo channel={channel} size={40} />
          </div>
          <div>
            <h2 className="channel-card__name">{meta.name}</h2>
            <span className="channel-card__auth">{AUTH_LABELS[meta.authType] || meta.authType}</span>
          </div>
        </div>
        <span className={`channel-card__status channel-card__status--${connected ? 'on' : 'off'}`}>
          <span className="channel-card__status-dot" aria-hidden="true" />
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      <p className="channel-card__desc">{meta.desc}</p>

      <div className="channel-card__caps">
        {FEATURED_CAPS.map((cap) => {
          const on = meta.caps[cap]
          return (
            <span
              key={cap}
              className={`channel-card__cap${on ? ' channel-card__cap--on' : ' channel-card__cap--off'}`}
            >
              {on ? '✓ ' : ''}{CAP_LABELS[cap]}
            </span>
          )
        })}
      </div>

      <div className="channel-card__foot">
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
        <Link href={settingsHref} className="channel-card__cta">
          {connected ? 'Manage connection →' : 'Connect in Settings →'}
        </Link>
      </div>
    </article>
  )
}
