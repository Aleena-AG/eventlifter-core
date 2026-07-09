'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { loadAllBookings, type BookingListItem } from '@/lib/bookings'
import { getSettings } from '@/lib/api'
import type { ChannelSettingsView } from '@/lib/channel-connection'
import { syncAllConnectedChannels } from '@/lib/sync-all-connected'
import { ChannelLogo } from '@/components/ChannelLogo'
import { InlineLoader, PageLoader } from '@/components/Loader'
import { getUser } from '@/lib/auth'
import type { ChannelKey } from '@/lib/types'
import { CHANNEL_META } from '@/lib/channels'
import './bookings.css'

const CH_META: Record<ChannelKey, { label: string; color: string }> = {
  hightribe: { label: CHANNEL_META.hightribe.name, color: CHANNEL_META.hightribe.color },
  luma: { label: CHANNEL_META.luma.name, color: CHANNEL_META.luma.color },
  eventbrite: { label: CHANNEL_META.eventbrite.name, color: CHANNEL_META.eventbrite.color },
}

type Filter = 'all' | ChannelKey
type SortKey = 'guest' | 'event' | 'amount' | 'booked' | 'status'
type SortDir = 'asc' | 'desc'

function formatDate(utc?: string) {
  if (!utc) return '—'
  try {
    return new Date(utc).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return utc
  }
}

function formatRelativeDate(utc?: string) {
  if (!utc) return ''
  try {
    const diff = Date.now() - new Date(utc).getTime()
    const mins = Math.floor(diff / 60_000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    if (days < 30) return `${days}d ago`
    return ''
  } catch {
    return ''
  }
}

function formatEventDate(start?: string, end?: string) {
  if (!start) return '—'
  try {
    const s = new Date(start)
    const startStr = s.toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
    if (!end || end === start) return startStr
    const e = new Date(end)
    if (s.toDateString() === e.toDateString()) {
      const endTime = e.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit' })
      return `${startStr} – ${endTime}`
    }
    const endStr = e.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    return `${startStr} – ${endStr}`
  } catch {
    return start
  }
}

function statusBadgeClass(status?: string) {
  if (!status) return ''
  if (status === 'approved') return 'bookings-badge--approved'
  if (status === 'pending') return 'bookings-badge--pending'
  if (status === 'rejected' || status === 'cancelled') return 'bookings-badge--rejected'
  return ''
}

function paymentBadgeClass(status?: string) {
  if (!status) return ''
  if (status === 'paid') return 'bookings-badge--paid'
  if (status === 'unpaid' || status === 'expired' || status === 'cancelled') return 'bookings-badge--unpaid'
  return ''
}

function guestInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function guestContact(b: BookingListItem) {
  if (b.phone && b.phone !== '—') return b.phone
  if (b.email && b.email !== '—') return b.email
  return '—'
}

function formatAmount(b: BookingListItem) {
  if (b.totalPrice == null) return '—'
  if (b.totalPrice === 0) return 'Free'
  return `${b.totalPrice.toLocaleString()} ${b.currency || ''}`.trim()
}

function sortBookings(items: BookingListItem[], key: SortKey, dir: SortDir): BookingListItem[] {
  const sorted = [...items].sort((a, b) => {
    let cmp = 0
    switch (key) {
      case 'guest':
        cmp = a.name.localeCompare(b.name)
        break
      case 'event':
        cmp = a.eventTitle.localeCompare(b.eventTitle)
        break
      case 'amount':
        cmp = (a.totalPrice ?? -1) - (b.totalPrice ?? -1)
        break
      case 'status':
        cmp = (a.status || '').localeCompare(b.status || '')
        break
      case 'booked':
      default:
        cmp = new Date(a.registeredAt).getTime() - new Date(b.registeredAt).getTime()
        break
    }
    return dir === 'asc' ? cmp : -cmp
  })
  return sorted
}

function NotesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function BookingNotesModal({
  booking,
  onClose,
}: {
  booking: BookingListItem
  onClose: () => void
}) {
  const meta = CH_META[booking.channel]
  return (
    <div
      className="bookings-notes-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bookings-notes-modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-notes-title"
      >
        <div className="bookings-notes-modal__head">
          <div>
            <h2 id="booking-notes-title" className="bookings-notes-modal__title">Booking Notes</h2>
            <p className="bookings-notes-modal__sub">{booking.name} · {booking.eventTitle}</p>
          </div>
          <button type="button" className="bookings-notes-modal__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="bookings-notes-modal__body">
          <div className="bookings-notes-modal__meta">
            {booking.bookingId != null && (
              <span className="bookings-notes-modal__tag">#{booking.bookingId}</span>
            )}
            <span className="bookings-notes-modal__tag" style={{ color: meta.color }}>
              {meta.label}
            </span>
            {booking.status && (
              <span className="bookings-notes-modal__tag">{booking.status}</span>
            )}
            <span className="bookings-notes-modal__tag">{formatDate(booking.registeredAt)}</span>
          </div>
          <div className="bookings-notes-modal__content">
            {booking.notes ? booking.notes : (
              <span className="bookings-notes-modal__empty">No notes for this booking.</span>
            )}
          </div>
        </div>
        <div className="bookings-notes-modal__foot">
          <button type="button" className="bookings-notes-modal__done" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <svg className={`bookings-sort-svg${active ? ' active' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 9l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity={active && dir === 'asc' ? 1 : 0.28} />
      <path d="M8 15l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity={active && dir === 'desc' ? 1 : 0.28} />
    </svg>
  )
}

function SortHeader({
  label, sortKey, activeKey, dir, onSort, align,
}: {
  label: string
  sortKey: SortKey
  activeKey: SortKey
  dir: SortDir
  onSort: (k: SortKey) => void
  align?: 'num'
}) {
  const active = activeKey === sortKey
  return (
    <th
      className={`bookings-th--sortable${active ? ' bookings-th--active' : ''}${align === 'num' ? ' bookings-th--num' : ''}`}
      onClick={() => onSort(sortKey)}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span className="bookings-th-inner">
        <span className="bookings-th-label">{label}</span>
        <SortIcon active={active} dir={dir} />
      </span>
    </th>
  )
}

function NotesHeaderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function BookingCard({
  booking: b,
  onNotes,
}: {
  booking: BookingListItem
  onNotes: (b: BookingListItem) => void
}) {
  const meta = CH_META[b.channel]
  return (
    <article className="bookings-card" style={{ ['--row-accent' as string]: meta.color }}>
      <div className="bookings-card__accent" />
      <div className="bookings-card__body">
        <div className="bookings-card__top">
          <div className="bookings-guest">
            <div
              className="bookings-avatar"
              style={{
                background: `${meta.color}18`,
                border: `1px solid ${meta.color}33`,
                color: meta.color,
              }}
            >
              {guestInitials(b.name)}
            </div>
            <div className="bookings-card__guest-info">
              <div className="bookings-guest__name">{b.name}</div>
              <div className="bookings-guest__contact">{guestContact(b)}</div>
            </div>
          </div>
          <div className={`bookings-amount bookings-card__amount${b.totalPrice === 0 ? ' bookings-amount--free' : ''}`}>
            {formatAmount(b)}
          </div>
        </div>

        <div className="bookings-card__event">
          <div className="bookings-event__title">{b.eventTitle}</div>
          <div className="bookings-event__date">
            <span aria-hidden="true">📅</span>
            {formatEventDate(b.eventStart, b.eventEnd)}
          </div>
        </div>

        <div className="bookings-card__row">
          <span className="bookings-card__label">Tickets</span>
          <div className="bookings-tickets bookings-card__tickets">
            {b.tickets?.length ? (
              b.tickets.map((t, i) => (
                <span key={i} className="bookings-ticket-chip">
                  {t.color && <span className="bookings-ticket-dot" style={{ background: t.color }} />}
                  {t.name} ×{t.quantity}
                </span>
              ))
            ) : (
              <span className="bookings-ticket-chip">
                {b.ticketCount ?? 1} ticket{(b.ticketCount ?? 1) === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>

        <div className="bookings-card__row">
          <span className="bookings-card__label">Status</span>
          <div className="bookings-status-group bookings-card__status">
            {b.status && (
              <span className={`bookings-badge ${statusBadgeClass(b.status)}`}>{b.status}</span>
            )}
            {b.paymentStatus && (
              <span className={`bookings-badge ${paymentBadgeClass(b.paymentStatus)}`}>{b.paymentStatus}</span>
            )}
            {b.bookingType && <span className="bookings-type-tag">{b.bookingType}</span>}
          </div>
        </div>

        <div className="bookings-card__foot">
          <div className="bookings-card__booked">
            <div className="bookings-date">{formatDate(b.registeredAt)}</div>
            {formatRelativeDate(b.registeredAt) && (
              <div className="bookings-date__relative">{formatRelativeDate(b.registeredAt)}</div>
            )}
            {b.bookingId != null && <div className="bookings-date__id">#{b.bookingId}</div>}
          </div>
          <div className="bookings-card__foot-actions">
            <span
              className="bookings-channel-pill"
              style={{
                background: `${meta.color}12`,
                border: `1px solid ${meta.color}33`,
                color: meta.color,
              }}
            >
              <ChannelLogo channel={b.channel} size={12} />
              {meta.label}
            </span>
            <button
              type="button"
              className={`bookings-notes-btn${b.notes ? ' bookings-notes-btn--has-note' : ''}`}
              onClick={() => onNotes(b)}
              aria-label={b.notes ? `View notes for ${b.name}` : `No notes for ${b.name}`}
            >
              <NotesIcon />
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}

function BookingTableRow({
  booking: b,
  onNotes,
}: {
  booking: BookingListItem
  onNotes: (b: BookingListItem) => void
}) {
  const meta = CH_META[b.channel]
  return (
    <tr style={{ ['--row-accent' as string]: meta.color }}>
      <td>
        <div className="bookings-guest">
          <div
            className="bookings-avatar"
            style={{
              background: `${meta.color}18`,
              border: `1px solid ${meta.color}33`,
              color: meta.color,
            }}
          >
            {guestInitials(b.name)}
          </div>
          <div>
            <div className="bookings-guest__name">{b.name}</div>
            <div className="bookings-guest__contact">{guestContact(b)}</div>
            <div className="bookings-guest__meta">
              <span
                className="bookings-channel-pill"
                style={{
                  background: `${meta.color}12`,
                  border: `1px solid ${meta.color}33`,
                  color: meta.color,
                }}
              >
                <ChannelLogo channel={b.channel} size={12} />
                {meta.label}
              </span>
              <span className="bookings-source-tag">
                {b.source === 'webhook' ? 'webhook' : 'api'}
              </span>
            </div>
          </div>
        </div>
      </td>
      <td>
        <div className="bookings-event__title">{b.eventTitle}</div>
        <div className="bookings-event__date">
          <span aria-hidden="true">📅</span>
          {formatEventDate(b.eventStart, b.eventEnd)}
        </div>
      </td>
      <td>
        <div className="bookings-tickets">
          {b.tickets?.length ? (
            b.tickets.map((t, i) => (
              <span key={i} className="bookings-ticket-chip">
                {t.color && <span className="bookings-ticket-dot" style={{ background: t.color }} />}
                {t.name} ×{t.quantity}
              </span>
            ))
          ) : (
            <span className="bookings-ticket-chip">
              {b.ticketCount ?? 1} ticket{(b.ticketCount ?? 1) === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </td>
      <td className="bookings-td--num">
        <span className={`bookings-amount${b.totalPrice === 0 ? ' bookings-amount--free' : ''}`}>
          {formatAmount(b)}
        </span>
      </td>
      <td>
        <div className="bookings-status-group">
          {b.status && (
            <span className={`bookings-badge ${statusBadgeClass(b.status)}`}>{b.status}</span>
          )}
          {b.paymentStatus && (
            <span className={`bookings-badge ${paymentBadgeClass(b.paymentStatus)}`}>{b.paymentStatus}</span>
          )}
          {b.bookingType && <span className="bookings-type-tag">{b.bookingType}</span>}
        </div>
      </td>
      <td>
        <div className="bookings-date">{formatDate(b.registeredAt)}</div>
        {formatRelativeDate(b.registeredAt) && (
          <div className="bookings-date__relative">{formatRelativeDate(b.registeredAt)}</div>
        )}
        {b.bookingId != null && <div className="bookings-date__id">#{b.bookingId}</div>}
      </td>
      <td className="bookings-td--center">
        <button
          type="button"
          className={`bookings-notes-btn${b.notes ? ' bookings-notes-btn--has-note' : ''}`}
          onClick={() => onNotes(b)}
          aria-label={b.notes ? `View notes for ${b.name}` : `No notes for ${b.name}`}
          title={b.notes ? 'View notes' : 'No notes'}
        >
          <NotesIcon />
        </button>
      </td>
    </tr>
  )
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<BookingListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('booked')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [notesBooking, setNotesBooking] = useState<BookingListItem | null>(null)
  const htLoggedIn = !!getUser()

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    try {
      setBookings(await loadAllBookings())
    } catch {
      if (!opts?.silent) setBookings([])
    } finally {
      if (!opts?.silent) setLoading(false)
    }
  }, [])

  const syncAll = useCallback(async () => {
    setSyncing(true)
    try {
      const settings = await getSettings()
      await syncAllConnectedChannels(settings as ChannelSettingsView)
      await load()
    } catch {
      setBookings([])
    } finally {
      setSyncing(false)
    }
  }, [load])

  useEffect(() => { void load() }, [load])

  // Poll for new webhook/API bookings while this tab is open (no full channel sync).
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') void load({ silent: true })
    }
    const interval = window.setInterval(refresh, 30_000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [load])

  useEffect(() => {
    if (!notesBooking) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNotesBooking(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [notesBooking])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'booked' ? 'desc' : 'asc')
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = bookings.filter(b => {
      if (filter !== 'all' && b.channel !== filter) return false
      if (!q) return true
      return (
        b.name.toLowerCase().includes(q)
        || b.email.toLowerCase().includes(q)
        || (b.phone || '').toLowerCase().includes(q)
        || b.eventTitle.toLowerCase().includes(q)
        || (b.notes || '').toLowerCase().includes(q)
        || String(b.bookingId || '').includes(q)
      )
    })
    return sortBookings(list, sortKey, sortDir)
  }, [bookings, filter, query, sortKey, sortDir])

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: bookings.length, hightribe: 0, luma: 0, eventbrite: 0 }
    for (const b of bookings) c[b.channel]++
    return c
  }, [bookings])

  const summary = useMemo(() => {
    let approved = 0
    let tickets = 0
    let revenue = 0
    let currency = ''
    for (const b of filtered) {
      if (b.status === 'approved') approved++
      tickets += b.ticketCount ?? 1
      if (b.paymentStatus === 'paid' && b.totalPrice != null && b.totalPrice > 0) {
        revenue += b.totalPrice
        currency = b.currency || currency
      }
    }
    return { approved, tickets, revenue, currency }
  }, [filtered])

  return (
    <div className="bookings-page">
      {notesBooking && (
        <BookingNotesModal booking={notesBooking} onClose={() => setNotesBooking(null)} />
      )}

      <div className="bookings-header">
        <div className="bookings-header__main">
          <div className="bookings-header__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.8" />
              <path d="M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
          <div className="bookings-header__text">
            <div className="bookings-header__eyebrow">Registrations</div>
            <h1>Bookings</h1>
            <p>Incoming registrations from webhooks and connected channels</p>
          </div>
        </div>
        <div className="bookings-header__actions">
          {!loading && bookings.length > 0 && (
            <div className="bookings-header__stats">
              <span className="bookings-header-stat">
                <strong>{filtered.length}</strong> shown
              </span>
              <span className="bookings-header-stat">
                <strong>{summary.approved}</strong> approved
              </span>
              <span className="bookings-header-stat">
                <strong>{summary.tickets}</strong> tickets
              </span>
              {summary.revenue > 0 && (
                <span className="bookings-header-stat bookings-header-stat--accent">
                  <strong>{summary.revenue.toLocaleString()} {summary.currency}</strong>
                </span>
              )}
            </div>
          )}
          <button type="button" className="bookings-refresh-btn" onClick={load} disabled={loading || syncing}>
            {loading ? (
              <InlineLoader label="Refreshing" />
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M21 12a9 9 0 1 1-2.64-6.36"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path d="M21 3v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Refresh
              </>
            )}
          </button>
          <button type="button" className="bookings-refresh-btn bookings-refresh-btn--sync" onClick={syncAll} disabled={loading || syncing}>
            {syncing ? <InlineLoader label="Syncing" /> : '⇅ Sync'}
          </button>
        </div>
      </div>

      <div className="bookings-controls">
        <div className="bookings-filters">
          {(['all', 'hightribe', 'luma', 'eventbrite'] as Filter[]).map(f => {
            const meta = f === 'all' ? null : CH_META[f]
            const active = filter === f
            return (
              <button
                key={f}
                type="button"
                className={`bookings-filter-btn${active ? ' active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {meta && <span className="bookings-filter-dot" style={{ background: meta.color }} />}
                {f === 'all' ? 'All' : meta!.label}
                <span style={{ opacity: 0.6 }}>({counts[f]})</span>
              </button>
            )
          })}
        </div>

        <div className="bookings-search-wrap">
          <span className="bookings-search-icon" aria-hidden="true">⌕</span>
          <input
            type="search"
            className="bookings-search"
            placeholder="Search by name, email, phone, event, or booking ID…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
      </div>

      {!htLoggedIn && (
        <div className="bookings-alert">
          Sign in to Hightribe to load live bookings from your events API. Webhook registrations still appear below.
        </div>
      )}

      {loading ? (
        <PageLoader label="Loading bookings…" />
      ) : filtered.length === 0 ? (
        <div className="bookings-empty">
          <div className="bookings-empty__icon">📋</div>
          <div className="bookings-empty__title">No bookings yet</div>
          <p className="bookings-empty__text">
            When someone registers on Hightribe, Luma, or Eventbrite, they will appear here via webhooks.
          </p>
        </div>
      ) : (
        <div className="bookings-content">
          <div className="bookings-list-toolbar bookings-mobile-only">
            <span className="bookings-table-toolbar__count">
              <strong>{filtered.length}</strong>
              <span>of {bookings.length}</span>
            </span>
            <select
              className="bookings-mobile-sort"
              value={`${sortKey}:${sortDir}`}
              onChange={e => {
                const [key, dir] = e.target.value.split(':') as [SortKey, SortDir]
                setSortKey(key)
                setSortDir(dir)
              }}
              aria-label="Sort bookings"
            >
              <option value="booked:desc">Newest first</option>
              <option value="booked:asc">Oldest first</option>
              <option value="guest:asc">Guest A–Z</option>
              <option value="guest:desc">Guest Z–A</option>
              <option value="event:asc">Event A–Z</option>
              <option value="amount:desc">Highest amount</option>
              <option value="amount:asc">Lowest amount</option>
              <option value="status:asc">Status</option>
            </select>
          </div>

          <div className="bookings-cards bookings-mobile-only">
            {filtered.map(b => (
              <BookingCard key={b.id} booking={b} onNotes={setNotesBooking} />
            ))}
          </div>

          <div className="bookings-table-wrap bookings-desktop-only">
            <div className="bookings-table-toolbar">
              <span className="bookings-table-toolbar__count">
                Showing <strong>{filtered.length}</strong> of <strong>{bookings.length}</strong>
              </span>
              <span className="bookings-table-toolbar__hint">Click column headers to sort</span>
            </div>
            <div className="bookings-table-scroll">
              <table className="bookings-table">
                <thead>
                  <tr>
                    <SortHeader label="Guest" sortKey="guest" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                    <SortHeader label="Event" sortKey="event" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                    <th>Tickets</th>
                    <SortHeader label="Amount" sortKey="amount" activeKey={sortKey} dir={sortDir} onSort={handleSort} align="num" />
                    <SortHeader label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                    <SortHeader label="Booked" sortKey="booked" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                    <th className="bookings-th--center bookings-th--notes">
                      <span className="bookings-th-inner bookings-th-inner--static">
                        <NotesHeaderIcon />
                        <span className="bookings-th-label">Notes</span>
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(b => (
                    <BookingTableRow key={b.id} booking={b} onNotes={setNotesBooking} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
