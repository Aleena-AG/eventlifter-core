'use client'

import type { SyncStatus } from '@/lib/types'

interface StatusBadgeProps {
  status?: SyncStatus | string
  label?: string
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  synced: { color: '#4E7A4B', bg: 'rgba(63,185,80,0.15)', label: 'Synced' },
  syncing: { color: '#D98A2B', bg: 'rgba(56,139,253,0.15)', label: 'Syncing' },
  pending: { color: '#D98A2B', bg: 'rgba(227,179,65,0.15)', label: 'Pending' },
  partial: { color: '#D98A2B', bg: 'rgba(227,179,65,0.15)', label: 'Partial' },
  failed: { color: '#C2502E', bg: 'rgba(248,81,73,0.15)', label: 'Failed' },
  manual: { color: '#8C7F6D', bg: 'rgba(139,148,158,0.15)', label: 'Manual' },
  connected: { color: '#4E7A4B', bg: 'rgba(63,185,80,0.15)', label: 'Connected' },
  disconnected: { color: '#8C7F6D', bg: 'rgba(139,148,158,0.15)', label: 'Disconnected' },
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const key = (status || '').toLowerCase()
  const config = STATUS_CONFIG[key] || {
    color: '#8C7F6D',
    bg: 'rgba(139,148,158,0.15)',
    label: status || '—',
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '2px 8px',
        borderRadius: '20px',
        fontSize: '12px',
        fontWeight: 500,
        color: config.color,
        background: config.bg,
        border: `1px solid ${config.color}33`,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: config.color,
          flexShrink: 0,
        }}
      />
      {label || config.label}
    </span>
  )
}
