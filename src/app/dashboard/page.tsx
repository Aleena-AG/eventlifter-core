'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { getSettings } from '@/lib/api'
import { getUser } from '@/lib/auth'
import { loadDashboardStats, type DashboardStats } from '@/lib/dashboard-stats'
import { PageLoader, Spinner } from '@/components/Loader'
import type { ChannelKey } from '@/lib/types'

const CH_META: Record<ChannelKey, { label: string; icon: string; color: string }> = {
  hightribe: { label: 'HighTribe', icon: '🏔', color: '#D98A2B' },
  luma: { label: 'Luma', icon: '✨', color: '#7C5C8A' },
  eventbrite: { label: 'Eventbrite', icon: '🎫', color: '#C2502E' },
}

function ChannelStatCard({
  channel, stats, loading,
}: {
  channel: ChannelKey
  stats?: DashboardStats['channels'][ChannelKey]
  loading: boolean
}) {
  const meta = CH_META[channel]
  const configured = stats?.configured ?? false

  return (
    <div
      style={{
        background: '#FFFFFF',
        border: `1px solid ${configured ? meta.color + '44' : '#E8DFD0'}`,
        borderRadius: '10px',
        padding: '20px 22px',
        flex: 1,
        minWidth: '200px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <span style={{ fontSize: '14px', fontWeight: 600, color: meta.color }}>
          {meta.icon} {meta.label}
        </span>
        <span
          style={{
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '999px',
            background: configured ? 'rgba(78,122,75,0.12)' : 'rgba(140,127,109,0.12)',
            border: `1px solid ${configured ? 'rgba(78,122,75,0.35)' : '#E8DFD0'}`,
            color: configured ? '#4E7A4B' : '#8C7F6D',
          }}
        >
          {loading ? '…' : configured ? 'Connected' : 'Not set'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
        <div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#211B16', lineHeight: 1.1 }}>
            {loading ? '—' : configured ? stats?.events ?? 0 : '—'}
          </div>
          <div style={{ fontSize: '11px', color: '#8C7F6D', marginTop: '4px' }}>Events</div>
        </div>
        <div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#211B16', lineHeight: 1.1 }}>
            {loading ? '—' : configured ? stats?.tickets ?? 0 : '—'}
          </div>
          <div style={{ fontSize: '11px', color: '#8C7F6D', marginTop: '4px' }}>Tickets sold</div>
        </div>
        <div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: meta.color, lineHeight: 1.1 }}>
            {loading ? '—' : configured ? stats?.bookings ?? 0 : '—'}
          </div>
          <div style={{ fontSize: '11px', color: '#8C7F6D', marginTop: '4px' }}>Bookings</div>
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, sub, loading }: { label: string; value: string | number; sub?: string; loading: boolean }) {
  return (
    <div style={{ background: '#F1EADC', border: '1px solid #E8DFD0', borderRadius: '8px', padding: '14px 18px', flex: 1, minWidth: '140px' }}>
      <div style={{ fontSize: '22px', fontWeight: 700, color: '#211B16' }}>
        {loading ? '—' : value}
      </div>
      <div style={{ fontSize: '12px', color: '#8C7F6D', marginTop: '2px' }}>{label}</div>
      {sub && <div style={{ fontSize: '11px', color: '#8C7F6D', marginTop: '4px', opacity: 0.85 }}>{sub}</div>}
    </div>
  )
}

function formatDate(utc: string) {
  try {
    return new Date(utc).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return utc
  }
}

type SafeSettings = {
  luma?: { configured?: boolean }
  eventbrite?: { configured?: boolean; hasPrivateToken?: boolean }
  hightribe?: { configured?: boolean }
}

export default function DashboardPage() {
  const [settings, setSettings] = useState<SafeSettings>({})
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const s = await getSettings() as SafeSettings
      setSettings(s)
      const dash = await loadDashboardStats(s)
      setStats(dash)
    } catch {
      setStats(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const htConfigured = !!getUser()
  const lumaConfigured = !!(settings.luma?.configured)
  const ebConfigured = !!settings.eventbrite?.hasPrivateToken
  const anyConfigured = lumaConfigured || ebConfigured || htConfigured
  const recent = stats?.recent ?? []

  return (
    <div style={{ maxWidth: '960px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px', gap: '16px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#211B16' }}>Dashboard</h1>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#8C7F6D' }}>
            Events, tickets, and bookings across all connected channels
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{ background: '#F1EADC', border: '1px solid #E8DFD0', borderRadius: '6px', color: '#8C7F6D', padding: '8px 14px', fontSize: '13px', cursor: loading ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          {loading ? (
            <>
              <Spinner size={16} />
              <span>Refreshing…</span>
            </>
          ) : '↻ Refresh'}
        </button>
      </div>

      {loading ? (
        <div style={{ background: '#FFFFFF', border: '1px solid #E8DFD0', borderRadius: '10px', marginBottom: '28px' }}>
          <PageLoader label="Loading dashboard data…" />
        </div>
      ) : (
        <>
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {(['hightribe', 'luma', 'eventbrite'] as ChannelKey[]).map(ch => (
          <ChannelStatCard key={ch} channel={ch} stats={stats?.channels[ch]} loading={false} />
        ))}
      </div>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '28px' }}>
        <SummaryCard label="Total events listed" value={stats?.totalEvents ?? 0} loading={false} />
        <SummaryCard label="Total tickets sold" value={stats?.totalTickets ?? 0} sub="ticket units · all channels" loading={false} />
        <SummaryCard label="Total bookings" value={stats?.totalBookings ?? 0} sub="registrations · all channels" loading={false} />
        <SummaryCard label="Unique attendees" value={stats?.unifiedAttendees ?? 0} sub="deduped by email" loading={false} />
      </div>

      {!anyConfigured && (
        <div style={{ background: '#FFFFFF', border: '2px dashed #E8DFD0', borderRadius: '10px', padding: '32px 24px', textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚙️</div>
          <div style={{ fontSize: '16px', color: '#211B16', marginBottom: '8px', fontWeight: 500 }}>No channels configured yet</div>
          <p style={{ color: '#8C7F6D', fontSize: '14px', marginBottom: '20px' }}>Configure your channels in Settings to get started</p>
          <Link href="/settings" style={{ display: 'inline-block', background: '#D98A2B', borderRadius: '6px', color: '#fff', padding: '9px 18px', fontSize: '14px', fontWeight: 500, textDecoration: 'none' }}>
            Go to Settings
          </Link>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '28px' }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E8DFD0', borderRadius: '10px', padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#211B16' }}>Recent events</h2>
            <Link href="/events" style={{ fontSize: '13px', color: '#D98A2B', textDecoration: 'none' }}>All events →</Link>
          </div>

          {recent.length === 0 ? (
            <div style={{ color: '#8C7F6D', fontSize: '14px', padding: '20px 0', textAlign: 'center' }}>
              No events yet.{' '}
              <Link href="/events?create=1" style={{ color: '#D98A2B', textDecoration: 'none' }}>Create one →</Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {recent.map((evt) => {
                const meta = CH_META[evt.channel]
                return (
                  <div
                    key={`${evt.channel}-${evt.id}`}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#F1EADC', borderRadius: '8px', border: '1px solid #E8DFD0', gap: '12px' }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 500, color: '#211B16', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{evt.title}</div>
                      <div style={{ fontSize: '12px', color: '#8C7F6D', marginTop: '3px' }}>{formatDate(evt.startUtc)}</div>
                    </div>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: meta.color + '14', border: `1px solid ${meta.color}44`, color: meta.color, flexShrink: 0 }}>
                      {meta.icon} {meta.label}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E8DFD0', borderRadius: '10px', padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#211B16' }}>Recent bookings</h2>
            <Link href="/bookings" style={{ fontSize: '13px', color: '#D98A2B', textDecoration: 'none' }}>All bookings →</Link>
          </div>

          {(stats?.recentBookings ?? []).length === 0 ? (
            <div style={{ color: '#8C7F6D', fontSize: '14px', padding: '20px 0', textAlign: 'center', lineHeight: 1.5 }}>
              No bookings yet. Registrations on any channel will appear here.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {(stats?.recentBookings ?? []).map((b, i) => {
                const meta = CH_META[b.channel]
                return (
                  <div
                    key={`${b.email}-${b.registeredAt}-${i}`}
                    style={{ padding: '12px 16px', background: '#F1EADC', borderRadius: '8px', border: '1px solid #E8DFD0' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                      <div style={{ fontSize: '14px', fontWeight: 500, color: '#211B16', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</div>
                      <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', background: meta.color + '14', border: `1px solid ${meta.color}44`, color: meta.color, flexShrink: 0 }}>
                        {meta.icon}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#8C7F6D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.eventTitle}</div>
                    {b.email && b.email !== '—' && (
                      <div style={{ fontSize: '12px', color: '#8C7F6D', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.85 }}>{b.email}</div>
                    )}
                    <div style={{ fontSize: '11px', color: '#8C7F6D', marginTop: '3px', opacity: 0.85 }}>{formatDate(b.registeredAt)}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
        </>
      )}
    </div>
  )
}
