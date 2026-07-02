import { loadSettings } from '@/app/api/settings/route'
import { handleWebhookBooking } from '../../../backend/src/services/webhook-booking'
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
          event_api_id: ref.eventId,
          ticket_type_api_id: ref.ticketId,
          capacity: remaining + master.sold,
        }, loadSettings())
        results.push({ channel: ch, ok: true })
      } else if (ch === 'hightribe') {
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

function toMasterRecord(master: Awaited<ReturnType<typeof handleWebhookBooking>>['master']): MasterEventRecord | null {
  if (!master) return null
  return {
    id: master.id,
    title: master.title,
    capacity: master.capacity,
    sold: master.sold,
    channels: master.channels,
    attendees: master.attendees,
    createdAt: master.createdAt,
    updatedAt: master.updatedAt,
  }
}

export async function handleBookingWebhook(
  sourceChannel: ChannelKey,
  channelEventId: string,
  attendee: { email: string; name: string; registeredAt?: string; externalId?: string },
): Promise<{
  master: MasterEventRecord | null
  synced: { channel: ChannelKey; ok: boolean; error?: string }[]
  bookingSaved?: boolean
}> {
  const { master, bookingSaved } = await handleWebhookBooking({
    sourceChannel,
    channelEventId,
    email: attendee.email,
    name: attendee.name,
    registeredAt: attendee.registeredAt,
    externalId: attendee.externalId,
  })

  const record = toMasterRecord(master)
  if (!record) return { master: null, synced: [], bookingSaved: false }

  const synced = await syncCapacityAcrossChannels(record, sourceChannel)
  return { master: record, synced, bookingSaved }
}
