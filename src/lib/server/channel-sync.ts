import { loadSettings } from '@/app/api/settings/route'
import { getHtApiBase } from '@/lib/ht-api-base'
import { listHostedEvents } from '@/lib/luma-api'
import {
  normalizeEbAttendee,
  normalizeHtBooking,
  normalizeLumaGuest,
  ticketSoldFromRecord,
} from '@/lib/booking-utils'
import {
  replaceApiBookings,
  syncRegistryAttendeesToBookings,
  type StoredBooking,
} from '@/lib/db/bookings-store'
import {
  replaceChannelEvents,
  setChannelStats,
  type CachedChannelEvent,
} from '@/lib/db/events-store'
import { setSyncMeta } from '@/lib/db/index'
import type { ChannelKey } from '@/lib/types'

const EB_BASE = 'https://www.eventbriteapi.com/v3'

async function ebFetch(path: string, init?: RequestInit) {
  const token = loadSettings().eventbrite.privateToken
  if (!token) throw new Error('Eventbrite token not configured')
  const res = await fetch(`${EB_BASE}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init?.headers as Record<string, string> || {}),
    },
  })
  const data = await res.json() as Record<string, unknown>
  if (!res.ok) throw new Error(String(data.error_description || data.error || res.status))
  return data
}

async function htFetch(path: string, authHeader: string, query?: Record<string, string>) {
  const base = getHtApiBase()
  const url = new URL(`${base}/${path.replace(/^\//, '')}`)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v) url.searchParams.set(k, v)
    }
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: authHeader, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`HighTribe HTTP ${res.status}`)
  return res.json() as Promise<Record<string, unknown>>
}

export interface SyncResult {
  ok: boolean
  syncedAt: string
  channels: Partial<Record<ChannelKey, { events: number; bookings: number; tickets: number }>>
  errors: string[]
}

export async function syncAllChannels(htAuthHeader?: string | null): Promise<SyncResult> {
  const settings = loadSettings()
  const errors: string[] = []
  const syncedAt = new Date().toISOString()
  const summary: SyncResult['channels'] = {}

  const htConfigured = !!htAuthHeader?.startsWith('Bearer ')
  const lumaConfigured = !!settings.luma.apiKey
  const ebConfigured = !!settings.eventbrite.privateToken

  if (htConfigured && htAuthHeader) {
    try {
      const [eventsData, statsData] = await Promise.all([
        htFetch('events', htAuthHeader, { per_page: '100', page: '1' }),
        htFetch('events/stats', htAuthHeader).catch(() => ({})),
      ])

      const events = (eventsData.data as unknown[]) || []
      const cachedEvents: CachedChannelEvent[] = events.map((raw) => {
        const e = raw as Record<string, unknown>
        const dates = e.dates as Record<string, unknown> | undefined
        const start = String(
          dates?.starts_at || (dates?.start_date ? `${dates.start_date}T${dates?.start_time || '00:00'}` : ''),
        )
        return {
          channel: 'hightribe' as const,
          externalId: String(e.id),
          title: String(e.title || 'Untitled'),
          startUtc: start || undefined,
          priceLabel: 'HighTribe',
          payload: e,
        }
      })
      replaceChannelEvents('hightribe', cachedEvents)

      const htBookings: StoredBooking[] = []
      let page = 1
      let lastPage = 1
      while (page <= lastPage && page <= 20) {
        const bookingData = await htFetch('events/bookings', htAuthHeader, {
          per_page: '50',
          page: String(page),
        })
        const rows = (bookingData.data as unknown[]) || []
        for (const raw of rows) {
          if (raw && typeof raw === 'object') {
            htBookings.push(normalizeHtBooking(raw as Record<string, unknown>))
          }
        }
        lastPage = Number(bookingData.last_page || 1)
        page++
      }
      replaceApiBookings('hightribe', htBookings)

      const stats = statsData as { total_bookings?: number; tickets_sold?: number }
      const meta = eventsData.meta as { total?: number } | undefined
      setChannelStats('hightribe', {
        events: meta?.total ?? events.length,
        tickets: stats.tickets_sold ?? 0,
        bookings: stats.total_bookings ?? htBookings.length,
      })
      summary.hightribe = {
        events: meta?.total ?? events.length,
        tickets: stats.tickets_sold ?? 0,
        bookings: stats.total_bookings ?? htBookings.length,
      }
    } catch (e) {
      errors.push(`HighTribe: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (lumaConfigured) {
    try {
      const raw = await listHostedEvents({ upcoming_only: 'false', fetch_all: 'true' })
      const entries = (raw.entries as unknown[]) || []
      const lumaEvents: CachedChannelEvent[] = []
      const lumaBookings: StoredBooking[] = []
      let ticketsSold = 0

      for (const entry of entries) {
        const e = entry as Record<string, unknown>
        const ev = (e.event || e) as Record<string, unknown>
        const apiId = String(ev.id || ev.api_id || e.id || '')
        if (!apiId) continue
        const title = String(ev.name || e.name || 'Untitled')
        lumaEvents.push({
          channel: 'luma',
          externalId: apiId,
          title,
          startUtc: String(ev.start_at || e.start_at || '') || undefined,
          priceLabel: 'Luma',
          payload: e,
        })

        try {
          const { proxyLumaPath } = await import('@/lib/luma-api')
          const guestRaw = await proxyLumaPath(['guests'], 'GET', { event_api_id: apiId })
          const d = (guestRaw.data || guestRaw) as Record<string, unknown>
          const guestEntries = (d.entries as unknown[]) || (guestRaw.entries as unknown[]) || []
          for (const g of guestEntries) {
            const item = normalizeLumaGuest(g as Record<string, unknown>, title, apiId)
            if (item) lumaBookings.push(item)
          }
          if (typeof d.total === 'number') {
            // already counted via entries
          }

          const ttRaw = await proxyLumaPath(['ticket-types'], 'GET', { event_api_id: apiId })
          const ttData = (ttRaw.data || ttRaw) as Record<string, unknown>
          const ttEntries = (ttData.entries as unknown[]) || (ttData.ticket_types as unknown[]) || (ttRaw.entries as unknown[]) || []
          for (const t of ttEntries) {
            ticketsSold += ticketSoldFromRecord(t as Record<string, unknown>)
          }
        } catch {
          // skip per-event errors
        }
      }

      replaceChannelEvents('luma', lumaEvents)
      replaceApiBookings('luma', lumaBookings)
      setChannelStats('luma', {
        events: lumaEvents.length,
        tickets: ticketsSold,
        bookings: lumaBookings.length,
      })
      summary.luma = { events: lumaEvents.length, tickets: ticketsSold, bookings: lumaBookings.length }
    } catch (e) {
      errors.push(`Luma: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (ebConfigured) {
    try {
      const orgData = await ebFetch('users/me/organizations') as { organizations?: Array<{ id: string }> }
      const orgId = orgData.organizations?.[0]?.id
      if (!orgId) throw new Error('No Eventbrite organization')

      const evtData = await ebFetch(`organizations/${orgId}/events?page_size=100`) as {
        events?: Array<{ id: string; name?: { text?: string }; start?: { utc?: string }; is_free?: boolean }>
      }
      const ebEvents = evtData.events || []
      const cachedEvents: CachedChannelEvent[] = ebEvents.map(e => ({
        channel: 'eventbrite',
        externalId: e.id,
        title: e.name?.text || 'Untitled',
        startUtc: e.start?.utc,
        priceLabel: e.is_free ? 'Free' : 'Eventbrite',
        payload: e,
      }))
      replaceChannelEvents('eventbrite', cachedEvents)

      const ebBookings: StoredBooking[] = []
      let ticketsSold = 0

      for (const e of ebEvents) {
        const eventTitle = e.name?.text || 'Untitled'
        try {
          const tcData = await ebFetch(`events/${e.id}/ticket_classes`) as {
            ticket_classes?: Array<{ quantity_sold?: number }>
          }
          ticketsSold += (tcData.ticket_classes || []).reduce((s, tc) => s + (tc.quantity_sold || 0), 0)

          let page = 1
          let hasMore = true
          while (hasMore && page <= 5) {
            const attData = await ebFetch(
              `events/${e.id}/attendees?status=attending&page=${page}&page_size=200`,
            ) as { attendees?: Array<Record<string, unknown>>; pagination?: { has_more_items?: boolean } }
            for (const raw of attData.attendees || []) {
              const item = normalizeEbAttendee(raw, eventTitle, e.id)
              if (item) ebBookings.push(item)
            }
            hasMore = !!attData.pagination?.has_more_items
            page++
          }
        } catch {
          // skip event
        }
      }

      replaceApiBookings('eventbrite', ebBookings)
      setChannelStats('eventbrite', {
        events: ebEvents.length,
        tickets: ticketsSold,
        bookings: ebBookings.length,
      })
      summary.eventbrite = { events: ebEvents.length, tickets: ticketsSold, bookings: ebBookings.length }
    } catch (e) {
      errors.push(`Eventbrite: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  syncRegistryAttendeesToBookings()
  setSyncMeta('last_sync_at', syncedAt)

  return { ok: errors.length === 0, syncedAt, channels: summary, errors }
}
