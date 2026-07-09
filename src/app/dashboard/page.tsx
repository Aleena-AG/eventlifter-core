'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { getSettings } from '@/lib/api'
import { isHightribeChannelConnected } from '@/lib/channel-connection'
import {
  loadDashboardStats,
  type DashboardRecentEvent,
  type DashboardStats,
} from '@/lib/dashboard-stats'
import { listMasterEvents, type MasterEventRecord } from '@/lib/event-registry'
import { syncAllConnectedChannels } from '@/lib/sync-all-connected'
import { ChannelLogo } from '@/components/ChannelLogo'
import { PageLoader, Spinner } from '@/components/Loader'
import { encodeEventRef } from '@/lib/event-ref'
import type { ChannelKey } from '@/lib/types'
import './dashboard.css'
import { CHANNEL_KEYS, CHANNEL_META } from '@/lib/channels'

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

type EventPhase = 'ongoing' | 'upcoming' | 'past'

function parseMs(iso?: string | null): number {
  if (!iso) return 0
  const ms = new Date(iso).getTime()
  return Number.isNaN(ms) ? 0 : ms
}

function getEventPhase(evt: DashboardRecentEvent, now = Date.now()): EventPhase {
  const startMs = parseMs(evt.startUtc)
  const endMs = parseMs(evt.endUtc) || startMs
  const st = (evt.status || '').toLowerCase()

  if (/cancel|canceled|cancelled|draft|completed|ended|past|closed/.test(st)) {
    return 'past'
  }
  if (endMs > 0 && endMs < now) return 'past'
  if (startMs > 0 && startMs <= now && (endMs <= 0 || endMs >= now)) return 'ongoing'
  if (startMs > now) return 'upcoming'
  return 'past'
}

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

function formatShortDay(isoDate: string) {
  try {
    return new Date(isoDate + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' })
  } catch {
    return isoDate.slice(5)
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

function formatCountdown(startUtc: string): string {
  const ms = parseMs(startUtc) - Date.now()
  if (ms <= 0) return 'Starting soon'
  const mins = Math.floor(ms / 60_000)
  if (mins < 60) return `in ${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 48) return `in ${hrs}h`
  const days = Math.floor(hrs / 24)
  return `in ${days}d`
}

const QUICK_ACTIONS = [
  {
    href: '/create',
    title: 'Create event',
    desc: 'Draft once, publish everywhere',
    icon: '✦',
    accent: '#ff4b2b',
    featured: true,
  },
  {
    href: '/events',
    title: 'Manage events',
    desc: 'Edit, sync, or archive',
    icon: '📅',
    accent: '#10b981',
  },
  {
    href: '/bookings',
    title: 'All bookings',
    desc: 'Unified guest list',
    icon: '✓',
    accent: '#8b5cf6',
  },
  {
    href: '/channels',
    title: 'Channels',
    desc: 'Connections & sync',
    icon: '🔗',
    accent: '#f59e0b',
  },
] as const

function avatarColors(name: string) {
  const hues = [12, 28, 160, 265, 200, 330]
  const hash = name.split('').reduce((sum, c) => sum + c.charCodeAt(0), 0)
  const hue = hues[hash % hues.length]
  return {
    background: `hsl(${hue} 72% 93%)`,
    color: `hsl(${hue} 52% 36%)`,
  }
}

type DashboardEventCardItem = DashboardRecentEvent & {
  channels: ChannelKey[]
}

const CHANNEL_ORDER: ChannelKey[] = ['eventbrite', 'luma', 'hightribe']

function normalizeEventTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[—–−]/g, '-')
    .replace(/\b20\d{2}\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/** True when titles are the same event (handles slight channel naming differences). */
function titlesMatch(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  if (a.includes(b) || b.includes(a)) return true
  const aw = a.split(' ')
  const bw = b.split(' ')
  const [shorter, longer] = aw.length <= bw.length ? [aw, bw] : [bw, aw]
  if (shorter.length < 3) return false
  const longSet = new Set(longer)
  const overlap = shorter.filter((w) => longSet.has(w)).length
  return overlap / shorter.length >= 0.8
}

function publishedChannelsFromMaster(master: MasterEventRecord): ChannelKey[] {
  return CHANNEL_KEYS.filter((ch) => {
    const ref = master.channels[ch]
    if (!ref) return false
    const eventId = String(ref.eventId || '').trim()
    const url = String(ref.url || '').trim()
    // Count real publishes only (skip empty stubs like eventId "" + "lu.ma/")
    if (eventId) return true
    return url.length > 8 && !url.endsWith('/')
  })
}

function sortChannels(channels: ChannelKey[]): ChannelKey[] {
  return [...new Set(channels)].sort(
    (a, b) => CHANNEL_ORDER.indexOf(a) - CHANNEL_ORDER.indexOf(b),
  )
}

function resolvePublishedChannels(
  evt: DashboardRecentEvent,
  byRef: Map<string, ChannelKey[]>,
  masterTitleChannels: Array<{ title: string; channels: ChannelKey[] }>,
): ChannelKey[] {
  const fromRef = byRef.get(`${evt.channel}:${evt.id}`) || []
  const titleKey = normalizeEventTitle(evt.title)
  const fromTitle = masterTitleChannels
    .filter((m) => titlesMatch(titleKey, m.title))
    .flatMap((m) => m.channels)
  return sortChannels([evt.channel, ...fromRef, ...fromTitle])
}

/** Merge same event across channels into one card, then attach every published channel from the registry. */
function mergeEventsWithChannels(
  events: DashboardRecentEvent[],
  masters: MasterEventRecord[],
): DashboardEventCardItem[] {
  const byRef = new Map<string, ChannelKey[]>()
  const masterTitleChannels: Array<{ title: string; channels: ChannelKey[] }> = []

  for (const master of masters) {
    const published = publishedChannelsFromMaster(master)
    if (!published.length) continue
    const titleKey = normalizeEventTitle(master.title)
    if (titleKey) masterTitleChannels.push({ title: titleKey, channels: published })
    for (const ch of CHANNEL_KEYS) {
      const ref = master.channels[ch]
      const eventId = String(ref?.eventId || '').trim()
      if (!eventId) continue
      byRef.set(`${ch}:${eventId}`, published)
    }
  }

  const groups: DashboardEventCardItem[] = []

  for (const evt of events) {
    const titleKey = normalizeEventTitle(evt.title)
    const channels = resolvePublishedChannels(evt, byRef, masterTitleChannels)
    const existing = groups.find((g) => titlesMatch(normalizeEventTitle(g.title), titleKey))

    if (!existing) {
      groups.push({ ...evt, channels })
      continue
    }

    existing.channels = sortChannels([...existing.channels, ...channels])
    if (!existing.coverUrl && evt.coverUrl) existing.coverUrl = evt.coverUrl
    if (!existing.endUtc && evt.endUtc) existing.endUtc = evt.endUtc
    if (evt.channel === 'hightribe' && existing.channel !== 'hightribe') {
      existing.id = evt.id
      existing.channel = evt.channel
    } else if (
      CHANNEL_ORDER.indexOf(evt.channel) < CHANNEL_ORDER.indexOf(existing.channel) &&
      existing.channel !== 'hightribe'
    ) {
      existing.id = evt.id
      existing.channel = evt.channel
    }
  }

  return groups
}

function DashboardEventCard({ evt, phase }: { evt: DashboardEventCardItem; phase: EventPhase }) {
  const primaryMeta = CH_META[evt.channel]
  const href = `/events/e/${encodeEventRef(evt.channel, evt.id)}`

  return (
    <Link
      href={href}
      className={`dash-event-card dash-event-card--${phase}`}
      style={{ ['--ch-color' as string]: primaryMeta.color }}
    >
      <div className="dash-event-card__media">
        {evt.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={evt.coverUrl} alt="" />
        ) : (
          <span className="dash-event-card__placeholder" aria-hidden="true">
            📅
          </span>
        )}
        <span className={`dash-event-card__badge dash-event-card__badge--${phase}`}>
          {phase === 'ongoing' ? 'Live now' : 'Upcoming'}
        </span>
      </div>
      <div className="dash-event-card__body">
        <h3 className="dash-event-card__title">{evt.title}</h3>
        <p className="dash-event-card__date">{formatDate(evt.startUtc)}</p>
        <div className="dash-event-card__foot">
          <div className="dash-ch-tags" aria-label="Published channels">
            {evt.channels.map((ch) => (
              <span
                key={ch}
                className="dash-ch-pill dash-ch-pill--sm"
                style={{ ['--ch-color' as string]: CH_META[ch].color }}
                title={CH_META[ch].label}
              >
                <ChannelLogo channel={ch} size={11} />
                {CH_META[ch].label}
              </span>
            ))}
          </div>
          <span className="dash-event-card__cta">Open →</span>
        </div>
      </div>
    </Link>
  )
}

type SafeSettings = {
  luma?: { configured?: boolean }
  eventbrite?: { configured?: boolean; hasPrivateToken?: boolean }
  Hightribe?: { configured?: boolean }
}

export default function DashboardPage() {
  const [settings, setSettings] = useState<SafeSettings>({})
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [masters, setMasters] = useState<MasterEventRecord[]>([])
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
      const [dash, masterList] = await Promise.all([
        loadDashboardStats(settingsSnapshot),
        listMasterEvents().catch(() => [] as MasterEventRecord[]),
      ])
      setStats(dash)
      setMasters(masterList)
    } catch {
      setStats(null)
      setMasters([])
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
      const [dash, masterList] = await Promise.all([
        loadDashboardStats(settingsSnapshot),
        listMasterEvents().catch(() => [] as MasterEventRecord[]),
      ])
      setStats(dash)
      setMasters(masterList)
    } catch {
      setStats(null)
      setMasters([])
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

  const { ongoing, upcoming, nextUp, weekEvents } = useMemo(() => {
    const now = Date.now()
    const weekEnd = now + 7 * 24 * 60 * 60 * 1000
    const all = mergeEventsWithChannels(stats?.recent ?? [], masters)
    const ongoingList: DashboardEventCardItem[] = []
    const upcomingList: DashboardEventCardItem[] = []
    let weekCount = 0

    for (const evt of all) {
      const phase = getEventPhase(evt, now)
      const start = parseMs(evt.startUtc)
      if (phase === 'ongoing') ongoingList.push(evt)
      else if (phase === 'upcoming') {
        upcomingList.push(evt)
        if (start > now && start <= weekEnd) weekCount += 1
      }
    }

    ongoingList.sort((a, b) => parseMs(a.startUtc) - parseMs(b.startUtc))
    upcomingList.sort((a, b) => parseMs(a.startUtc) - parseMs(b.startUtc))

    return {
      ongoing: ongoingList.slice(0, 6),
      upcoming: upcomingList.slice(0, 6),
      nextUp: ongoingList[0] || upcomingList[0] || null,
      weekEvents: weekCount + ongoingList.length,
    }
  }, [stats?.recent, masters])

  const connectedChannels = [
    { key: 'eventbrite' as const, on: ebConfigured },
    { key: 'luma' as const, on: lumaConfigured },
    { key: 'hightribe' as const, on: htConfigured },
  ].filter((c) => c.on)

  const kpiValues: Record<(typeof KPI_CARDS)[number]['key'], string | number> = {
    events: stats?.totalEvents ?? 0,
    tickets: stats?.totalTickets ?? 0,
    bookings: stats?.totalBookings ?? 0,
    attendees: stats?.unifiedAttendees ?? 0,
  }
  const recentOrders = (stats?.recentBookings ?? []).slice(0, 3)
  const bookingTrend = stats?.bookingTrend ?? []
  const trendMax = Math.max(1, ...bookingTrend.map((p) => p.count))
  const trendTotal = bookingTrend.reduce((s, p) => s + p.count, 0)

  const totalBookings = stats?.totalBookings ?? 0
  const uniqueAttendees = stats?.unifiedAttendees ?? 0
  const repeatRate =
    totalBookings > 0 && uniqueAttendees > 0
      ? Math.max(0, Math.round(((totalBookings - uniqueAttendees) / totalBookings) * 100))
      : 0
  const avgPerEvent =
    (stats?.totalEvents ?? 0) > 0
      ? Math.round((totalBookings / (stats?.totalEvents || 1)) * 10) / 10
      : 0
  const nextPhase = nextUp ? getEventPhase(nextUp) : null
  const nextHref = nextUp ? `/events/e/${encodeEventRef(nextUp.channel, nextUp.id)}` : null

  return (
    <div className="dash">
      <div className="dash-header">
        <h1>Overview</h1>
        <div className="dash-header-actions">
          <Link href="/create" className="dash-btn dash-btn--primary">
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

          <section className="dash-panel dash-panel--live-events">
            <div className="dash-panel-head dash-panel-head--flush">
              <div>
                <h2>Your events</h2>
                <p className="dash-section-sub">Ongoing and upcoming — click a card to open details</p>
              </div>
              <Link href="/events" className="dash-panel-link">
                All events →
              </Link>
            </div>

            {ongoing.length === 0 && upcoming.length === 0 ? (
              <div className="dash-empty dash-empty--compact">
                No upcoming or ongoing events. <Link href="/create">Create one →</Link>
              </div>
            ) : (
              <div className="dash-event-sections">
                {ongoing.length > 0 && (
                  <div className="dash-event-section">
                    <div className="dash-event-section__head">
                      <h3>
                        <span className="dash-live-dot" aria-hidden="true" />
                        Ongoing
                      </h3>
                      <span className="dash-event-section__count">{ongoing.length}</span>
                    </div>
                    <div className="dash-event-grid">
                      {ongoing.map((evt) => (
                        <DashboardEventCard
                          key={`ongoing-${evt.title}-${evt.startUtc.slice(0, 10)}`}
                          evt={evt}
                          phase="ongoing"
                        />
                      ))}
                    </div>
                  </div>
                )}

                {upcoming.length > 0 && (
                  <div className="dash-event-section">
                    <div className="dash-event-section__head">
                      <h3>Upcoming</h3>
                      <span className="dash-event-section__count">{upcoming.length}</span>
                    </div>
                    <div className="dash-event-grid">
                      {upcoming.map((evt) => (
                        <DashboardEventCard
                          key={`upcoming-${evt.title}-${evt.startUtc.slice(0, 10)}`}
                          evt={evt}
                          phase="upcoming"
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="dash-panel dash-panel--pulse">
            <div className="dash-panel-head dash-panel-head--flush">
              <div>
                <h2>Event pulse</h2>
                <p className="dash-section-sub">What matters next — timing, pace, and audience</p>
              </div>
            </div>

            <div className="dash-pulse-grid">
              {nextUp && nextHref ? (
                <Link
                  href={nextHref}
                  className="dash-pulse-hero"
                  style={{ ['--ch-color' as string]: CH_META[nextUp.channel].color }}
                >
                  <div className="dash-pulse-hero__top">
                    <span className={`dash-pulse-tag dash-pulse-tag--${nextPhase}`}>
                      {nextPhase === 'ongoing' ? 'Live now' : 'Next up'}
                    </span>
                    <span className="dash-pulse-countdown">
                      {nextPhase === 'ongoing' ? 'Happening now' : formatCountdown(nextUp.startUtc)}
                    </span>
                  </div>
                  <h3 className="dash-pulse-hero__title">{nextUp.title}</h3>
                  <p className="dash-pulse-hero__date">{formatDate(nextUp.startUtc)}</p>
                  <div className="dash-pulse-hero__foot">
                    <span className="dash-ch-pill">
                      <ChannelLogo channel={nextUp.channel} size={14} />
                      {CH_META[nextUp.channel].label}
                    </span>
                    <span className="dash-pulse-hero__cta">Open details →</span>
                  </div>
                </Link>
              ) : (
                <div className="dash-pulse-hero dash-pulse-hero--empty">
                  <h3>Nothing on the calendar</h3>
                  <p>Create an event to see your next countdown here.</p>
                  <Link href="/create" className="dash-btn dash-btn--primary">
                    ✦ Create event
                  </Link>
                </div>
              )}

              <div className="dash-pulse-metrics">
                <div className="dash-pulse-metric">
                  <span className="dash-pulse-metric__label">This week</span>
                  <strong className="dash-pulse-metric__value">{weekEvents}</strong>
                  <span className="dash-pulse-metric__hint">
                    {weekEvents === 1 ? 'event live or starting' : 'events live or starting'}
                  </span>
                </div>
                <div className="dash-pulse-metric">
                  <span className="dash-pulse-metric__label">Avg bookings / event</span>
                  <strong className="dash-pulse-metric__value">{avgPerEvent}</strong>
                  <span className="dash-pulse-metric__hint">across all events</span>
                </div>
                <div className="dash-pulse-metric">
                  <span className="dash-pulse-metric__label">Repeat interest</span>
                  <strong className="dash-pulse-metric__value">{repeatRate}%</strong>
                  <span className="dash-pulse-metric__hint">
                    {uniqueAttendees} unique of {totalBookings} bookings
                  </span>
                </div>
                <div className="dash-pulse-metric">
                  <span className="dash-pulse-metric__label">Connected</span>
                  <strong className="dash-pulse-metric__value">
                    {connectedChannels.length}
                    <span className="dash-pulse-metric__of">/3</span>
                  </strong>
                  <div className="dash-pulse-channels">
                    {(['eventbrite', 'luma', 'hightribe'] as ChannelKey[]).map((ch) => {
                      const on = connectedChannels.some((c) => c.key === ch)
                      return (
                        <span
                          key={ch}
                          className={`dash-pulse-ch${on ? ' dash-pulse-ch--on' : ''}`}
                          style={{ ['--ch-color' as string]: CH_META[ch].color }}
                          title={`${CH_META[ch].label}${on ? '' : ' (not connected)'}`}
                        >
                          <ChannelLogo channel={ch} size={16} />
                        </span>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="dash-panels">
            <section className="dash-panel dash-panel--trend">
              <div className="dash-perf-head">
                <div>
                  <h2>Bookings (7 days)</h2>
                  <p className="dash-perf-sub">Daily registrations across all channels</p>
                </div>
                <span className="dash-perf-total">{trendTotal} this week</span>
              </div>

              {trendTotal === 0 ? (
                <div className="dash-perf-empty">
                  No bookings in the last 7 days yet.
                </div>
              ) : (
                <div className="dash-trend" role="img" aria-label="Bookings over the last 7 days">
                  {bookingTrend.map((point) => {
                    const hasCount = point.count > 0
                    const height = hasCount
                      ? Math.max(12, Math.round((point.count / trendMax) * 100))
                      : 3
                    return (
                      <div key={point.date} className="dash-trend-col">
                        <div className="dash-trend-value">{hasCount ? point.count : ''}</div>
                        <div className="dash-trend-bar-wrap">
                          <div
                            className={`dash-trend-bar${hasCount ? '' : ' dash-trend-bar--empty'}`}
                            style={{ height: `${height}%` }}
                            title={`${point.count} on ${point.date}`}
                          />
                        </div>
                        <div className="dash-trend-label">{formatShortDay(point.date)}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            <section className="dash-panel dash-panel--orders">
              <div className="dash-orders-head">
                <div>
                  <h2>Recent Bookings</h2>
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
                    View all bookings →
                  </Link>
                </>
              )}
            </section>
          </div>

          {!anyConfigured ? (
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
          ) : (
            <section className="dash-panel dash-panel--quick">
              <div className="dash-panel-head dash-panel-head--flush">
                <div>
                  <h2>Quick actions</h2>
                  <p className="dash-section-sub">Jump straight into the work that moves events forward</p>
                </div>
              </div>
              <div className="dash-quick-grid">
                {QUICK_ACTIONS.map((action) => (
                  <Link
                    key={action.href}
                    href={action.href}
                    className={`dash-quick-link${'featured' in action && action.featured ? ' dash-quick-link--featured' : ''}`}
                    style={{ ['--qa-accent' as string]: action.accent }}
                  >
                    <span className="dash-quick-icon" aria-hidden="true">
                      {action.icon}
                    </span>
                    <span className="dash-quick-text">
                      <strong>{action.title}</strong>
                      <em>{action.desc}</em>
                    </span>
                    <span className="dash-quick-arrow" aria-hidden="true">
                      →
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
