'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BookingDetailModal, bookingForAttendee } from '@/components/bookings/BookingDetailModal'
import { ChannelLogo } from '@/components/ChannelLogo'
import { InlineLoader } from '@/components/Loader'
import { CH_META, getChannelMeta } from '@/components/ewentcast/config'
import type { AttendeeRecord } from '@/lib/event-registry'
import type { BookingListItem } from '@/lib/bookings'
import type { EventTicketType } from '@/lib/event-dashboard-data'
import type { ChannelKey } from '@/lib/types'
import '@/app/create/ewentcast.css'
import './event-live.css'

function Swatch({ color, size = 10 }: { color: string; size?: number }) {
  return <span className="ew-swatch" style={{ width: size, height: size, background: color }} />
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      currencyDisplay: 'narrowSymbol',
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount)
  } catch {
    return `$${amount.toLocaleString()}`
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

/** Short date like "23 Jul 2026" for booking table columns. */
function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function externalEventHref(url: string): string {
  const value = url.trim()
  if (/^https?:\/\//i.test(value)) return value
  if (value.startsWith('//')) return `https:${value}`
  return `https://${value.replace(/^\/+/, '')}`
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

function ticketNamesLabel(b: BookingListItem): string {
  if (b.tickets?.length) {
    return b.tickets
      .map((t) => (t.quantity > 1 ? `${t.name} ×${t.quantity}` : t.name))
      .join(', ')
  }
  return '—'
}

interface EventLiveDashboardProps {
  title: string
  capacity: number
  attendees: AttendeeRecord[]
  bookings?: BookingListItem[]
  channels: ChannelKey[]
  channelUrls?: Partial<Record<ChannelKey, string>>
  channelCounts: Partial<Record<ChannelKey, number>>
  channelRevenue?: Partial<Record<ChannelKey, number>>
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
  bookings = [],
  channels,
  channelUrls = {},
  channelCounts,
  channelRevenue = {},
  registrations,
  ticketPrice = 0,
  currency = 'USD',
  isFree = false,
  hasPricing = false,
  revenue = 0,
  ticketsSoldPct,
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
  const [detailBooking, setDetailBooking] = useState<BookingListItem | null>(null)

  useEffect(() => {
    if (!detailBooking) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDetailBooking(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detailBooking])

  const soldPct =
    ticketsSoldPct != null
      ? ticketsSoldPct
      : capacity > 0
        ? Math.min(100, Math.round((registrations / capacity) * 100))
        : 0
  const totalChannelAttendees = channels.reduce((sum, ch) => sum + (channelCounts[ch] || 0), 0)
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

  return (
    <div className="ew-root ew-embedded">
      {detailBooking && (
        <BookingDetailModal booking={detailBooking} onClose={() => setDetailBooking(null)} />
      )}
      <div className="ew-wrap">
        <div className="ew-view">
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

            <div className="ew-live-layout">
              <div className="ew-live-main">
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
                  <div className="ew-channel-head">
                    <span className="ew-eyebrow">Revenue by channel</span>
                    <span className="ew-channel-head__count">
                      {hasPricing && !isFree
                        ? formatMoney(revenue, currency)
                        : hasPricing && isFree
                          ? 'Free event'
                          : `${channels.length} channels`}
                    </span>
                  </div>
                  <div className="ew-bar-chart" aria-hidden="true">
                    {channels.map(ch => {
                      const amount = channelRevenue[ch] || 0
                      const share = isFree
                        ? (channelCounts[ch] || 0)
                        : amount
                      if (!share) return null
                      const denom = isFree
                        ? barTotal
                        : Math.max(
                            channels.reduce((s, c) => s + (channelRevenue[c] || 0), 0),
                            1,
                          )
                      return (
                        <span
                          key={ch}
                          style={{
                            width: `${(share / denom) * 100}%`,
                            background: CH_META[ch].color,
                            display: 'block',
                          }}
                        />
                      )
                    })}
                  </div>
                  {channels.map(ch => {
                    const count = channelCounts[ch] || 0
                    const amount = channelRevenue[ch] || 0
                    const amountLabel = !hasPricing
                      ? '—'
                      : isFree
                        ? 'Free'
                        : formatMoney(amount, currency)
                    return (
                      <div key={ch} className="ew-channel-row">
                        <span className="ew-channel-name">
                          <ChannelLogo channel={ch} size={20} />
                          {CH_META[ch].name}
                          {ch === channelKey && (
                            <span className="ew-channel-primary">Primary</span>
                          )}
                        </span>
                        <span className="ew-channel-stats">
                          <span className="ew-channel-revenue">{amountLabel}</span>
                          <span className="ew-channel-count">
                            {count} {count === 1 ? 'attendee' : 'attendees'}
                          </span>
                        </span>
                      </div>
                    )
                  })}
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
                  {status && (
                    <div className="ew-detail-card__top">
                      <span className="ew-detail-status">{status}</span>
                    </div>
                  )}

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

                  <div className="ew-detail-links" aria-label="View event on channels">
                    {channels.map((ch) => {
                      const url = channelUrls[ch] || (ch === channelKey ? eventUrl : null)
                      if (!url) return null
                      const meta = getChannelMeta(ch)
                      return (
                        <a
                          key={ch}
                          href={externalEventHref(url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ew-detail-link"
                          aria-label={`View ${title} on ${meta.name}`}
                        >
                          <ChannelLogo channel={ch} size={18} />
                          <span>View on {meta.name}</span>
                          <EyeIcon />
                        </a>
                      )
                    })}
                  </div>
                </div>
              </aside>
            </div>

            <div className="ew-card ew-card--bookings">
              <span className="ew-eyebrow">Unified attendee list</span>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
                ↻ Hightribe · Luma · Eventbrite · linked channels
              </div>
              {bookings.length === 0 && attendees.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: 14, margin: '12px 0' }}>
                  No registrations yet. Bookings on any channel will appear here automatically.
                </p>
              ) : (
                <div className="ew-bookings-scroll">
                  <table className="ew-bookings-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Channel</th>
                        <th>Event</th>
                        <th>Booking ID</th>
                        <th>Booked</th>
                        <th>Payment</th>
                        <th>Type</th>
                        <th>Tickets</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(bookings.length
                        ? bookings
                        : attendees.map((a) => bookingForAttendee(a, bookings, title))
                      ).map((b) => {
                        const srcMeta = getChannelMeta(b.channel)
                        return (
                          <tr key={b.id}>
                            <td>
                              <button
                                type="button"
                                className="ew-bookings-guest"
                                onClick={() => setDetailBooking(b)}
                              >
                                {b.name}
                              </button>
                            </td>
                            <td className="ew-bookings-td--wrap">{b.email || '—'}</td>
                            <td>
                              <span className="ew-bookings-channel">
                                <Swatch color={srcMeta.color} size={7} />
                                {srcMeta.name}
                              </span>
                            </td>
                            <td className="ew-bookings-td--wrap">{b.eventTitle || title}</td>
                            <td>{b.bookingId != null ? b.bookingId : '—'}</td>
                            <td>{formatShortDate(b.registeredAt)}</td>
                            <td>{b.paymentStatus || '—'}</td>
                            <td>{b.bookingType || '—'}</td>
                            <td className="ew-bookings-td--wrap">{ticketNamesLabel(b)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
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
