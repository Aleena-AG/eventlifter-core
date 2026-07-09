'use client'

import Link from 'next/link'
import { ChannelLogo } from '@/components/ChannelLogo'
import { InlineLoader } from '@/components/Loader'
import { CH_META } from '@/components/ewentcast/config'
import type { AttendeeRecord } from '@/lib/event-registry'
import type { EventTicketType } from '@/lib/event-dashboard-data'
import type { ChannelKey } from '@/lib/types'
import '@/app/create/ewentcast.css'
import './event-live.css'

function Swatch({ color, size = 10 }: { color: string; size?: number }) {
  return <span className="ew-swatch" style={{ width: size, height: size, background: color }} />
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString()}`
  }
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

interface EventLiveDashboardProps {
  title: string
  capacity: number
  attendees: AttendeeRecord[]
  channels: ChannelKey[]
  channelCounts: Partial<Record<ChannelKey, number>>
  registrations: number
  ticketPrice?: number
  currency?: string
  isFree?: boolean
  hasPricing?: boolean
  revenue?: number
  ticketsSoldPct?: number
  ticketTypes?: EventTicketType[]
  startAt?: string | null
  endAt?: string | null
  coverUrl?: string | null
  venue?: string | null
  status?: string | null
  eventUrl?: string | null
  primaryChannel?: ChannelKey
  loading?: boolean
  onRefresh?: () => void
}

export function EventLiveDashboard({
  title,
  capacity,
  attendees,
  channels,
  channelCounts,
  registrations,
  ticketPrice = 0,
  currency = 'USD',
  isFree = false,
  hasPricing = false,
  revenue = 0,
  ticketsSoldPct,
  ticketTypes = [],
  startAt = null,
  endAt = null,
  coverUrl = null,
  venue = null,
  status = null,
  eventUrl = null,
  primaryChannel,
  loading,
  onRefresh,
}: EventLiveDashboardProps) {
  const soldPct =
    ticketsSoldPct != null
      ? ticketsSoldPct
      : capacity > 0
        ? Math.min(100, Math.round((registrations / capacity) * 100))
        : 0
  const totalChannelAttendees = Object.values(channelCounts).reduce((sum, n) => sum + (n || 0), 0)
  const barTotal = Math.max(totalChannelAttendees, 1)

  const revenueLabel = !hasPricing
    ? '—'
    : isFree
      ? 'Free'
      : formatMoney(revenue, currency)

  const revenueSub = !hasPricing
    ? 'price not set'
    : isFree
      ? 'Free event'
      : ticketPrice > 0
        ? `${registrations} × ${formatMoney(ticketPrice, currency)}`
        : `${registrations} registrations`

  const channelKey = primaryChannel || channels[0]
  const ticketSoldTotal = ticketTypes.reduce((s, t) => s + t.sold, 0)
  const ticketQtyTotal = ticketTypes.reduce((s, t) => s + (t.quantity ?? 0), 0)

  return (
    <div className="ew-root ew-embedded">
      <div className="ew-wrap">
        <div className="ew-view">
          <div className="ew-live-layout">
            <div className="ew-live-main">
              <div className="ew-view-body">
                <div className="ew-head">
                  <div className="ew-head-row">
                    <span className="ew-eyebrow">Step 3 · Live</span>
                    {hasPricing && isFree && (
                      <span className="ew-free-badge">Free event</span>
                    )}
                  </div>
                  <h2>{title}</h2>
                  <p>Registrations, revenue, and ticket sales — across every connected channel.</p>
                </div>

                <div className="ew-stats">
                  <div className="ew-stat">
                    <div className="k">Registrations</div>
                    <div className="v">{registrations}</div>
                    <div className="s">across all channels</div>
                  </div>
                  <div className={`ew-stat${hasPricing && isFree ? ' ew-stat--free' : ''}`}>
                    <div className="k">Revenue</div>
                    <div className="v">{revenueLabel}</div>
                    <div className="s">{revenueSub}</div>
                  </div>
                  <div className="ew-stat">
                    <div className="k">Tickets sold</div>
                    <div className="v">{soldPct}%</div>
                    <div className="s">
                      {registrations} of {capacity} capacity
                    </div>
                  </div>
                </div>

                <div className="ew-card">
                  <span className="ew-eyebrow">By channel</span>
                  <div className="ew-bar-chart" aria-hidden="true">
                    {channels.map(ch => {
                      const count = channelCounts[ch] || 0
                      if (!count) return null
                      return (
                        <span
                          key={ch}
                          style={{
                            width: `${(count / barTotal) * 100}%`,
                            background: CH_META[ch].color,
                            display: 'block',
                          }}
                        />
                      )
                    })}
                  </div>
                  {channels.map(ch => (
                    <div key={ch} className="ew-channel-row">
                      <span className="ew-channel-name">
                        <ChannelLogo channel={ch} size={20} />
                        {CH_META[ch].name}
                      </span>
                      <span className="ew-channel-count">{channelCounts[ch] || 0} attendees</span>
                    </div>
                  ))}
                </div>

                <div className="ew-card">
                  <span className="ew-eyebrow">Unified attendee list</span>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
                    ↻ deduped by email · capacity syncs across channels
                  </div>
                  {attendees.length === 0 ? (
                    <p style={{ color: 'var(--muted)', fontSize: 14, margin: '12px 0' }}>
                      No registrations yet. Bookings on any channel will appear here automatically.
                    </p>
                  ) : (
                    attendees.map(a => (
                      <div key={a.email} className="ew-att">
                        <div className="who">
                          <span className="ava">
                            {a.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </span>
                          <div>
                            <div className="nm">{a.name}</div>
                            <div className="ew-srcs">
                              <span>
                                <Swatch color={CH_META[a.source].color} size={7} />
                                {CH_META[a.source].name}
                              </span>
                            </div>
                          </div>
                        </div>
                        <span className="ew-text-success" style={{ fontSize: 12 }}>✓ Registered</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <aside className="ew-detail-card" aria-label="Event details">
              <div className="ew-detail-card__media">
                {coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverUrl} alt="" />
                ) : (
                  <span className="ew-detail-card__placeholder" aria-hidden="true">📅</span>
                )}
              </div>

              <div className="ew-detail-card__body">
                <div className="ew-detail-card__top">
                  {channelKey && (
                    <span
                      className="ew-detail-ch"
                      style={{ ['--ch-color' as string]: CH_META[channelKey].color }}
                    >
                      <ChannelLogo channel={channelKey} size={14} />
                      {CH_META[channelKey].name}
                    </span>
                  )}
                  {status && <span className="ew-detail-status">{status}</span>}
                </div>

                <h3 className="ew-detail-card__title">{title}</h3>

                <dl className="ew-detail-meta">
                  <div>
                    <dt>Starts</dt>
                    <dd>{formatWhen(startAt)}</dd>
                  </div>
                  {endAt && (
                    <div>
                      <dt>Ends</dt>
                      <dd>{formatWhen(endAt)}</dd>
                    </div>
                  )}
                  {venue && (
                    <div>
                      <dt>Venue</dt>
                      <dd>{venue}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Capacity</dt>
                    <dd>
                      {registrations} / {capacity} · {soldPct}% sold
                    </dd>
                  </div>
                </dl>

                <div className="ew-detail-tickets">
                  <div className="ew-detail-tickets__head">
                    <span className="ew-eyebrow">Tickets</span>
                    {ticketTypes.length > 0 && (
                      <span className="ew-detail-tickets__sum">
                        {ticketSoldTotal}
                        {ticketQtyTotal > 0 ? ` / ${ticketQtyTotal}` : ''} sold
                      </span>
                    )}
                  </div>

                  {ticketTypes.length === 0 ? (
                    <p className="ew-detail-tickets__empty">
                      {hasPricing
                        ? isFree
                          ? 'Free event — no ticket tiers configured.'
                          : `Single price · ${formatMoney(ticketPrice, currency)}`
                        : 'No ticket types found for this event yet.'}
                    </p>
                  ) : (
                    <ul className="ew-ticket-list">
                      {ticketTypes.map((t) => {
                        const qty = t.quantity
                        const pct =
                          qty != null && qty > 0
                            ? Math.min(100, Math.round((t.sold / qty) * 100))
                            : null
                        return (
                          <li key={t.id} className="ew-ticket-row">
                            <div className="ew-ticket-row__top">
                              <span className="ew-ticket-row__name">{t.name}</span>
                              <span className={`ew-ticket-row__price${t.isFree ? ' is-free' : ''}`}>
                                {t.isFree ? 'Free' : formatMoney(t.price, t.currency || currency)}
                              </span>
                            </div>
                            <div className="ew-ticket-row__sold">
                              <strong>{t.sold}</strong>
                              {qty != null ? ` of ${qty}` : ''} sold
                              {pct != null ? ` · ${pct}%` : ''}
                            </div>
                            {qty != null && qty > 0 && (
                              <div className="ew-ticket-bar" aria-hidden="true">
                                <span style={{ width: `${pct ?? 0}%` }} />
                              </div>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>

                {eventUrl && (
                  <a
                    href={eventUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ew-detail-link"
                  >
                    Open on channel →
                  </a>
                )}
              </div>
            </aside>
          </div>

          <div className="ew-foot">
            <div className="ew-foot-actions">
              <Link href="/events" className="ew-btn ghost">← Back to events</Link>
              {onRefresh && (
                <button
                  type="button"
                  className="ew-btn primary"
                  onClick={onRefresh}
                  disabled={loading}
                >
                  {loading ? <InlineLoader label="Refreshing" /> : '↻ Refresh'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
