import { loadSettings } from '@/lib/settings-store'
import { backendJson } from '@/lib/backend-client'
import type { MasterEventRecord } from '@/lib/event-registry'
import type { ChannelKey } from '@/lib/types'
import { proxyLumaPath } from '@/lib/luma-api'

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

/** Push remaining capacity to all linked channels after a booking */
export async function syncCapacityAcrossChannels(
  master: MasterEventRecord,
  excludeChannel?: ChannelKey,
): Promise<{ channel: ChannelKey; ok: boolean; error?: string }[]> {
  const remaining = Math.max(0, master.capacity - master.sold)
  const results: { channel: ChannelKey; ok: boolean; error?: string }[] = []
  const channels = Object.keys(master.channels) as ChannelKey[]

  await Promise.all(channels.map(async (ch) => {
    if (ch === excludeChannel) return
    const ref = master.channels[ch]
    if (!ref) return
    try {
      if (ch === 'eventbrite' && ref.ticketId) {
        await ebFetch(`events/${ref.eventId}/ticket_classes/${ref.ticketId}/`, {
          method: 'POST',
          body: JSON.stringify({ ticket_class: { quantity_total: remaining + master.sold } }),
        })
        results.push({ channel: ch, ok: true })
      } else if (ch === 'luma' && ref.ticketId) {
        await proxyLumaPath(['ticket-types'], 'PUT', {}, {
          event_ticket_type_id: ref.ticketId,
          max_capacity: remaining + master.sold,
        }, loadSettings())
        results.push({ channel: ch, ok: true })
      } else {
        results.push({ channel: ch, ok: true })
      }
    } catch (e) {
      results.push({ channel: ch, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }))

  return results
}

/**
 * Persist booking via POST /api/v1/registry/attendees/by-channel, then sync capacity.
 */
export async function handleBookingWebhook(
  sourceChannel: ChannelKey,
  channelEventId: string,
  attendee: { email: string; name: string; registeredAt?: string; externalId?: string },
): Promise<{
  master: MasterEventRecord | null
  synced: { channel: ChannelKey; ok: boolean; error?: string }[]
  bookingSaved?: boolean
}> {
  try {
    const raw = await backendJson<MasterEventRecord | { master?: MasterEventRecord }>('registry/attendees/by-channel', {
      method: 'POST',
      body: JSON.stringify({
        channel: sourceChannel,
        eventId: channelEventId,
        email: attendee.email,
        name: attendee.name,
        registeredAt: attendee.registeredAt || new Date().toISOString(),
        ...(attendee.externalId ? { externalId: attendee.externalId } : {}),
      }),
    })

    const { unwrapApiData } = await import('@/lib/api-response')
    const data = unwrapApiData<MasterEventRecord & { master?: MasterEventRecord }>(raw)
    const master = (data.master && typeof data.master === 'object'
      ? data.master
      : data) as MasterEventRecord

    if (!master?.id) {
      return { master: null, synced: [], bookingSaved: false }
    }

    const synced = await syncCapacityAcrossChannels(master, sourceChannel)
    return { master, synced, bookingSaved: true }
  } catch {
    return { master: null, synced: [], bookingSaved: false }
  }
}
