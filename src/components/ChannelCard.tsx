'use client'

import Link from 'next/link'
import type { ChannelKey } from '@/lib/types'
import { CHANNEL_META } from '@/lib/channels'
import { channelDisconnectLabel } from '@/lib/channel-disconnect'
import { ChannelLogo } from './ChannelLogo'
import { InlineLoader } from './Loader'

const AUTH_LABELS: Record<string, string> = {
  native: 'Native',
  oauth2: 'OAuth 2.0',
  api_key: 'API Key',
}

interface ChannelCardProps {
  channel: ChannelKey
  connected: boolean
  onDisconnect?: () => void
  disconnecting?: boolean
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

      <div className="channel-card__head">
        <div className="channel-card__logo-wrap">
          <ChannelLogo channel={channel} size={36} />
        </div>
        <span className={`channel-card__status channel-card__status--${connected ? 'on' : 'off'}`}>
          <span className="channel-card__status-dot" aria-hidden="true" />
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      <div className="channel-card__body">
        <h2 className="channel-card__name">{meta.name}</h2>
        <span className="channel-card__auth">{AUTH_LABELS[meta.authType] || meta.authType}</span>
        <p className="channel-card__desc">{meta.desc}</p>
      </div>

      <div className="channel-card__foot">
        {connected && onDisconnect && disconnectLabel ? (
          <button
            type="button"
            className="channel-card__disconnect"
            onClick={onDisconnect}
            disabled={disconnecting}
          >
            {disconnecting ? <InlineLoader label="…" /> : disconnectLabel}
          </button>
        ) : (
          <span className="channel-card__foot-spacer" aria-hidden="true" />
        )}
        <Link href={settingsHref} prefetch={false} className="channel-card__cta">
          {connected ? 'Manage →' : 'Connect →'}
        </Link>
      </div>
    </article>
  )
}
