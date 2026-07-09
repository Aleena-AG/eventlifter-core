'use client'

import { channelFetch } from '@/lib/channel-fetch'
import { authHeader } from '@/lib/auth'
import type { ChannelKey } from '@/lib/types'
import { buildEbTicketClass, ebTicketQuantity } from '@/lib/eventbrite-ticket'
import { resolveEbTimezone } from '@/lib/eventbrite-timezone'
import {
  postHtEvent,
  resolveCoverFileForHt,
  resolveCoverUrl,
  type EventCoverFiles,
} from '@/lib/cover-image'

export type EventFormData = Record<string, string | boolean>

function toIso(date: string, time: string, tz: string): string {
  const raw = `${date}T${time.length === 5 ? time : time.slice(0, 5)}:00`
  try {
    return new Date(raw).toISOString().replace(/\.\d{3}Z$/, 'Z')
  } catch {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  }
}

function isOnline(fmt: string) {
  return fmt === 'Online' || fmt === 'Hybrid'
}

function isInPerson(fmt: string) {
  return fmt === 'In person' || fmt === 'Hybrid'
}

export async function publishToChannel(
  ch: ChannelKey,
  ev: EventFormData,
  files?: EventCoverFiles,
): Promise<{ eventId: string; ticketId?: string; url?: string }> {
  const fmt = String(ev.format || 'In person')
  const online = isOnline(fmt)
  const inPerson = isInPerson(fmt)
  const tz = String(ev.timezone || 'UTC')
  const startUtc = toIso(String(ev.date), String(ev.time), tz)
  const endUtc = toIso(String(ev.endDate || ev.date), String(ev.endTime || ev.time), tz)
  const cap = ebTicketQuantity(ev.capacity as string | number | undefined)
  const coverUrl = String(ev.coverUrl || '')
  const htCoverFile = ch === 'hightribe' ? await resolveCoverFileForHt(coverUrl, files?.cover) : undefined
  const publicCoverUrl = ch !== 'hightribe'
    ? await resolveCoverUrl(coverUrl, files?.cover)
    : undefined

  if (ch === 'hightribe') {
    const startD = new Date(startUtc)
    const endD = new Date(endUtc)
    const pad = (n: number) => String(n).padStart(2, '0')
    const body: Record<string, unknown> = {
      title: ev.title,
      description: String(ev.description || ev.title),
      status: 'published',
      is_business_profile: 0,
      dates: {
        start_date: `${startD.getFullYear()}-${pad(startD.getMonth() + 1)}-${pad(startD.getDate())}`,
        start_time: `${pad(startD.getHours())}:${pad(startD.getMinutes())}`,
        end_date: `${endD.getFullYear()}-${pad(endD.getMonth() + 1)}-${pad(endD.getDate())}`,
        end_time: `${pad(endD.getHours())}:${pad(endD.getMinutes())}`,
        timezone: tz,
      },
    }
    if (online) {
      body.location = { type: 'online', location: 'Online', address: 'Online', city: 'Online' }
    } else if (inPerson) {
      body.location = {
        type: 'physical',
        location: String(ev.venue || ev.address || 'TBD'),
        address: String(ev.address || ev.venue || 'TBD'),
        city: String(ev.city || ev.venue || 'TBD'),
        lat: ev.lat ? parseFloat(String(ev.lat)) : undefined,
        lng: ev.lng ? parseFloat(String(ev.lng)) : undefined,
      }
    }
    if (cap) {
      body.tickets = [{
        name: 'General Admission',
        price: ev.ticketType === 'Free' ? 0 : parseFloat(String(ev.price || '0')),
        currency: String(ev.currency || 'USD'),
        quantity: cap,
      }]
      const res = await postHtEvent('/api/hightribe/events/with-tickets', body, 'POST', htCoverFile)
      const data = await res.json() as { data?: { id?: unknown; tickets?: Array<{ id?: unknown }> }; message?: string; errors?: Record<string, string[]> }
      if (!res.ok) throw new Error(data.message || (data.errors ? Object.values(data.errors).flat().join(', ') : `HTTP ${res.status}`))
      const id = String((data.data as Record<string, unknown>)?.id || '')
      const ticketId = String((data.data as { tickets?: Array<{ id?: unknown }> })?.tickets?.[0]?.id || '')
      return { eventId: id, ticketId }
    }
    const res = await postHtEvent('/api/hightribe/events', body, 'POST', htCoverFile)
    const data = await res.json() as { data?: { id?: unknown }; message?: string; errors?: Record<string, string[]> }
    if (!res.ok) throw new Error(data.message || (data.errors ? Object.values(data.errors).flat().join(', ') : `HTTP ${res.status}`))
    return { eventId: String((data.data as Record<string, unknown>)?.id || '') }
  }

  if (ch === 'luma') {
    const body: Record<string, unknown> = {
      name: ev.title,
      start_at: startUtc,
      end_at: endUtc,
      timezone: tz,
      description: ev.description || undefined,
      cover_url: publicCoverUrl || undefined,
      require_rsvp_approval: !!ev.requireApproval,
      capacity: cap,
    }
    if (online) body.meeting_url = ev.onlineUrl || undefined
    else if (inPerson && (ev.city || ev.address || ev.venue)) {
      body.geo_address_json = {
        type: 'manual',
        address: [ev.venue, ev.address, ev.city, ev.country].filter(Boolean).join(', '),
        city: ev.city || undefined,
        country: ev.country || undefined,
        latitude: ev.lat ? parseFloat(String(ev.lat)) : undefined,
        longitude: ev.lng ? parseFloat(String(ev.lng)) : undefined,
      }
    }
    const res = await channelFetch('/api/luma/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const raw = await res.json() as { status?: string; data?: { api_id?: string }; message?: string; error?: string }
    if (!res.ok || raw.status === 'error') throw new Error(raw.message || raw.error || `HTTP ${res.status}`)
    const eventId = String(raw.data?.api_id || '')
    return { eventId, url: `lu.ma/${eventId}` }
  }

  // Eventbrite
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
  if (!orgId) throw new Error('No Eventbrite organization found')

  const ebTz = await resolveEbTimezone(tz, startUtc, {
    country: String(ev.country || ''),
    city: String(ev.city || ''),
  })

  const evtRes = await channelFetch(`/api/eventbrite/organizations/${orgId}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: {
        name: { html: ev.title },
        description: { html: String(ev.description || ev.title) },
        start: { utc: startUtc, timezone: ebTz },
        end: { utc: endUtc, timezone: ebTz },
        currency: String(ev.currency || 'USD'),
        online_event: online && !inPerson,
        listed: ev.visibility === 'Public',
        shareable: true,
      },
    }),
  })
  const evtData = await evtRes.json() as { id?: string; error_description?: string }
  if (!evtRes.ok) throw new Error(evtData.error_description || `HTTP ${evtRes.status}`)
  const eventId = evtData.id!

  if (inPerson && (ev.venue || ev.address || ev.city)) {
    const vRes = await channelFetch(`/api/eventbrite/organizations/${orgId}/venues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        venue: {
          name: String(ev.venue || ev.city),
          address: { address_1: ev.address || undefined, city: ev.city || undefined, country: ev.country || undefined },
        },
      }),
    })
    if (vRes.ok) {
      const vData = await vRes.json() as { id?: string }
      if (vData.id) {
        await channelFetch(`/api/eventbrite/events/${eventId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: { venue_id: vData.id } }),
        })
      }
    }
  }

  const tc = buildEbTicketClass({
    name: 'General Admission',
    free: ev.ticketType === 'Free',
    capacity: cap,
    currency: String(ev.currency || 'USD'),
    price: ev.ticketType === 'Free' ? 0 : parseFloat(String(ev.price || '0')),
  })

  const tcRes = await channelFetch(`/api/eventbrite/events/${eventId}/ticket_classes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket_class: tc }),
  })
  const tcData = await tcRes.json() as { id?: string; error_description?: string }
  if (!tcRes.ok) throw new Error(tcData.error_description || `HTTP ${tcRes.status}`)

  return { eventId, ticketId: tcData.id, url: `eventbrite.com/e/${eventId}` }
}

export async function updateChannelEvent(
  ch: ChannelKey,
  eventId: string | number,
  ev: EventFormData,
  files?: EventCoverFiles,
): Promise<void> {
  const fmt = String(ev.format || 'In person')
  const online = fmt === 'Online' || fmt === 'Hybrid'
  const inPerson = fmt === 'In person' || fmt === 'Hybrid'
  const tz = String(ev.timezone || 'UTC')
  const startUtc = toIso(String(ev.date), String(ev.time), tz)
  const endUtc = toIso(String(ev.endDate || ev.date), String(ev.endTime || ev.time), tz)
  const coverUrl = String(ev.coverUrl || '')
  const htCoverFile = ch === 'hightribe' ? await resolveCoverFileForHt(coverUrl, files?.cover) : undefined
  const publicCoverUrl = ch !== 'hightribe'
    ? await resolveCoverUrl(coverUrl, files?.cover)
    : undefined

  if (ch === 'hightribe') {
    const startD = new Date(startUtc)
    const endD = new Date(endUtc)
    const pad = (n: number) => String(n).padStart(2, '0')
    const body: Record<string, unknown> = {
      title: ev.title,
      description: String(ev.description || ev.title),
      dates: {
        start_date: `${startD.getFullYear()}-${pad(startD.getMonth() + 1)}-${pad(startD.getDate())}`,
        start_time: `${pad(startD.getHours())}:${pad(startD.getMinutes())}`,
        end_date: `${endD.getFullYear()}-${pad(endD.getMonth() + 1)}-${pad(endD.getDate())}`,
        end_time: `${pad(endD.getHours())}:${pad(endD.getMinutes())}`,
        timezone: tz,
      },
    }
    if (online) {
      body.location = { type: 'online', location: 'Online', address: 'Online', city: 'Online', online_url: ev.onlineUrl || undefined }
    } else if (inPerson) {
      body.location = {
        type: 'physical',
        location: String(ev.venue || ev.address || 'TBD'),
        address: String(ev.address || ev.venue || 'TBD'),
        city: String(ev.city || ev.venue || 'TBD'),
        lat: ev.lat ? parseFloat(String(ev.lat)) : undefined,
        lng: ev.lng ? parseFloat(String(ev.lng)) : undefined,
      }
    }
    const res = await postHtEvent(`/api/hightribe/events/${eventId}`, body, 'PUT', htCoverFile)
    const data = await res.json() as { message?: string; errors?: Record<string, string[]> }
    if (!res.ok) throw new Error(data.message || (data.errors ? Object.values(data.errors).flat().join(', ') : `HTTP ${res.status}`))
    return
  }

  if (ch === 'luma') {
    const id = String(eventId)
    const body: Record<string, unknown> = {
      event_id: id,
      api_id: id,
      name: ev.title,
      start_at: startUtc,
      end_at: endUtc,
      timezone: tz,
      description: ev.description || undefined,
      cover_url: publicCoverUrl || undefined,
      require_rsvp_approval: !!ev.requireApproval,
      capacity: ev.capacity ? parseInt(String(ev.capacity)) : undefined,
    }
    if (online) body.meeting_url = ev.onlineUrl || undefined
    else if (inPerson && (ev.city || ev.address || ev.venue)) {
      body.geo_address_json = {
        type: 'manual',
        address: [ev.venue, ev.address, ev.city, ev.country].filter(Boolean).join(', '),
        city: ev.city || undefined,
        country: ev.country || undefined,
        latitude: ev.lat ? parseFloat(String(ev.lat)) : undefined,
        longitude: ev.lng ? parseFloat(String(ev.lng)) : undefined,
      }
    }
    const res = await channelFetch('/api/luma/events', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const raw = await res.json() as { status?: string; message?: string; error?: string }
    if (!res.ok || raw.status === 'error') throw new Error(raw.message || raw.error || `HTTP ${res.status}`)
    return
  }

  const res = await channelFetch(`/api/eventbrite/events/${eventId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: {
        name: { html: ev.title },
        description: { html: String(ev.description || '') },
        start: { utc: startUtc, timezone: tz },
        end: { utc: endUtc, timezone: tz },
        currency: String(ev.currency || 'USD'),
        online_event: online && !inPerson,
        listed: ev.visibility === 'Public',
      },
    }),
  })
  const data = await res.json() as { error_description?: string; error?: string }
  if (!res.ok) throw new Error(data.error_description || data.error || `HTTP ${res.status}`)
}

export async function publishToAllChannels(
  ev: EventFormData,
  targets: ChannelKey[],
  files?: EventCoverFiles,
): Promise<Partial<Record<ChannelKey, { status: 'synced' | 'error'; url?: string; message?: string }>>> {
  const masterRes = await fetch('/api/registry', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader(),
    },
    body: JSON.stringify({
      action: 'create',
      title: String(ev.title),
      capacity: parseInt(String(ev.capacity || '150')) || 150,
    }),
  })
  const master = await masterRes.json() as { id: string }

  const results: Partial<Record<ChannelKey, { status: 'synced' | 'error'; url?: string; message?: string }>> = {}

  for (const ch of targets) {
    try {
      const ref = await publishToChannel(ch, ev, files)
      await fetch('/api/registry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader(),
        },
        body: JSON.stringify({
          action: 'link',
          masterId: master.id,
          channel: ch,
          ref: { eventId: ref.eventId, ticketId: ref.ticketId, url: ref.url },
        }),
      })
      results[ch] = { status: 'synced', url: ref.url }
    } catch (e) {
      results[ch] = { status: 'error', message: e instanceof Error ? e.message : String(e) }
    }
  }

  try { await fetch('/api/webhooks/setup', { method: 'POST' }) } catch { /* non-fatal */ }

  return results
}
