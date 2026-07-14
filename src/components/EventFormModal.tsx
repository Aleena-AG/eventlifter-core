'use client'

import { useState, useEffect } from 'react'
import { channelFetch } from '@/lib/channel-fetch'
import { buildEbTicketClass } from '@/lib/eventbrite-ticket'
import { postHtEvent, resolveCoverFileForHt } from '@/lib/cover-image'
import { InlineLoader, PageLoader } from '@/components/Loader'
import { CHANNEL_META } from '@/lib/channels'
import { HIGHTRIBE_COLOR } from '@/lib/brand'

export type Channel = 'hightribe' | 'luma' | 'eventbrite'
export type FormMode = 'create' | 'edit'

// ─── Hightribe interfaces ─────────────────────────────────────────────────────
interface HtTicket {
  name: string; currency: string; price: string; quantity: string
  bookingType: 'instant' | 'request' | ''; showTicket: boolean
  startDate: string; endDate: string
}
interface HtItinerary { title: string; description: string }
interface HtForm {
  title: string; description: string; coverUrl: string
  startDate: string; startTime: string; endDate: string; endTime: string; timezone: string
  locationType: 'venue' | 'online' | 'hybrid'
  locationLabel: string; address: string; city: string; country: string
  lat: string; lng: string; onlineUrl: string
  status: 'draft' | 'published'; isBusinessProfile: boolean
  highlights: string[]
  itineraries: HtItinerary[]
  policies: string[]
  tickets: HtTicket[]
  ticketMinQty: string; ticketMaxQty: string
  salesEndTime: string; salesEndUnit: string
  allowRefunds: boolean
}
const EMPTY_TICKET: HtTicket = { name: '', currency: 'USD', price: '0', quantity: '', bookingType: 'instant', showTicket: true, startDate: '', endDate: '' }
const HT_EMPTY: HtForm = {
  title: '', description: '', coverUrl: '', startDate: '', startTime: '10:00', endDate: '', endTime: '12:00',
  timezone: 'Asia/Karachi', locationType: 'venue', locationLabel: '', address: '', city: '',
  country: '', lat: '', lng: '', onlineUrl: '', status: 'draft', isBusinessProfile: false,
  highlights: [], itineraries: [], policies: [], tickets: [],
  ticketMinQty: '1', ticketMaxQty: '10', salesEndTime: '', salesEndUnit: 'hours', allowRefunds: false,
}
const HT_SAMPLE: HtForm = {
  title: 'Tech Meetup Karachi 2025',
  description: 'Join us for tech talks, networking, and startup innovation showcases from top founders across Pakistan.',
  coverUrl: '',
  startDate: '2026-08-15', startTime: '18:00', endDate: '2026-08-15', endTime: '21:00',
  timezone: 'Asia/Karachi', locationType: 'venue',
  locationLabel: 'Karachi IT Park', address: 'Plot ST-30, Block 6, PECHS', city: 'Karachi', country: 'PK',
  lat: '24.8607', lng: '67.0011', onlineUrl: '', status: 'draft', isBusinessProfile: false,
  highlights: ['Startup showcases', 'Networking with 100+ founders', 'Panel discussion on AI'],
  itineraries: [
    { title: 'Welcome & Registration', description: 'Check-in and light refreshments' },
    { title: 'Keynote & Panels', description: 'Talks from tech leaders on innovation trends' },
    { title: 'Networking Session', description: 'Open networking, demos, and startup pitches' },
  ],
  policies: ['No refunds within 48 hours of the event', 'Attendees must carry a valid ID'],
  tickets: [
    { name: 'General Admission', currency: 'USD', price: '500', quantity: '80', bookingType: 'instant', showTicket: true, startDate: '', endDate: '' },
    { name: 'VIP Pass', currency: 'USD', price: '1500', quantity: '20', bookingType: 'instant', showTicket: true, startDate: '', endDate: '' },
  ],
  ticketMinQty: '1', ticketMaxQty: '5', salesEndTime: '2', salesEndUnit: 'hours', allowRefunds: false,
}

// ─── Luma form ────────────────────────────────────────────────────────────────
interface LumaForm {
  name: string; description: string; startAt: string; endAt: string; timezone: string
  isOnline: boolean; meetingUrl: string; fullAddress: string; city: string; country: string
  requireRsvpApproval: boolean; coverUrl: string; capacity: string
}
const LUMA_EMPTY: LumaForm = {
  name: '', description: '', startAt: '', endAt: '', timezone: 'Asia/Karachi',
  isOnline: false, meetingUrl: '', fullAddress: '', city: '', country: '',
  requireRsvpApproval: false, coverUrl: '', capacity: '',
}
const LUMA_SAMPLE: LumaForm = {
  name: 'Design Thinking Workshop',
  description: 'A hands-on workshop exploring design thinking principles and product methodologies.',
  startAt: '2026-08-20T10:00', endAt: '2026-08-20T16:00', timezone: 'Asia/Karachi',
  isOnline: false, meetingUrl: '', fullAddress: 'Arfa Software Technology Park, Ferozepur Road',
  city: 'Lahore', country: 'PK', requireRsvpApproval: true, coverUrl: '', capacity: '50',
}

// ─── Eventbrite form ──────────────────────────────────────────────────────────
interface EbForm {
  title: string; description: string; startDate: string; startTime: string; endDate: string; endTime: string; timezone: string
  currency: string; isOnline: boolean; venueName: string; address: string; city: string; country: string
  listed: boolean; ticketName: string; ticketType: 'free' | 'paid'; ticketPrice: string; ticketQuantity: string
}
const EB_EMPTY: EbForm = {
  title: '', description: '', startDate: '', startTime: '10:00', endDate: '', endTime: '12:00',
  timezone: 'Asia/Karachi', currency: 'USD', isOnline: false, venueName: '', address: '',
  city: '', country: '', listed: false, ticketName: 'General Admission',
  ticketType: 'free', ticketPrice: '', ticketQuantity: '',
}
const EB_SAMPLE: EbForm = {
  title: 'Startup Pitch Night Lahore',
  description: '<p>Watch the best startups pitch to investors and industry leaders. Live demos, Q&A, and networking.</p>',
  startDate: '2026-09-01', startTime: '19:00', endDate: '2026-09-01', endTime: '22:00',
  timezone: 'Asia/Karachi', currency: 'USD', isOnline: false,
  venueName: 'Lahore Chamber of Commerce', address: 'Aiwan-e-Tijarat Road, Lahore Cantt',
  city: 'Lahore', country: 'PK', listed: false, ticketName: 'General Admission',
  ticketType: 'free', ticketPrice: '', ticketQuantity: '200',
}

// ─── Shared constants ─────────────────────────────────────────────────────────
const CH_META: Record<Channel, { label: string; icon: string; color: string }> = {
  hightribe:  { label: CHANNEL_META.hightribe.name,  icon: '🏔', color: CHANNEL_META.hightribe.color },
  luma:       { label: CHANNEL_META.luma.name,       icon: '✨', color: CHANNEL_META.luma.color },
  eventbrite: { label: CHANNEL_META.eventbrite.name, icon: '🎫', color: CHANNEL_META.eventbrite.color },
}
const TIMEZONES = ['Asia/Karachi','Asia/Kolkata','UTC','America/New_York','America/Los_Angeles','Europe/London','Europe/Paris','Asia/Dubai','Asia/Tokyo','Australia/Sydney']
// ─── Style constants ──────────────────────────────────────────────────────────
const INPUT: React.CSSProperties = { width:'100%', background:'#FBF7F0', border:'1px solid #E8DFD0', borderRadius:'6px', padding:'8px 10px', fontSize:'13px', color:'#211B16', outline:'none', boxSizing:'border-box' }
const LABEL: React.CSSProperties = { display:'block', fontSize:'12px', color:'#8C7F6D', marginBottom:'5px', fontWeight:500 }
const SEC: React.CSSProperties = { fontSize:'11px', fontWeight:700, color:'#8C7F6D', letterSpacing:'0.06em', textTransform:'uppercase', marginBottom:'10px', paddingBottom:'6px', borderBottom:'1px solid #E8DFD0' }
const GRID2: React.CSSProperties = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }
const GRID3: React.CSSProperties = { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px' }

function toISO(date: string, time: string): string {
  if (!date) return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  return new Date(`${date}T${time || '00:00'}:00`).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  open: boolean; mode: FormMode; channel: Channel
  eventId?: string | number
  onClose: () => void
  onSaved?: (channel: Channel, mode: FormMode) => void
}

export function EventFormModal({ open, mode, channel: initChannel, eventId, onClose, onSaved }: Props) {
  const [channel, setChannel] = useState<Channel>(initChannel)
  const [ht, setHt] = useState<HtForm>(HT_EMPTY)
  const [lu, setLu] = useState<LumaForm>(LUMA_EMPTY)
  const [eb, setEb] = useState<EbForm>(EB_EMPTY)
  const [loadingEvent, setLoadingEvent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [error, setError] = useState('')
  const [syncTo, setSyncTo] = useState<Partial<Record<Channel, boolean>>>({})
  const [htCoverFile, setHtCoverFile] = useState<File | null>(null)

  useEffect(() => {
    if (!open) return
    setChannel(initChannel)
    setHt(HT_EMPTY); setLu(LUMA_EMPTY); setEb(EB_EMPTY)
    setHtCoverFile(null)
    setError(''); setStatusMsg(''); setSyncTo({})
    if (mode === 'edit' && eventId) loadForEdit(initChannel, eventId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  // ─── Load for edit ─────────────────────────────────────────────────────────
  async function loadForEdit(ch: Channel, id: string | number) {
    setLoadingEvent(true)
    try {
      if (ch === 'hightribe') {
        const res = await channelFetch(`/api/hightribe/events/${id}`)
        const data = await res.json() as { data?: Record<string, unknown> }
        const e = (data.data || data) as Record<string, unknown>
        const dates = (e.dates || {}) as Record<string, string>
        const loc = (e.location || {}) as Record<string, string>
        // Load tickets if any
        const ticketsRaw = (e.tickets || []) as Array<Record<string, unknown>>
        const ticketSetting = (e.ticket_setting || e.ticketSetting || {}) as Record<string, unknown>
        const coverFromRatio = Array.isArray(e.cover_image_aspect_ratio)
          ? (e.cover_image_aspect_ratio as Array<{ image?: string }>).find(r => r?.image)?.image
          : undefined
        setHt({
          title: String(e.title || ''), description: String(e.description || ''),
          coverUrl: String(e.cover_image || e.cover_url || coverFromRatio || ''),
          startDate: dates.start_date || '', startTime: (dates.start_time || '10:00').slice(0, 5),
          endDate: dates.end_date || '', endTime: (dates.end_time || '12:00').slice(0, 5),
          timezone: dates.timezone || String(e.timezone || 'Asia/Karachi'),
          locationType: (loc.type as HtForm['locationType']) || 'venue',
          locationLabel: loc.location || loc.venue_name || '',
          address: loc.address || '', city: loc.city || '', country: loc.country || '',
          lat: String(loc.lat || ''), lng: String(loc.lng || ''), onlineUrl: loc.online_url || '',
          status: (String(e.publish_status || e.status || 'draft')) as HtForm['status'],
          isBusinessProfile: !!(e.is_business_profile),
          highlights: Array.isArray(e.highlights) ? (e.highlights as string[]) : [],
          itineraries: Array.isArray(e.itineraries)
            ? (e.itineraries as Array<Record<string, string>>).map(i => ({ title: i.title || '', description: i.description || '' }))
            : [],
          policies: Array.isArray(e.policies)
            ? (e.policies as Array<string | Record<string, string>>).map(p => typeof p === 'string' ? p : (p.text || ''))
            : [],
          tickets: ticketsRaw.map(t => ({
            name: String(t.name || ''), currency: 'USD',
            price: String(t.price || '0'), quantity: String(t.quantity || ''),
            bookingType: (String(t.booking_type || 'instant')) as HtTicket['bookingType'],
            showTicket: t.show_ticket !== false, startDate: String(t.start_date || ''), endDate: String(t.end_date || ''),
          })),
          ticketMinQty: String(ticketSetting.min_qty || '1'), ticketMaxQty: String(ticketSetting.max_qty || '10'),
          salesEndTime: String(ticketSetting.sales_end_time || ''), salesEndUnit: String(ticketSetting.sales_end_unit || 'hours'),
          allowRefunds: !!(e.allow_refunds),
        })
      } else if (ch === 'luma') {
        const res = await channelFetch(`/api/luma/events?api_id=${id}`)
        const raw = await res.json() as { data?: Record<string, unknown> } & Record<string, unknown>
        const e = (raw.data || raw) as Record<string, unknown>
        const geo = (e.geo_address_json || {}) as Record<string, string>
        setLu({
          name: String(e.name || ''), description: String(e.description || ''),
          startAt: e.start_at ? String(e.start_at).slice(0,16) : '',
          endAt: e.end_at ? String(e.end_at).slice(0,16) : '',
          timezone: String(e.timezone || 'Asia/Karachi'), isOnline: !!(e.meeting_url),
          meetingUrl: String(e.meeting_url || ''), fullAddress: String(geo.full_address || ''),
          city: String(geo.city || ''), country: String(geo.country || ''),
          requireRsvpApproval: !!(e.require_rsvp_approval), coverUrl: String(e.cover_url || ''),
          capacity: e.capacity ? String(e.capacity) : '',
        })
      } else {
        const res = await channelFetch(`/api/eventbrite/events/${id}`)
        const e = await res.json() as Record<string, unknown>
        const start = (e.start || {}) as Record<string, string>
        const end   = (e.end   || {}) as Record<string, string>
        const name  = ((e.name || {}) as Record<string, string>).html || ((e.name || {}) as Record<string, string>).text || ''
        const desc  = ((e.description || {}) as Record<string, string>).html || ''
        const sd = start.local || start.utc || ''
        const ed = end.local   || end.utc   || ''
        setEb({ title: name, description: desc, startDate: sd.slice(0,10), startTime: sd.slice(11,16) || '10:00', endDate: ed.slice(0,10), endTime: ed.slice(11,16) || '12:00', timezone: start.timezone || 'Asia/Karachi', currency: 'USD', isOnline: !!(e.online_event), venueName: '', address: '', city: '', country: '', listed: !!(e.listed), ticketName: 'General Admission', ticketType: 'free', ticketPrice: '', ticketQuantity: '' })
      }
    } catch { setError('Failed to load event data') }
    finally { setLoadingEvent(false) }
  }

  // ─── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true); setError(''); setStatusMsg('')
    try {
      await submitChannel(channel, mode)
      const syncs = (Object.keys(syncTo) as Channel[]).filter(c => syncTo[c])
      for (const sc of syncs) {
        setStatusMsg(`Syncing to ${CH_META[sc].label}…`)
        await submitChannel(sc, 'create').catch((err: Error) => console.warn(`Sync to ${sc} failed:`, err.message))
      }
      onSaved?.(channel, mode)
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally { setSubmitting(false); setStatusMsg('') }
  }

  async function submitChannel(ch: Channel, m: FormMode) {
    if (ch === 'hightribe') await submitHt(m)
    else if (ch === 'luma') await submitLuma(m)
    else await submitEb(m)
  }

  async function submitHt(m: FormMode) {
    const hasLocation = !!(ht.locationLabel || ht.address || ht.city)
    const hasTickets = ht.tickets.length > 0

    const body: Record<string, unknown> = {
      title: ht.title,
      description: ht.description,
      status: ht.status,
      is_business_profile: ht.isBusinessProfile ? 1 : 0,
      dates: { start_date: ht.startDate, start_time: ht.startTime, end_date: ht.endDate, end_time: ht.endTime, timezone: ht.timezone },
    }

    if (hasLocation || ht.locationType === 'online') {
      body.location = {
        type: ht.locationType,
        location: ht.locationLabel || ht.address || ht.city || (ht.locationType === 'online' ? 'Online' : ''),
        address: ht.address || undefined,
        city: ht.city || undefined,
        country: ht.country || undefined,
        lat: ht.lat ? parseFloat(ht.lat) : undefined,
        lng: ht.lng ? parseFloat(ht.lng) : undefined,
        online_url: ht.onlineUrl || undefined,
      }
    }

    if (ht.highlights.filter(Boolean).length > 0) body.highlights = ht.highlights.filter(Boolean)
    if (ht.itineraries.filter(i => i.title).length > 0) body.itineraries = ht.itineraries.filter(i => i.title)
    if (ht.policies.filter(Boolean).length > 0) body.policies = ht.policies.filter(Boolean)

    if (hasTickets) {
      body.tickets = ht.tickets.map(t => ({
        name: t.name, currency: 'USD',
        price: parseFloat(t.price) || 0, quantity: parseInt(t.quantity) || 0,
        booking_type: t.bookingType || undefined,
        // Hightribe MySQL columns are tinyint — send 0/1, not true/false
        show_ticket: t.showTicket ? 1 : 0,
        show_ticket_quantity: 1,
        start_date: t.startDate || undefined, end_date: t.endDate || undefined,
      }))
      body.ticketSetting = {
        minQty: parseInt(ht.ticketMinQty) || 1,
        maxQty: parseInt(ht.ticketMaxQty) || 10,
        salesEndTime: ht.salesEndTime ? parseInt(ht.salesEndTime) : undefined,
        salesEndUnit: ht.salesEndTime ? ht.salesEndUnit : undefined,
      }
      body.allow_refunds = ht.allowRefunds ? 1 : 0
    }

    // Use with-tickets endpoint when creating with tickets, else standard
    const useTicketsEndpoint = m === 'create' && hasTickets
    const url = m === 'edit'
      ? `/api/hightribe/events/${eventId}`
      : useTicketsEndpoint ? '/api/hightribe/events/with-tickets' : '/api/hightribe/events'
    const method = m === 'edit' ? 'PUT' : 'POST'

    const res = await postHtEvent(
      url,
      body,
      method,
      await resolveCoverFileForHt(ht.coverUrl, htCoverFile),
    )
    const data = await res.json() as { message?: string; error?: string; errors?: Record<string, string[]> }
    if (!res.ok) {
      const msg = data.message || data.error || (data.errors ? Object.values(data.errors).flat().join(', ') : `HTTP ${res.status}`)
      throw new Error(msg)
    }
  }

  async function submitLuma(m: FormMode) {
    const body: Record<string, unknown> = {
      name: lu.name, description: lu.description || undefined,
      start_at: lu.startAt ? new Date(lu.startAt).toISOString() : undefined,
      end_at: lu.endAt ? new Date(lu.endAt).toISOString() : undefined,
      timezone: lu.timezone, cover_url: lu.coverUrl || undefined,
      require_rsvp_approval: lu.requireRsvpApproval,
      geo_address_json: (!lu.isOnline && (lu.city || lu.fullAddress)) ? { type: 'manual', address: lu.fullAddress || lu.city || '', city: lu.city || undefined, country: lu.country || undefined } : undefined,
      meeting_url: lu.isOnline ? (lu.meetingUrl || undefined) : undefined,
      capacity: lu.capacity ? parseInt(lu.capacity) : undefined,
    }
    if (m === 'edit') body.api_id = eventId
    const method = m === 'edit' ? 'PUT' : 'POST'
    const res = await channelFetch('/api/luma/events', { method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
    const data = await res.json() as { status?: string; message?: string; error?: string }
    if (!res.ok || data.status === 'error') throw new Error(data.message || data.error || `HTTP ${res.status}`)
  }

  async function submitEb(m: FormMode) {
    const startUtc = toISO(eb.startDate, eb.startTime)
    const endUtc   = toISO(eb.endDate,   eb.endTime)
    if (m === 'edit') {
      const body = { event: { name:{ html: eb.title }, description:{ html: eb.description || '' }, start:{ utc: startUtc, timezone: eb.timezone }, end:{ utc: endUtc, timezone: eb.timezone }, currency: 'USD', online_event: eb.isOnline, listed: eb.listed } }
      const res = await channelFetch(`/api/eventbrite/events/${eventId}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
      const data = await res.json() as { error_description?: string }
      if (!res.ok) throw new Error(data.error_description || `HTTP ${res.status}`)
      return
    }
    setStatusMsg('Getting organization…')
    const orgRes = await channelFetch('/api/eventbrite/users/me/organizations')
    const orgData = await orgRes.json() as {
      organizations?: Array<{ id: string }>
      error?: string
      error_description?: string
    }
    if (!orgRes.ok) {
      throw new Error(orgData.error || orgData.error_description || `HTTP ${orgRes.status}`)
    }
    const orgId = orgData.organizations?.[0]?.id
    if (!orgId) throw new Error('No Eventbrite organization found. Create one on eventbrite.com first.')
    setStatusMsg('Creating event…')
    const evtRes = await channelFetch(`/api/eventbrite/organizations/${orgId}/events`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ event: { name:{ html: eb.title }, description:{ html: eb.description || '' }, start:{ utc: startUtc, timezone: eb.timezone }, end:{ utc: endUtc, timezone: eb.timezone }, currency: 'USD', online_event: eb.isOnline, listed: eb.listed, shareable: true } }) })
    const evtData = await evtRes.json() as { id?: string; error_description?: string; error?: string }
    if (!evtRes.ok) throw new Error(evtData.error_description || evtData.error || `HTTP ${evtRes.status}`)
    const eventId2 = evtData.id!
    if (!eb.isOnline && (eb.venueName || eb.address || eb.city)) {
      setStatusMsg('Creating venue…')
      const vRes = await channelFetch(`/api/eventbrite/organizations/${orgId}/venues`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ venue: { name: eb.venueName || eb.city, address: { address_1: eb.address || undefined, city: eb.city || undefined, country: eb.country || undefined } } }) })
      if (vRes.ok) { const vData = await vRes.json() as { id?: string }; if (vData.id) await channelFetch(`/api/eventbrite/events/${eventId2}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ event: { venue_id: vData.id } }) }) }
    }
    setStatusMsg('Creating tickets…')
    const tc = buildEbTicketClass({
      name: eb.ticketName || 'General Admission',
      free: eb.ticketType === 'free',
      capacity: eb.ticketQuantity,
      currency: 'USD',
      price: eb.ticketType === 'free' ? 0 : eb.ticketPrice,
    })
    const tcRes = await channelFetch(`/api/eventbrite/events/${eventId2}/ticket_classes`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ticket_class: tc }) })
    if (!tcRes.ok) { const d = await tcRes.json() as { error_description?: string }; throw new Error(`Tickets: ${d.error_description || `HTTP ${tcRes.status}`}`) }
  }

  function handleClose() { setHt(HT_EMPTY); setLu(LUMA_EMPTY); setEb(EB_EMPTY); setError(''); setStatusMsg(''); setSyncTo({}); onClose() }

  const isCreate = mode === 'create'
  const ch = CH_META[channel]

  // ─── Shared UI helpers ─────────────────────────────────────────────────────
  function SampleBtn({ onClick }: { onClick: () => void }) {
    return (
      <button type="button" onClick={onClick} style={{ background: ch.color + '1a', border: `1px solid ${ch.color}59`, borderRadius:'6px', color: ch.color, padding:'5px 12px', fontSize:'12px', cursor:'pointer' }}>
        ✦ Fill Sample Data
      </button>
    )
  }
  function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return <div><label style={LABEL}>{label}</label>{children}</div>
  }
  function AddBtn({ label, onClick }: { label: string; onClick: () => void }) {
    return (
      <button type="button" onClick={onClick} style={{ background:'rgba(56,139,253,0.08)', border:'1px dashed rgba(56,139,253,0.4)', borderRadius:'6px', color:'#D98A2B', padding:'6px 12px', fontSize:'12px', cursor:'pointer', width:'100%' }}>
        + {label}
      </button>
    )
  }
  function RemoveBtn({ onClick }: { onClick: () => void }) {
    return (
      <button type="button" onClick={onClick} style={{ background:'none', border:'none', color:'#C2502E', fontSize:'16px', cursor:'pointer', padding:'0 4px', lineHeight:1, flexShrink:0 }}>×</button>
    )
  }

  // ─── Hightribe form ────────────────────────────────────────────────────────
  function HtBody() {
    const s = <K extends keyof HtForm>(k: K) => (v: HtForm[K]) => setHt(f => ({ ...f, [k]: v }))

    function updateTicket(i: number, k: keyof HtTicket, v: string | boolean) {
      setHt(f => { const t = [...f.tickets]; t[i] = { ...t[i], [k]: v }; return { ...f, tickets: t } })
    }
    function addTicket() { setHt(f => ({ ...f, tickets: [...f.tickets, { ...EMPTY_TICKET }] })) }
    function removeTicket(i: number) { setHt(f => ({ ...f, tickets: f.tickets.filter((_, idx) => idx !== i) })) }

    function updateList(key: 'highlights' | 'policies', i: number, v: string) {
      setHt(f => { const arr = [...f[key]]; arr[i] = v; return { ...f, [key]: arr } })
    }
    function addToList(key: 'highlights' | 'policies') { setHt(f => ({ ...f, [key]: [...f[key], ''] })) }
    function removeFromList(key: 'highlights' | 'policies', i: number) { setHt(f => ({ ...f, [key]: f[key].filter((_, idx) => idx !== i) })) }

    function updateItinerary(i: number, k: keyof HtItinerary, v: string) {
      setHt(f => { const arr = [...f.itineraries]; arr[i] = { ...arr[i], [k]: v }; return { ...f, itineraries: arr } })
    }
    function addItinerary() { setHt(f => ({ ...f, itineraries: [...f.itineraries, { title: '', description: '' }] })) }
    function removeItinerary(i: number) { setHt(f => ({ ...f, itineraries: f.itineraries.filter((_, idx) => idx !== i) })) }

    return (
      <>
        {/* ── Basic Info ── */}
        <div style={SEC}>Event Details</div>
        <Field label="Title *"><input required type="text" style={INPUT} value={ht.title} onChange={e => s('title')(e.target.value)} placeholder="Event title" /></Field>
        <Field label="Description *"><textarea required rows={3} style={{ ...INPUT, resize:'vertical', fontFamily:'inherit' }} value={ht.description} onChange={e => s('description')(e.target.value)} placeholder="Event description" /></Field>
        <Field label="Cover photo">
          {ht.coverUrl && (
            <img src={ht.coverUrl} alt="Cover" style={{ width:'100%', maxHeight:160, objectFit:'cover', borderRadius:8, marginBottom:8, border:'1px solid #E8DFD0' }} />
          )}
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:8 }}>
            <label style={{ background:'#F1EADC', border:'1px solid #E8DFD0', borderRadius:6, color:'#211B16', padding:'7px 14px', fontSize:13, cursor:'pointer' }}>
              Upload photo
              <input type="file" accept="image/*" hidden onChange={e => {
                const file = e.target.files?.[0]
                if (!file) return
                setHtCoverFile(file)
                s('coverUrl')(URL.createObjectURL(file))
              }} />
            </label>
            {ht.coverUrl && (
              <button type="button" style={{ background:'#F1EADC', border:'1px solid #E8DFD0', borderRadius:6, color:'#211B16', padding:'7px 14px', fontSize:13, cursor:'pointer' }} onClick={() => { setHtCoverFile(null); s('coverUrl')('') }}>Remove</button>
            )}
          </div>
          <input type="url" style={INPUT} value={ht.coverUrl.startsWith('blob:') ? '' : ht.coverUrl} onChange={e => { setHtCoverFile(null); s('coverUrl')(e.target.value) }} placeholder="Or paste image URL" />
        </Field>
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          <input type="checkbox" id="ht_biz" checked={ht.isBusinessProfile} onChange={e => s('isBusinessProfile')(e.target.checked)} style={{ width:'15px', height:'15px', cursor:'pointer' }} />
          <label htmlFor="ht_biz" style={{ fontSize:'13px', color:'#211B16', cursor:'pointer' }}>Business profile event</label>
        </div>

        {/* ── Dates ── */}
        <div style={SEC}>Date & Time</div>
        <div style={GRID2}>
          <Field label="Start Date *"><input required type="date" style={INPUT} value={ht.startDate} onChange={e => s('startDate')(e.target.value)} /></Field>
          <Field label="Start Time *"><input required type="time" style={INPUT} value={ht.startTime} onChange={e => s('startTime')(e.target.value)} /></Field>
          <Field label="End Date"><input type="date" style={INPUT} value={ht.endDate} onChange={e => s('endDate')(e.target.value)} /></Field>
          <Field label="End Time"><input type="time" style={INPUT} value={ht.endTime} onChange={e => s('endTime')(e.target.value)} /></Field>
        </div>
        <Field label="Timezone"><select style={INPUT} value={ht.timezone} onChange={e => s('timezone')(e.target.value)}>{TIMEZONES.map(tz => <option key={tz}>{tz}</option>)}</select></Field>

        {/* ── Location ── */}
        <div style={SEC}>Location</div>
        <Field label="Type">
          <div style={{ display:'flex', gap:'6px' }}>
            {(['venue','online','hybrid'] as const).map(t => (
              <button key={t} type="button" onClick={() => s('locationType')(t)} style={{ flex:1, padding:'7px', borderRadius:'6px', border:`1px solid ${ht.locationType===t ? HIGHTRIBE_COLOR + '66' : '#E8DFD0'}`, background: ht.locationType===t ? 'rgba(209,71,157,0.1)' : '#F1EADC', color: ht.locationType===t ? HIGHTRIBE_COLOR : '#8C7F6D', fontSize:'12px', cursor:'pointer' }}>
                {t === 'venue' ? '📍 In-person' : t === 'online' ? '💻 Online' : '🔀 Hybrid'}
              </button>
            ))}
          </div>
        </Field>
        {(ht.locationType === 'venue' || ht.locationType === 'hybrid') && (
          <>
            <Field label="Venue Name / Location Label"><input type="text" style={INPUT} value={ht.locationLabel} onChange={e => s('locationLabel')(e.target.value)} placeholder="e.g. Karachi IT Park" /></Field>
            <Field label="Street Address"><input type="text" style={INPUT} value={ht.address} onChange={e => s('address')(e.target.value)} placeholder="Street address" /></Field>
            <div style={GRID2}>
              <Field label="City"><input type="text" style={INPUT} value={ht.city} onChange={e => s('city')(e.target.value)} placeholder="Karachi" /></Field>
              <Field label="Country"><input type="text" style={INPUT} maxLength={3} value={ht.country} onChange={e => s('country')(e.target.value.toUpperCase())} placeholder="PK" /></Field>
            </div>
            <div style={GRID2}>
              <Field label="Latitude (optional)"><input type="number" step="any" style={INPUT} value={ht.lat} onChange={e => s('lat')(e.target.value)} placeholder="24.8607" /></Field>
              <Field label="Longitude (optional)"><input type="number" step="any" style={INPUT} value={ht.lng} onChange={e => s('lng')(e.target.value)} placeholder="67.0011" /></Field>
            </div>
          </>
        )}
        {(ht.locationType === 'online' || ht.locationType === 'hybrid') && (
          <Field label="Online URL"><input type="url" style={INPUT} value={ht.onlineUrl} onChange={e => s('onlineUrl')(e.target.value)} placeholder="https://zoom.us/..." /></Field>
        )}

        {/* ── Tickets ── */}
        <div style={SEC}>Tickets</div>
        {ht.tickets.map((t, i) => (
          <div key={i} style={{ background:'#FBF7F0', border:'1px solid #E8DFD0', borderRadius:'8px', padding:'12px', marginBottom:'8px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
              <span style={{ fontSize:'12px', fontWeight:600, color: HIGHTRIBE_COLOR }}>Ticket #{i+1}</span>
              <RemoveBtn onClick={() => removeTicket(i)} />
            </div>
            <div style={GRID2}>
              <Field label="Name *"><input required type="text" style={INPUT} value={t.name} onChange={e => updateTicket(i, 'name', e.target.value)} placeholder="General Admission" /></Field>
              <Field label="Quantity *"><input required type="number" min="1" style={INPUT} value={t.quantity} onChange={e => updateTicket(i, 'quantity', e.target.value)} placeholder="50" /></Field>
            </div>
            <div style={GRID2}>
              <Field label="Price">
                <div style={{ display: 'flex', alignItems: 'stretch' }}>
                  <span style={{
                    display: 'grid', placeItems: 'center', padding: '0 10px',
                    background: '#F1EADC', border: '1px solid #E8DFD0', borderRight: 'none',
                    borderRadius: '6px 0 0 6px', fontSize: '13px', fontWeight: 700, color: '#8C7F6D',
                  }}>$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    style={{ ...INPUT, borderRadius: '0 6px 6px 0' }}
                    value={t.price}
                    onChange={e => updateTicket(i, 'price', e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </Field>
              <Field label="Booking Type">
                <select style={INPUT} value={t.bookingType} onChange={e => updateTicket(i, 'bookingType', e.target.value)}>
                  <option value="instant">Instant</option>
                  <option value="request">Request</option>
                </select>
              </Field>
            </div>
            <div style={GRID2}>
              <Field label="Sale Start (optional)"><input type="date" style={INPUT} value={t.startDate} onChange={e => updateTicket(i, 'startDate', e.target.value)} /></Field>
              <Field label="Sale End (optional)"><input type="date" style={INPUT} value={t.endDate} onChange={e => updateTicket(i, 'endDate', e.target.value)} /></Field>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:'8px', marginTop:'4px' }}>
              <input type="checkbox" id={`st_${i}`} checked={t.showTicket} onChange={e => updateTicket(i, 'showTicket', e.target.checked)} style={{ width:'14px', height:'14px', cursor:'pointer' }} />
              <label htmlFor={`st_${i}`} style={{ fontSize:'12px', color:'#8C7F6D', cursor:'pointer' }}>Show ticket publicly</label>
            </div>
          </div>
        ))}
        <AddBtn label="Add Ticket" onClick={addTicket} />

        {/* Ticket Settings (shown only if tickets added) */}
        {ht.tickets.length > 0 && (
          <>
            <div style={{ ...SEC, marginTop:'8px' }}>Ticket Settings</div>
            <div style={GRID2}>
              <Field label="Min Qty per Booking"><input type="number" min="1" style={INPUT} value={ht.ticketMinQty} onChange={e => s('ticketMinQty')(e.target.value)} /></Field>
              <Field label="Max Qty per Booking"><input type="number" min="1" style={INPUT} value={ht.ticketMaxQty} onChange={e => s('ticketMaxQty')(e.target.value)} /></Field>
            </div>
            <div style={GRID2}>
              <Field label="Sales End Before Event (optional)"><input type="number" min="1" style={INPUT} value={ht.salesEndTime} onChange={e => s('salesEndTime')(e.target.value)} placeholder="e.g. 2" /></Field>
              <Field label="Unit">
                <select style={INPUT} value={ht.salesEndUnit} onChange={e => s('salesEndUnit')(e.target.value)}>
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                </select>
              </Field>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
              <input type="checkbox" id="ht_refund" checked={ht.allowRefunds} onChange={e => s('allowRefunds')(e.target.checked)} style={{ width:'15px', height:'15px', cursor:'pointer' }} />
              <label htmlFor="ht_refund" style={{ fontSize:'13px', color:'#211B16', cursor:'pointer' }}>Allow refunds</label>
            </div>
          </>
        )}

        {/* ── Highlights ── */}
        <div style={SEC}>Highlights (optional)</div>
        {ht.highlights.map((h, i) => (
          <div key={i} style={{ display:'flex', gap:'6px', marginBottom:'6px', alignItems:'center' }}>
            <input type="text" style={{ ...INPUT, flex:1 }} value={h} onChange={e => updateList('highlights', i, e.target.value)} placeholder={`Highlight ${i+1}`} />
            <RemoveBtn onClick={() => removeFromList('highlights', i)} />
          </div>
        ))}
        <AddBtn label="Add Highlight" onClick={() => addToList('highlights')} />

        {/* ── Itineraries ── */}
        <div style={SEC}>Itinerary / Schedule (optional)</div>
        {ht.itineraries.map((item, i) => (
          <div key={i} style={{ background:'#FBF7F0', border:'1px solid #E8DFD0', borderRadius:'8px', padding:'10px', marginBottom:'8px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'6px' }}>
              <span style={{ fontSize:'11px', color:'#8C7F6D' }}>Item {i+1}</span>
              <RemoveBtn onClick={() => removeItinerary(i)} />
            </div>
            <Field label="Title"><input type="text" style={INPUT} value={item.title} onChange={e => updateItinerary(i, 'title', e.target.value)} placeholder="e.g. Welcome & Registration" /></Field>
            <div style={{ marginTop:'6px' }}>
              <Field label="Description"><textarea rows={2} style={{ ...INPUT, resize:'vertical', fontFamily:'inherit' }} value={item.description} onChange={e => updateItinerary(i, 'description', e.target.value)} placeholder="What happens in this segment" /></Field>
            </div>
          </div>
        ))}
        <AddBtn label="Add Itinerary Item" onClick={addItinerary} />

        {/* ── Policies ── */}
        <div style={SEC}>Policies / Terms (optional)</div>
        {ht.policies.map((p, i) => (
          <div key={i} style={{ display:'flex', gap:'6px', marginBottom:'6px', alignItems:'center' }}>
            <input type="text" style={{ ...INPUT, flex:1 }} value={p} onChange={e => updateList('policies', i, e.target.value)} placeholder={`Policy ${i+1}`} />
            <RemoveBtn onClick={() => removeFromList('policies', i)} />
          </div>
        ))}
        <AddBtn label="Add Policy" onClick={() => addToList('policies')} />

        {/* ── Publish Status ── */}
        <div style={SEC}>Publishing</div>
        <Field label="Status">
          <select style={INPUT} value={ht.status} onChange={e => s('status')(e.target.value as HtForm['status'])}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </Field>
      </>
    )
  }

  // ─── Luma form ─────────────────────────────────────────────────────────────
  function LumaBody() {
    const s = (k: keyof LumaForm) => (v: string | boolean) => setLu(f => ({ ...f, [k]: v }))
    return (
      <>
        <div style={SEC}>Event Details</div>
        <Field label="Name *"><input required type="text" style={INPUT} value={lu.name} onChange={e => s('name')(e.target.value)} placeholder="Event name" /></Field>
        <Field label="Description"><textarea rows={3} style={{ ...INPUT, resize:'vertical', fontFamily:'inherit' }} value={lu.description} onChange={e => s('description')(e.target.value)} placeholder="Event description" /></Field>
        <Field label="Cover Image URL"><input type="url" style={INPUT} value={lu.coverUrl} onChange={e => s('coverUrl')(e.target.value)} placeholder="https://..." /></Field>

        <div style={SEC}>Date & Time</div>
        <div style={GRID2}>
          <Field label="Start *"><input required type="datetime-local" style={INPUT} value={lu.startAt} onChange={e => s('startAt')(e.target.value)} /></Field>
          <Field label="End *"><input required type="datetime-local" style={INPUT} value={lu.endAt} onChange={e => s('endAt')(e.target.value)} /></Field>
        </div>
        <Field label="Timezone"><select style={INPUT} value={lu.timezone} onChange={e => s('timezone')(e.target.value)}>{TIMEZONES.map(tz => <option key={tz}>{tz}</option>)}</select></Field>

        <div style={SEC}>Location</div>
        <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'8px' }}>
          <input type="checkbox" id="lu_online" checked={lu.isOnline} onChange={e => s('isOnline')(e.target.checked)} style={{ width:'16px', height:'16px', cursor:'pointer' }} />
          <label htmlFor="lu_online" style={{ fontSize:'13px', color:'#211B16', cursor:'pointer' }}>Online event</label>
        </div>
        {lu.isOnline
          ? <Field label="Meeting URL"><input type="url" style={INPUT} value={lu.meetingUrl} onChange={e => s('meetingUrl')(e.target.value)} placeholder="https://zoom.us/..." /></Field>
          : <>
              <Field label="Full Address"><input type="text" style={INPUT} value={lu.fullAddress} onChange={e => s('fullAddress')(e.target.value)} placeholder="Venue name, street, city" /></Field>
              <div style={GRID2}>
                <Field label="City"><input type="text" style={INPUT} value={lu.city} onChange={e => s('city')(e.target.value)} placeholder="Lahore" /></Field>
                <Field label="Country"><input type="text" style={INPUT} maxLength={3} value={lu.country} onChange={e => s('country')(e.target.value.toUpperCase())} placeholder="PK" /></Field>
              </div>
            </>
        }

        <div style={SEC}>Options</div>
        <Field label="Capacity"><input type="number" min="1" style={INPUT} value={lu.capacity} onChange={e => s('capacity')(e.target.value)} placeholder="Unlimited" /></Field>
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          <input type="checkbox" id="rsvp" checked={lu.requireRsvpApproval} onChange={e => s('requireRsvpApproval')(e.target.checked)} style={{ width:'16px', height:'16px', cursor:'pointer' }} />
          <label htmlFor="rsvp" style={{ fontSize:'13px', color:'#211B16', cursor:'pointer' }}>Require RSVP approval</label>
        </div>
      </>
    )
  }

  // ─── Eventbrite form ────────────────────────────────────────────────────────
  function EbBody() {
    const s = (k: keyof EbForm) => (v: string | boolean) => setEb(f => ({ ...f, [k]: v }))
    return (
      <>
        <div style={SEC}>Event Details</div>
        <Field label="Title *"><input required type="text" style={INPUT} value={eb.title} onChange={e => s('title')(e.target.value)} placeholder="Event title" /></Field>
        <Field label="Description (HTML allowed)"><textarea rows={3} style={{ ...INPUT, resize:'vertical', fontFamily:'inherit' }} value={eb.description} onChange={e => s('description')(e.target.value)} placeholder="<p>Event description...</p>" /></Field>

        <div style={SEC}>Date & Time</div>
        <div style={GRID2}>
          <Field label="Start Date *"><input required type="date" style={INPUT} value={eb.startDate} onChange={e => s('startDate')(e.target.value)} /></Field>
          <Field label="Start Time"><input type="time" style={INPUT} value={eb.startTime} onChange={e => s('startTime')(e.target.value)} /></Field>
          <Field label="End Date *"><input required type="date" style={INPUT} value={eb.endDate} onChange={e => s('endDate')(e.target.value)} /></Field>
          <Field label="End Time"><input type="time" style={INPUT} value={eb.endTime} onChange={e => s('endTime')(e.target.value)} /></Field>
        </div>
        <Field label="Timezone"><select style={INPUT} value={eb.timezone} onChange={e => s('timezone')(e.target.value)}>{TIMEZONES.map(tz => <option key={tz}>{tz}</option>)}</select></Field>

        <div style={SEC}>Location & Publishing</div>
        <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'10px' }}>
          <input type="checkbox" id="eb_online" checked={eb.isOnline} onChange={e => s('isOnline')(e.target.checked)} style={{ width:'16px', height:'16px', cursor:'pointer' }} />
          <label htmlFor="eb_online" style={{ fontSize:'13px', color:'#211B16', cursor:'pointer' }}>Online event</label>
        </div>
        {!eb.isOnline && (
          <>
            <Field label="Venue Name"><input type="text" style={INPUT} value={eb.venueName} onChange={e => s('venueName')(e.target.value)} placeholder="Venue name" /></Field>
            <Field label="Street Address"><input type="text" style={INPUT} value={eb.address} onChange={e => s('address')(e.target.value)} placeholder="Street address" /></Field>
            <div style={GRID2}>
              <Field label="City"><input type="text" style={INPUT} value={eb.city} onChange={e => s('city')(e.target.value)} placeholder="Lahore" /></Field>
              <Field label="Country"><input type="text" style={INPUT} maxLength={2} value={eb.country} onChange={e => s('country')(e.target.value.toUpperCase())} placeholder="PK" /></Field>
            </div>
          </>
        )}
        <Field label="Visibility">
          <select style={INPUT} value={eb.listed ? 'public' : 'draft'} onChange={e => s('listed')(e.target.value === 'public')}>
            <option value="draft">Draft (private)</option>
            <option value="public">Listed (public)</option>
          </select>
        </Field>

        <div style={SEC}>Tickets</div>
        <div style={{ display:'flex', gap:'8px', marginBottom:'10px' }}>
          {(['free','paid'] as const).map(t => (
            <button key={t} type="button" onClick={() => s('ticketType')(t)} style={{ flex:1, padding:'8px', borderRadius:'6px', border:`1px solid ${eb.ticketType===t ? '#D98A2B66' : '#E8DFD0'}`, background: eb.ticketType===t ? 'rgba(56,139,253,0.1)' : '#F1EADC', color: eb.ticketType===t ? '#D98A2B' : '#8C7F6D', fontSize:'13px', cursor:'pointer' }}>
              {t === 'free' ? '🆓 Free' : '💳 Paid'}
            </button>
          ))}
        </div>
        <div style={GRID2}>
          <Field label="Ticket Name"><input type="text" style={INPUT} value={eb.ticketName} onChange={e => s('ticketName')(e.target.value)} placeholder="General Admission" /></Field>
          <Field label="Quantity"><input type="number" min="1" style={INPUT} value={eb.ticketQuantity} onChange={e => s('ticketQuantity')(e.target.value)} placeholder="Unlimited" /></Field>
        </div>
        {eb.ticketType === 'paid' && (
          <Field label="Price *">
            <div style={{ display: 'flex', alignItems: 'stretch' }}>
              <span style={{
                display: 'grid', placeItems: 'center', padding: '0 10px',
                background: '#F1EADC', border: '1px solid #E8DFD0', borderRight: 'none',
                borderRadius: '6px 0 0 6px', fontSize: '13px', fontWeight: 700, color: '#8C7F6D',
              }}>$</span>
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                style={{ ...INPUT, borderRadius: '0 6px 6px 0' }}
                value={eb.ticketPrice}
                onChange={e => s('ticketPrice')(e.target.value)}
                placeholder="10.00"
              />
            </div>
          </Field>
        )}
        <div style={{ background:'rgba(56,139,253,0.07)', border:'1px solid rgba(56,139,253,0.2)', borderRadius:'6px', padding:'8px 12px', fontSize:'12px', color:'#8C7F6D' }}>
          Event created as <b style={{ color:'#211B16' }}>draft</b> — publish from Eventbrite dashboard after review.
        </div>
      </>
    )
  }

  // ─── Sync section ──────────────────────────────────────────────────────────
  function SyncSection() {
    if (!isCreate) return null
    const others = (Object.keys(CH_META) as Channel[]).filter(c => c !== channel)
    return (
      <>
        <div style={{ ...SEC, marginTop:'6px' }}>Also Sync To (optional)</div>
        {others.map(c => {
          const m = CH_META[c]
          return (
            <div key={c} style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'8px' }}>
              <input type="checkbox" id={`sync_${c}`} checked={!!syncTo[c]} onChange={e => setSyncTo(s => ({ ...s, [c]: e.target.checked }))} style={{ width:'16px', height:'16px', cursor:'pointer' }} />
              <label htmlFor={`sync_${c}`} style={{ fontSize:'13px', color: syncTo[c] ? m.color : '#8C7F6D', cursor:'pointer', display:'flex', alignItems:'center', gap:'6px' }}>
                <span>{m.icon}</span>{m.label}
              </label>
            </div>
          )
        })}
      </>
    )
  }

  const sampleFns: Record<Channel, () => void> = {
    hightribe: () => setHt(HT_SAMPLE),
    luma:      () => setLu(LUMA_SAMPLE),
    eventbrite:() => setEb(EB_SAMPLE),
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.78)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'20px' }} onClick={e => { if (e.target === e.currentTarget) handleClose() }}>
      <div style={{ background:'#FFFFFF', border:'1px solid #E8DFD0', borderRadius:'12px', width:'100%', maxWidth:'580px', maxHeight:'92vh', overflow:'hidden', display:'flex', flexDirection:'column' }}>

        {/* Header */}
        <div style={{ padding:'16px 22px', borderBottom:'1px solid #E8DFD0', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <span style={{ fontSize:'18px' }}>{ch.icon}</span>
            <div>
              <div style={{ fontSize:'15px', fontWeight:700, color:'#211B16' }}>{isCreate ? 'Create Event' : 'Edit Event'}</div>
              <div style={{ fontSize:'11px', color: ch.color, marginTop:'1px' }}>{ch.label}</div>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
            <SampleBtn onClick={sampleFns[channel]} />
            <button onClick={handleClose} style={{ background:'none', border:'none', color:'#8C7F6D', fontSize:'20px', cursor:'pointer', lineHeight:1, padding:'4px' }}>×</button>
          </div>
        </div>

        {/* Channel tabs (create mode) */}
        {isCreate && (
          <div style={{ padding:'12px 22px 0', display:'flex', gap:'6px', flexShrink:0 }}>
            {(Object.keys(CH_META) as Channel[]).map(c => {
              const m = CH_META[c]
              return (
                <button key={c} onClick={() => setChannel(c)} style={{ flex:1, padding:'8px 6px', borderRadius:'8px', border:`1px solid ${channel===c ? m.color+'55' : '#E8DFD0'}`, background: channel===c ? m.color+'12' : '#F1EADC', color: channel===c ? m.color : '#8C7F6D', fontSize:'11px', fontWeight:600, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:'3px' }}>
                  <span style={{ fontSize:'16px' }}>{m.icon}</span>{m.label}
                </button>
              )
            })}
          </div>
        )}

        {loadingEvent && (
          <PageLoader label="Loading event…" />
        )}

        {!loadingEvent && (
          <div style={{ overflowY:'auto', flex:1 }}>
            <form id="ef-form" onSubmit={handleSubmit}>
              <div style={{ padding:'14px 22px', display:'flex', flexDirection:'column', gap:'12px' }}>
                {error && (
                  <div style={{ background:'rgba(248,81,73,0.1)', border:'1px solid rgba(248,81,73,0.4)', borderRadius:'6px', padding:'10px 14px', color:'#C2502E', fontSize:'13px' }}>{error}</div>
                )}
                {channel === 'hightribe'  && <HtBody />}
                {channel === 'luma'       && <LumaBody />}
                {channel === 'eventbrite' && <EbBody />}
                <SyncSection />
              </div>
            </form>
          </div>
        )}

        {/* Footer */}
        <div style={{ padding:'13px 22px', borderTop:'1px solid #E8DFD0', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <span style={{ fontSize:'12px', color:'#8C7F6D', minHeight:'16px' }}>{statusMsg}</span>
          <div style={{ display:'flex', gap:'8px' }}>
            <button type="button" onClick={handleClose} style={{ background:'none', border:'1px solid #E8DFD0', borderRadius:'6px', color:'#8C7F6D', padding:'7px 14px', fontSize:'13px', cursor:'pointer' }}>Cancel</button>
            <button type="submit" form="ef-form" disabled={submitting || loadingEvent} style={{ background: submitting ? '#F1EADC' : '#238636', border:'none', borderRadius:'6px', color: submitting ? '#8C7F6D' : '#fff', padding:'7px 20px', fontSize:'13px', fontWeight:600, cursor: submitting ? 'default' : 'pointer' }}>
              {submitting ? <InlineLoader label="Saving" /> : isCreate ? `Create on ${ch.label}` : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
