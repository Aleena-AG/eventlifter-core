'use client'

import type { ChannelKey } from '@/lib/types'
import { CHANNEL_META, CAP_LABELS } from '@/lib/channels'
import { StatusBadge } from './StatusBadge'

interface ChannelCardProps {
  channel: ChannelKey
  connected: boolean
  children?: React.ReactNode
}

export function ChannelCard({ channel, connected, children }: ChannelCardProps) {
  const meta = CHANNEL_META[channel]

  return (
    <div
      style={{
        background: '#161b22',
        border: '1px solid #30363d',
        borderRadius: '10px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              background: `${meta.color}22`,
              border: `1px solid ${meta.color}44`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
            }}
          >
            {meta.icon}
          </div>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: '#e6edf3' }}>{meta.name}</div>
            <span
              style={{
                display: 'inline-block',
                fontSize: '11px',
                padding: '1px 6px',
                borderRadius: '4px',
                background: '#1c2128',
                border: '1px solid #30363d',
                color: '#8b949e',
                marginTop: '2px',
              }}
            >
              {meta.authType}
            </span>
          </div>
        </div>
        <StatusBadge status={connected ? 'connected' : 'disconnected'} />
      </div>

      {/* Description */}
      <p style={{ margin: 0, fontSize: '13px', color: '#8b949e' }}>{meta.desc}</p>

      {/* Capabilities */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {(Object.entries(meta.caps) as [keyof typeof meta.caps, boolean][]).map(([cap, supported]) => (
          <span
            key={cap}
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '4px',
              background: supported ? 'rgba(63,185,80,0.1)' : 'rgba(139,148,158,0.05)',
              border: `1px solid ${supported ? 'rgba(63,185,80,0.3)' : 'rgba(139,148,158,0.2)'}`,
              color: supported ? '#3fb950' : '#8b949e',
              textDecoration: supported ? 'none' : 'line-through',
            }}
          >
            {CAP_LABELS[cap]}
          </span>
        ))}
      </div>

      {/* Actions slot */}
      {children && <div style={{ borderTop: '1px solid #30363d', paddingTop: '16px' }}>{children}</div>}
    </div>
  )
}
