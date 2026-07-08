'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { getSettings } from '@/lib/api'
import { isHightribeChannelConnected, isLumaConnected, isEventbriteConnected } from '@/lib/channel-connection'
import { loadDashboardStats, type DashboardStats } from '@/lib/dashboard-stats'
import { syncAllConnectedChannels } from '@/lib/sync-all-connected'
import { ChannelLogo } from '@/components/ChannelLogo'
import { PageLoader, Spinner } from '@/components/Loader'
import type { ChannelKey } from '@/lib/types'
import './dashboard.css'
import { CHANNEL_META } from '@/lib/channels'

const CH_META: Record<ChannelKey, { label: string; color: string }> = {
  hightribe: { label: CHANNEL_META.hightribe.name, color: CHANNEL_META.hightribe.color },
  luma: { label: CHANNEL_META.luma.name, color: CHANNEL_META.luma.color },
  eventbrite: { label: CHANNEL_META.eventbrite.name, color: CHANNEL_META.eventbrite.color },
}

const KPI_CARDS = [
  { key: 'events', label: 'Total Events', icon: '📅', accent: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' },
  { key: 'tickets', label: 'Tickets Sold', icon: '🎟', accent: '#ff4b2b', bg: 'rgba(255, 75, 43, 0.12)' },
  { key: 'bookings', label: 'Total Bookings', icon: '✓', accent: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' },
  { key: 'attendees', label: 'Unique Attendees', icon: '👥', accent: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)' },
] as const

function formatDate(utc: string) {
  try {
    return new Date(utc).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return utc
  }
}

function formatRelativeDate(utc: string) {
  try {
    const diff = Date.now() - new Date(utc).getTime()
    const mins = Math.floor(diff / 60_000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    if (days < 7) return `${days}d ago`
    return new Date(utc).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

function avatarColors(name: string) {
  const hues = [12, 28, 160, 265, 200, 330]
  const hash = name.split('').reduce((sum, c) => sum + c.charCodeAt(0), 0)
  const hue = hues[hash % hues.length]
  return {
    background: `hsl(${hue} 72% 93%)`,
    color: `hsl(${hue} 52% 36%)`,
  }
}

type SafeSettings = {
  luma?: { configured?: boolean }
  eventbrite?: { configured?: boolean; hasPrivateToken?: boolean }
  Hightribe?: { configured?: boolean }
}

export default function DashboardPage() {
  const [settings, setSettings] = useState<SafeSettings>({})
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    let settingsSnapshot: SafeSettings = {}
    try {
      settingsSnapshot = (await getSettings()) as SafeSettings
      setSettings(settingsSnapshot)
    } catch {
      // Settings failure should not block dashboard counts.
    }

    try {
      const dash = await loadDashboardStats(settingsSnapshot)
      setStats(dash)
    } catch {
      setStats(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const syncAll = useCallback(async () => {
    setSyncing(true)
    let settingsSnapshot: SafeSettings = settings
    try {
      settingsSnapshot = (await getSettings()) as SafeSettings
      setSettings(settingsSnapshot)
    } catch {
      // Keep existing settings snapshot for sync.
    }

    try {
      await syncAllConnectedChannels(settingsSnapshot)
      const dash = await loadDashboardStats(settingsSnapshot)
      setStats(dash)
    } catch {
      setStats(null)
    } finally {
      setSyncing(false)
    }
  }, [settings])

  useEffect(() => {
    load()
  }, [load])

  const htConfigured = isHightribeChannelConnected()
  const lumaConfigured = !!settings.luma?.configured
  const ebConfigured = !!settings.eventbrite?.hasPrivateToken
  const anyConfigured = lumaConfigured || ebConfigured || htConfigured
  const recent = stats?.recent ?? []
  const channelKeys: ChannelKey[] = ['eventbrite', 'luma', 'hightribe']
  const channelRows = channelKeys
    .map((ch) => {
      const count = stats?.channels[ch]?.bookings ?? 0
      const configured = stats?.channels[ch]?.configured ?? false
      return { ch, count, configured, meta: CH_META[ch] }
    })
    .sort((a, b) => b.count - a.count)
  const totalChannelBookings = channelRows.reduce((s, r) => s + r.count, 0)

  const kpiValues: Record<(typeof KPI_CARDS)[number]['key'], string | number> = {
    events: stats?.totalEvents ?? 0,
    tickets: stats?.totalTickets ?? 0,
    bookings: stats?.totalBookings ?? 0,
    attendees: stats?.unifiedAttendees ?? 0,
  }
  const recentOrders = (stats?.recentBookings ?? []).slice(0, 5)

  return (
    <div className="dash">
      <div className="dash-header">
        <h1>Overview</h1>
        <div className="dash-header-actions">
          <Link href="/events?create=1" className="dash-btn dash-btn--primary">
            ✦ Create event
          </Link>
          <button onClick={load} disabled={loading || syncing} className="dash-btn dash-btn--ghost" type="button">
            {loading ? (
              <>
                <Spinner size={16} />
                <span>Refreshing…</span>
              </>
            ) : (
              '↻ Refresh'
            )}
          </button>
          <button onClick={syncAll} disabled={loading || syncing} className="dash-btn dash-btn--sync" type="button">
            {syncing ? (
              <>
                <Spinner size={16} />
                <span>Syncing…</span>
              </>
            ) : (
              '⇅ Sync'
            )}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="dash-loading">
          <PageLoader label="Loading dashboard data…" />
        </div>
      ) : (
        <>
          <div className="dash-kpi-grid">
            {KPI_CARDS.map((kpi) => (
              <div
                key={kpi.key}
                className="dash-kpi"
                style={{
                  ['--kpi-accent' as string]: kpi.accent,
                  ['--kpi-bg' as string]: kpi.bg,
                }}
              >
                <div className="dash-kpi-label">{kpi.label}</div>
                <div className="dash-kpi-value">{kpiValues[kpi.key]}</div>
                <span className="dash-kpi-icon" aria-hidden="true">
                  {kpi.icon}
                </span>
              </div>
            ))}
          </div>

          <div className="dash-panels">
            <section className="dash-panel dash-panel--perf">
              <div className="dash-perf-head">
                <div>
                  <h2>Channel Performance</h2>
                  <p className="dash-perf-sub">Share of bookings by channel</p>
                </div>
                <span className="dash-perf-total">{totalChannelBookings} bookings</span>
              </div>

              {totalChannelBookings === 0 ? (
                <div className="dash-perf-empty">
                  No channel bookings yet. Publish an event to see performance here.
                </div>
              ) : (
                <div className="dash-perf-list">
                  {channelRows.map(({ ch, count, configured, meta }) => {
                    const pct = Math.round((count / totalChannelBookings) * 100)
                    return (
                      <div
                        key={ch}
                        className="dash-perf-item"
                        style={{ ['--ch-color' as string]: meta.color }}
                      >
                        <div className="dash-perf-item-top">
                          <span className="dash-perf-label">
                            <ChannelLogo channel={ch} size={22} />
                            <span className="dash-perf-name">{meta.label}</span>
                            {!configured && (
                              <span className="dash-perf-off">Not connected</span>
                            )}
                          </span>
                          <span className="dash-perf-pct">{pct}%</span>
                        </div>
                        <div className="dash-perf-bar" aria-hidden="true">
                          <div
                            className="dash-perf-fill"
                            style={{
                              width: `${pct}%`,
                              minWidth: pct > 0 ? 6 : 0,
                            }}
                          />
                        </div>
                        <div className="dash-perf-count">
                          {count} {count === 1 ? 'booking' : 'bookings'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              <Link href="/channels" className="dash-view-all">
                Manage channels →
              </Link>
            </section>

            <section className="dash-panel dash-panel--orders">
              <div className="dash-orders-head">
                <div>
                  <h2>Recent Orders</h2>
                  <p className="dash-orders-sub">Latest registrations across channels</p>
                </div>
                <span className="dash-orders-total">{stats?.totalBookings ?? 0} total</span>
              </div>

              {recentOrders.length === 0 ? (
                <div className="dash-orders-empty">
                  No bookings yet. Registrations on any channel will appear here.
                </div>
              ) : (
                <>
                  <div className="dash-orders-list">
                    {recentOrders.map((b, i) => {
                      const meta = CH_META[b.channel]
                      return (
                        <Link
                          key={`${b.email}-${b.registeredAt}-${i}`}
                          href="/bookings"
                          className="dash-order-item"
                          style={{ ['--ch-color' as string]: meta.color }}
                        >
                          <div className="dash-order-item-top">
                            <span className="dash-order-label">
                              <span
                                className="dash-order-avatar"
                                style={avatarColors(b.name)}
                                aria-hidden="true"
                              >
                                {b.name.charAt(0).toUpperCase()}
                              </span>
                              <span className="dash-order-text">
                                <span className="dash-order-name">{b.name}</span>
                                <span className="dash-order-event">{b.eventTitle}</span>
                              </span>
                            </span>
                            <span className="dash-paid-badge">Paid</span>
                          </div>
                          <div className="dash-order-foot">
                            <span className="dash-order-channel">
                              <ChannelLogo channel={b.channel} size={16} />
                              {meta.label}
                            </span>
                            <span className="dash-order-date">{formatRelativeDate(b.registeredAt)}</span>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                  <Link href="/bookings" className="dash-view-all">
                    View all orders →
                  </Link>
                </>
              )}
            </section>
          </div>

          {!anyConfigured && (
            <div className="dash-setup">
              <div className="dash-setup-icon" aria-hidden="true">
                ⚙️
              </div>
              <h3>No channels configured yet</h3>
              <p>Connect your platforms in Settings to start publishing everywhere.</p>
              <Link href="/settings" className="dash-btn dash-btn--primary">
                Go to Settings
              </Link>
            </div>
          )}

          <section className="dash-panel dash-panel--events">
            <div className="dash-panel-head">
              <h2>Recent events</h2>
              <Link href="/events" className="dash-panel-link">
                All events →
              </Link>
            </div>

            {recent.length === 0 ? (
              <div className="dash-empty">
                No events yet. <Link href="/events?create=1">Create one →</Link>
              </div>
            ) : (
              <div className="dash-list">
                {recent.map((evt) => {
                  const meta = CH_META[evt.channel]
                  return (
                    <div
                      key={`${evt.channel}-${evt.id}`}
                      className="dash-event-row"
                      style={{ ['--ch-color' as string]: meta.color }}
                    >
                      <div className="dash-event-info">
                        <div className="dash-event-title">{evt.title}</div>
                        <div className="dash-event-date">{formatDate(evt.startUtc)}</div>
                      </div>
                      <span className="dash-ch-pill">
                        <ChannelLogo channel={evt.channel} size={16} />
                        {meta.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
