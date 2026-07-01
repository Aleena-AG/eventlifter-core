'use client'

import { useState } from 'react'
import { authHeader } from '@/lib/auth'
import { buildEbTicketClass } from '@/lib/eventbrite-ticket'
import { HIGHTRIBE_COLOR, LUMA_COLOR, EVENTBRITE_COLOR } from '@/lib/brand'

type TargetChannel = 'hightribe' | 'luma' | 'eventbrite'

interface Props {
  open: boolean
  onClose: () => void
  onCreated?: (channel: TargetChannel) => void
}

interface FormData {
  // Common
  title: string
  description: string
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  timezone: string
  isOnline: boolean
  onlineUrl: string
  venueName: string
  address: string
  city: string
  country: string
  capacity: string
  // Luma-specific
  requireRsvpApproval: boolean
  coverUrl: string
  // Eventbrite-specific
  currency: string
  ticketType: 'free' | 'paid'
  ticketName: string
  ticketPrice: string
  ticketQuantity: string
}

const EMPTY: FormData = {
  title: '', description: '',
  startDate: '', startTime: '10:00',
  endDate: '', endTime: '12:00',
  timezone: 'Asia/Karachi',
  isOnline: false, onlineUrl: '',
  venueName: '', address: '', city: '', country: '',
  capacity: '',
  requireRsvpApproval: false,
  coverUrl: '',
  currency: 'USD',
  ticketType: 'free',
  ticketName: 'General Admission',
  ticketPrice: '',
  ticketQuantity: '',
}

const TIMEZONES = [
  'Asia/Karachi', 'Asia/Kolkata', 'UTC', 'America/New_York',
  'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Asia/Dubai',
  'Asia/Tokyo', 'Australia/Sydney',
]

const CURRENCIES = [
  { code: 'USD', label: 'USD – US Dollar' },
  { code: 'PKR', label: 'PKR – Pakistani Rupee' },
  { code: 'GBP', label: 'GBP – British Pound' },
  { code: 'EUR', label: 'EUR – Euro' },
  { code: 'AED', label: 'AED – UAE Dirham' },
  { code: 'SAR', label: 'SAR – Saudi Riyal' },
  { code: 'AUD', label: 'AUD – Australian Dollar' },
  { code: 'CAD', label: 'CAD – Canadian Dollar' },
  { code: 'INR', label: 'INR – Indian Rupee' },
]

const INPUT: React.CSSProperties = {
  width: '100%', background: '#FBF7F0', border: '1px solid #E8DFD0',
  borderRadius: '6px', padding: '8px 10px', fontSize: '13px',
  color: '#211B16', outline: 'none', boxSizing: 'border-box',
}
const LABEL: React.CSSProperties = {
  display: 'block', fontSize: '12px', color: '#8C7F6D',
  marginBottom: '5px', fontWeight: 500,
}
const SECTION_TITLE: React.CSSProperties = {
  fontSize: '11px', fontWeight: 700, color: '#8C7F6D',
  letterSpacing: '0.06em', textTransform: 'uppercase',
  marginBottom: '10px', paddingBottom: '6px', borderBottom: '1px solid #E8DFD0',
}

function toISO(date: string, time: string): string {
  if (!date) return new Date().toISOString()
  return new Date(`${date}T${time || '00:00'}:00`).toISOString()
}

const CHANNELS: { key: TargetChannel; label: string; icon: string; color: string }[] = [
  { key: 'hightribe', label: 'Hightribe', icon: '🏔', color: HIGHTRIBE_COLOR },
  { key: 'luma', label: 'Luma', icon: '✨', color: LUMA_COLOR },
  { key: 'eventbrite', label: 'Eventbrite', icon: '🎫', color: EVENTBRITE_COLOR },
]

export function CreateEventModal({ open, onClose, onCreated }: Props) {
  const [form, setForm] = useState<FormData>(EMPTY)
  const [target, setTarget] = useState<TargetChannel>('hightribe')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [statusMsg, setStatusMsg] = useState('')

  if (!open) return null

  const set = (k: keyof FormData, v: string | boolean) =>
    setForm(f => ({ ...f, [k]: v }))

  const handleClose = () => {
    setForm(EMPTY)
    setError('')
    setStatusMsg('')
    setSubmitting(false)
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) { setError('Title is required'); return }
    if (!form.startDate) { setError('Start date is required'); return }
    if (!form.endDate) { setError('End date is required'); return }
    if (target === 'eventbrite' && form.ticketType === 'paid' && !form.ticketPrice) {
      setError('Ticket price is required for paid events'); return
    }

    setSubmitting(true)
    setError('')
    setStatusMsg('')

    const startUtc = toISO(form.startDate, form.startTime)
    const endUtc = toISO(form.endDate, form.endTime)

    try {
      // ── Hightribe ──────────────────────────────────────────────────────────
      if (target === 'hightribe') {
        const body = {
          title: form.title,
          description: form.description || undefined,
          timezone: form.timezone,
          location: {
            type: form.isOnline ? 'online' : 'venue',
            venue_name: form.venueName || undefined,
            address: form.address || undefined,
            city: form.city || undefined,
            country: form.country || undefined,
            online_url: form.isOnline ? form.onlineUrl : undefined,
          },
          dates: {
            start_date: form.startDate,
            start_time: form.startTime + ':00',
            end_date: form.endDate,
            end_time: form.endTime + ':00',
            timezone: form.timezone,
          },
          capacity: form.capacity ? parseInt(form.capacity) : undefined,
        }
        const res = await fetch('/api/hightribe/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
          body: JSON.stringify(body),
        })
        const data = await res.json() as { message?: string; error?: string; errors?: Record<string, string[]> }
        if (!res.ok) {
          const msg = data.message || data.error ||
            (data.errors ? Object.values(data.errors).flat().join(', ') : `HTTP ${res.status}`)
          throw new Error(msg)
        }
      }

      // ── Luma ───────────────────────────────────────────────────────────────
      else if (target === 'luma') {
        const body: Record<string, unknown> = {
          name: form.title,
          start_at: startUtc,
          end_at: endUtc,
          timezone: form.timezone,
          description: form.description || undefined,
          cover_url: form.coverUrl || undefined,
          require_rsvp_approval: form.requireRsvpApproval,
          geo_address_json: (!form.isOnline && (form.city || form.address)) ? {
            full_address: [form.venueName, form.address, form.city, form.country].filter(Boolean).join(', '),
            city: form.city || undefined,
            country: form.country || undefined,
          } : undefined,
          meeting_url: form.isOnline ? (form.onlineUrl || undefined) : undefined,
          capacity: form.capacity ? parseInt(form.capacity) : undefined,
        }
        const res = await fetch('/api/luma/events/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json() as { error?: string; message?: string }
        if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`)
      }

      // ── Eventbrite ─────────────────────────────────────────────────────────
      else if (target === 'eventbrite') {
        // 1. Get org ID
        setStatusMsg('Getting organization…')
        const orgRes = await fetch('/api/eventbrite/users/me/organizations')
        const orgData = await orgRes.json() as { organizations?: Array<{ id: string }> }
        const orgId = orgData.organizations?.[0]?.id
        if (!orgId) throw new Error('No Eventbrite organization found. Create one on eventbrite.com first.')

        // 2. Create event
        setStatusMsg('Creating event…')
        const eventBody = {
          event: {
            name: { html: form.title },
            description: { html: form.description || '' },
            start: { utc: startUtc, timezone: form.timezone },
            end: { utc: endUtc, timezone: form.timezone },
            currency: form.currency,
            online_event: form.isOnline,
            listed: false,
            shareable: true,
            capacity: form.capacity ? parseInt(form.capacity) : undefined,
          },
        }
        const evtRes = await fetch(`/api/eventbrite/organizations/${orgId}/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(eventBody),
        })
        const evtData = await evtRes.json() as { id?: string; error?: string; error_description?: string }
        if (!evtRes.ok) throw new Error(evtData.error_description || evtData.error || `HTTP ${evtRes.status}`)
        const eventId = evtData.id!

        // 3. Create venue (if in-person and address given)
        if (!form.isOnline && (form.venueName || form.address || form.city)) {
          setStatusMsg('Creating venue…')
          const venueBody = {
            venue: {
              name: form.venueName || form.city || 'Venue',
              address: {
                address_1: form.address || undefined,
                city: form.city || undefined,
                country: form.country || undefined,
              },
            },
          }
          const venueRes = await fetch(`/api/eventbrite/organizations/${orgId}/venues`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(venueBody),
          })
          if (venueRes.ok) {
            const venueData = await venueRes.json() as { id?: string }
            if (venueData.id) {
              // Attach venue to event
              await fetch(`/api/eventbrite/events/${eventId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ event: { venue_id: venueData.id } }),
              })
            }
          }
        }

        // 4. Create ticket class (required to publish)
        setStatusMsg('Creating ticket class…')
        const ticketRes = await fetch(`/api/eventbrite/events/${eventId}/ticket_classes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticket_class: buildEbTicketClass({
              name: form.ticketName || 'General Admission',
              free: form.ticketType === 'free',
              capacity: form.ticketQuantity,
              currency: form.currency,
              price: form.ticketType === 'free' ? 0 : form.ticketPrice,
            }),
          }),
        })
        if (!ticketRes.ok) {
          const td = await ticketRes.json() as { error_description?: string }
          throw new Error(`Ticket class error: ${td.error_description || `HTTP ${ticketRes.status}`}`)
        }
      }

      setStatusMsg('')
      onCreated?.(target)
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatusMsg('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '24px',
      }}
      onClick={e => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div style={{
        background: '#FFFFFF', border: '1px solid #E8DFD0', borderRadius: '12px',
        width: '100%', maxWidth: '560px', maxHeight: '90vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid #E8DFD0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#211B16' }}>Create Event</div>
          <button onClick={handleClose} style={{
            background: 'none', border: 'none', color: '#8C7F6D',
            fontSize: '20px', cursor: 'pointer', lineHeight: 1, padding: '4px',
          }}>×</button>
        </div>

        {/* Channel selector */}
        <div style={{ padding: '14px 24px 0', display: 'flex', gap: '8px', flexShrink: 0 }}>
          {CHANNELS.map(ch => (
            <button key={ch.key} onClick={() => setTarget(ch.key)} style={{
              flex: 1, padding: '10px 8px', borderRadius: '8px',
              border: `1px solid ${target === ch.key ? ch.color + '66' : '#E8DFD0'}`,
              background: target === ch.key ? ch.color + '14' : '#F1EADC',
              color: target === ch.key ? ch.color : '#8C7F6D',
              fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
            }}>
              <span style={{ fontSize: '18px' }}>{ch.icon}</span>
              {ch.label}
            </button>
          ))}
        </div>

        {/* Scrollable form body */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <form id="create-event-form" onSubmit={handleSubmit}>
            <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {error && (
                <div style={{
                  background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.4)',
                  borderRadius: '6px', padding: '10px 14px', color: '#C2502E', fontSize: '13px',
                }}>
                  {error}
                </div>
              )}

              {/* ── Common fields ── */}
              <div style={SECTION_TITLE}>Event Details</div>

              <div>
                <label style={LABEL}>Title *</label>
                <input required type="text" style={INPUT}
                  value={form.title} onChange={e => set('title', e.target.value)}
                  placeholder="Event title" />
              </div>

              <div>
                <label style={LABEL}>Description</label>
                <textarea rows={3} style={{ ...INPUT, resize: 'vertical', fontFamily: 'inherit' }}
                  value={form.description} onChange={e => set('description', e.target.value)}
                  placeholder="Event description" />
              </div>

              {/* Date/Time */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={LABEL}>Start Date *</label>
                  <input required type="date" style={INPUT}
                    value={form.startDate} onChange={e => set('startDate', e.target.value)} />
                </div>
                <div>
                  <label style={LABEL}>Start Time</label>
                  <input type="time" style={INPUT}
                    value={form.startTime} onChange={e => set('startTime', e.target.value)} />
                </div>
                <div>
                  <label style={LABEL}>End Date *</label>
                  <input required type="date" style={INPUT}
                    value={form.endDate} onChange={e => set('endDate', e.target.value)} />
                </div>
                <div>
                  <label style={LABEL}>End Time</label>
                  <input type="time" style={INPUT}
                    value={form.endTime} onChange={e => set('endTime', e.target.value)} />
                </div>
              </div>

              <div>
                <label style={LABEL}>Timezone</label>
                <select style={INPUT} value={form.timezone} onChange={e => set('timezone', e.target.value)}>
                  {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>

              {/* ── Location ── */}
              <div style={SECTION_TITLE}>Location</div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input type="checkbox" id="isOnline" checked={form.isOnline}
                  onChange={e => set('isOnline', e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                <label htmlFor="isOnline" style={{ fontSize: '13px', color: '#211B16', cursor: 'pointer' }}>
                  Online event
                </label>
              </div>

              {form.isOnline ? (
                <div>
                  <label style={LABEL}>Meeting URL</label>
                  <input type="url" style={INPUT}
                    value={form.onlineUrl} onChange={e => set('onlineUrl', e.target.value)}
                    placeholder="https://meet.google.com/..." />
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <label style={LABEL}>Venue Name</label>
                    <input type="text" style={INPUT}
                      value={form.venueName} onChange={e => set('venueName', e.target.value)}
                      placeholder="Venue name" />
                  </div>
                  <div>
                    <label style={LABEL}>Street Address</label>
                    <input type="text" style={INPUT}
                      value={form.address} onChange={e => set('address', e.target.value)}
                      placeholder="Street address" />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={LABEL}>City</label>
                      <input type="text" style={INPUT}
                        value={form.city} onChange={e => set('city', e.target.value)}
                        placeholder="Karachi" />
                    </div>
                    <div>
                      <label style={LABEL}>Country Code</label>
                      <input type="text" style={INPUT} maxLength={2}
                        value={form.country} onChange={e => set('country', e.target.value.toUpperCase())}
                        placeholder="PK" />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label style={LABEL}>Capacity (optional)</label>
                <input type="number" min="1" style={INPUT}
                  value={form.capacity} onChange={e => set('capacity', e.target.value)}
                  placeholder="Unlimited" />
              </div>

              {/* ── Luma-specific ── */}
              {target === 'luma' && (
                <>
                  <div style={SECTION_TITLE}>Luma Options</div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input type="checkbox" id="rsvp" checked={form.requireRsvpApproval}
                      onChange={e => set('requireRsvpApproval', e.target.checked)}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                    <label htmlFor="rsvp" style={{ fontSize: '13px', color: '#211B16', cursor: 'pointer' }}>
                      Require RSVP approval
                    </label>
                  </div>

                  <div>
                    <label style={LABEL}>Cover Image URL (optional)</label>
                    <input type="url" style={INPUT}
                      value={form.coverUrl} onChange={e => set('coverUrl', e.target.value)}
                      placeholder="https://..." />
                  </div>
                </>
              )}

              {/* ── Eventbrite-specific ── */}
              {target === 'eventbrite' && (
                <>
                  <div style={SECTION_TITLE}>Eventbrite Options</div>

                  <div>
                    <label style={LABEL}>Currency *</label>
                    <select style={INPUT} value={form.currency} onChange={e => set('currency', e.target.value)}>
                      {CURRENCIES.map(c => (
                        <option key={c.code} value={c.code}>{c.label}</option>
                      ))}
                    </select>
                  </div>

                  <div style={SECTION_TITLE}>Tickets</div>

                  {/* Ticket type toggle */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {(['free', 'paid'] as const).map(t => (
                      <button key={t} type="button" onClick={() => set('ticketType', t)} style={{
                        flex: 1, padding: '8px', borderRadius: '6px',
                        border: `1px solid ${form.ticketType === t ? '#D98A2B66' : '#E8DFD0'}`,
                        background: form.ticketType === t ? 'rgba(56,139,253,0.1)' : '#F1EADC',
                        color: form.ticketType === t ? '#D98A2B' : '#8C7F6D',
                        fontSize: '13px', fontWeight: 500, cursor: 'pointer',
                      }}>
                        {t === 'free' ? '🆓 Free' : '💳 Paid'}
                      </button>
                    ))}
                  </div>

                  <div>
                    <label style={LABEL}>Ticket Name</label>
                    <input type="text" style={INPUT}
                      value={form.ticketName} onChange={e => set('ticketName', e.target.value)}
                      placeholder="General Admission" />
                  </div>

                  {form.ticketType === 'paid' && (
                    <div>
                      <label style={LABEL}>Price ({form.currency}) *</label>
                      <input type="number" min="0.01" step="0.01" style={INPUT}
                        value={form.ticketPrice} onChange={e => set('ticketPrice', e.target.value)}
                        placeholder="10.00" />
                    </div>
                  )}

                  <div>
                    <label style={LABEL}>Ticket Quantity (optional)</label>
                    <input type="number" min="1" style={INPUT}
                      value={form.ticketQuantity} onChange={e => set('ticketQuantity', e.target.value)}
                      placeholder="Unlimited" />
                  </div>

                  <div style={{
                    background: 'rgba(56,139,253,0.07)', border: '1px solid rgba(56,139,253,0.25)',
                    borderRadius: '6px', padding: '10px 12px', fontSize: '12px', color: '#8C7F6D',
                  }}>
                    Event will be created as <b style={{ color: '#211B16' }}>draft</b> on Eventbrite. Publish it from your Eventbrite dashboard after review.
                  </div>
                </>
              )}

            </div>
          </form>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px', borderTop: '1px solid #E8DFD0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
        }}>
          <span style={{ fontSize: '12px', color: '#8C7F6D', minHeight: '18px' }}>
            {statusMsg}
          </span>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={handleClose} style={{
              background: 'none', border: '1px solid #E8DFD0', borderRadius: '6px',
              color: '#8C7F6D', padding: '8px 16px', fontSize: '13px', cursor: 'pointer',
            }}>
              Cancel
            </button>
            <button
              type="submit"
              form="create-event-form"
              disabled={submitting}
              style={{
                background: submitting ? '#F1EADC' : '#238636',
                border: 'none', borderRadius: '6px',
                color: submitting ? '#8C7F6D' : '#fff',
                padding: '8px 22px', fontSize: '13px', fontWeight: 600,
                cursor: submitting ? 'default' : 'pointer',
              }}
            >
              {submitting ? 'Creating…' : `Create on ${CHANNELS.find(c => c.key === target)?.label}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
