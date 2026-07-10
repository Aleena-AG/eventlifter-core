'use client'

import { ChannelLogo } from '@/components/ChannelLogo'
import type { BookingListItem } from '@/lib/bookings'
import { CHANNEL_META } from '@/lib/channels'
import type { ChannelKey } from '@/lib/types'
import '@/app/bookings/bookings.css'

const CH_META: Record<ChannelKey, { label: string; color: string }> = {
  hightribe: { label: CHANNEL_META.hightribe.name, color: CHANNEL_META.hightribe.color },
  luma: { label: CHANNEL_META.luma.name, color: CHANNEL_META.luma.color },
  eventbrite: { label: CHANNEL_META.eventbrite.name, color: CHANNEL_META.eventbrite.color },
}

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
      return `${startStr} – ${e.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit' })}`
    }
    return `${startStr} – ${e.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
  } catch {
    return start
  }
}

function formatAmount(b: BookingListItem) {
  if (b.totalPrice == null) return '—'
  if (b.totalPrice === 0) return 'Free'
  return `${b.totalPrice.toLocaleString()} ${b.currency || ''}`.trim()
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

function DetailRow({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value == null || value === '' || value === '—') return null
  return (
    <div className="bookings-detail-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

export function BookingDetailModal({
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
        className="bookings-detail-modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-detail-title"
      >
        <div className="bookings-notes-modal__head">
          <div>
            <h2 id="booking-detail-title" className="bookings-notes-modal__title">Booking Details</h2>
            <p className="bookings-notes-modal__sub">{booking.name} · {booking.eventTitle}</p>
          </div>
          <button type="button" className="bookings-notes-modal__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="bookings-detail-modal__body">
          <div className="bookings-notes-modal__meta">
            {booking.bookingId != null && (
              <span className="bookings-notes-modal__tag">#{booking.bookingId}</span>
            )}
            <span className="bookings-notes-modal__tag" style={{ color: meta.color }}>
              <ChannelLogo channel={booking.channel} size={12} />
              {meta.label}
            </span>
            {booking.status && (
              <span className={`bookings-badge ${statusBadgeClass(booking.status)}`}>{booking.status}</span>
            )}
            {booking.paymentStatus && (
              <span className={`bookings-badge ${paymentBadgeClass(booking.paymentStatus)}`}>{booking.paymentStatus}</span>
            )}
            <span className="bookings-notes-modal__tag">{booking.source === 'webhook' ? 'Webhook' : 'API sync'}</span>
          </div>

          <section className="bookings-detail-section">
            <h3 className="bookings-detail-section__title">Guest</h3>
            <dl className="bookings-detail-grid">
              <DetailRow label="Name" value={booking.name} />
              <DetailRow label="Email" value={booking.email !== '—' ? (
                <a href={`mailto:${booking.email}`} className="bookings-detail-link">{booking.email}</a>
              ) : undefined} />
              <DetailRow label="Phone" value={booking.phone} />
            </dl>
          </section>

          <section className="bookings-detail-section">
            <h3 className="bookings-detail-section__title">Event</h3>
            <dl className="bookings-detail-grid">
              <DetailRow label="Title" value={booking.eventTitle} />
              <DetailRow label="Date" value={formatEventDate(booking.eventStart, booking.eventEnd)} />
              <DetailRow label="Event ID" value={booking.eventExternalId} />
            </dl>
          </section>

          <section className="bookings-detail-section">
            <h3 className="bookings-detail-section__title">Booking</h3>
            <dl className="bookings-detail-grid">
              <DetailRow label="Booked on" value={formatDate(booking.registeredAt)} />
              <DetailRow label="Booking ID" value={booking.bookingId != null ? `#${booking.bookingId}` : booking.id} />
              <DetailRow label="Type" value={booking.bookingType} />
              <DetailRow label="Amount" value={formatAmount(booking)} />
            </dl>
          </section>

          {(booking.tickets?.length || booking.ticketCount != null) && (
            <section className="bookings-detail-section">
              <h3 className="bookings-detail-section__title">Tickets</h3>
              <div className="bookings-detail-tickets">
                {booking.tickets?.length ? (
                  booking.tickets.map((t, i) => (
                    <div key={i} className="bookings-detail-ticket">
                      <span className="bookings-detail-ticket__name">
                        {t.color && <span className="bookings-ticket-dot" style={{ background: t.color }} />}
                        {t.name}
                      </span>
                      <span className="bookings-detail-ticket__qty">×{t.quantity}</span>
                      {t.unitPrice && <span className="bookings-detail-ticket__price">{t.unitPrice}</span>}
                    </div>
                  ))
                ) : (
                  <div className="bookings-detail-ticket">
                    <span className="bookings-detail-ticket__name">
                      {booking.ticketCount ?? 1} ticket{(booking.ticketCount ?? 1) === 1 ? '' : 's'}
                    </span>
                  </div>
                )}
              </div>
            </section>
          )}

          {booking.notes && (
            <section className="bookings-detail-section">
              <h3 className="bookings-detail-section__title">Notes</h3>
              <div className="bookings-notes-modal__content">{booking.notes}</div>
            </section>
          )}
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

export function bookingForAttendee(
  attendee: { email: string; name: string; source: ChannelKey; registeredAt: string },
  bookings: BookingListItem[],
  eventTitle: string,
): BookingListItem {
  const email = attendee.email.toLowerCase().trim()
  const match = bookings.find(
    (b) => b.email.toLowerCase().trim() === email && b.channel === attendee.source,
  )
  if (match) return match
  return {
    id: `${attendee.source}-${email}`,
    name: attendee.name,
    email: attendee.email,
    channel: attendee.source,
    eventTitle,
    registeredAt: attendee.registeredAt,
    source: 'api',
  }
}
