import crypto from 'crypto'
import type { ChannelKey, MasterEventRecord } from '../types'
import { upsertWebhookBooking } from './bookings'
import type { ChannelName } from './events'
import { resolveUserIdFromChannelEvent } from './events'
import {
  findMasterContextByChannelEvent,
  getMasterEvent,
  registerAttendee,
} from './registry'

function webhookExternalId(channel: string, eventId: string, email: string): string {
  const hash = crypto
    .createHash('sha256')
    .update(`${channel}:${eventId}:${email.toLowerCase()}`)
    .digest('hex')
    .slice(0, 16)
  return `wh:${channel}:${eventId}:${hash}`.slice(0, 191)
}

/** Registry attendee + per-user channel_bookings row (real-time webhook path). */
export async function handleWebhookBooking(input: {
  sourceChannel: ChannelKey
  channelEventId: string
  email: string
  name: string
  registeredAt?: string
  externalId?: string
  status?: string
}): Promise<{ master: MasterEventRecord | null; bookingSaved: boolean }> {
  const ctx = await findMasterContextByChannelEvent(input.sourceChannel, input.channelEventId)
  if (!ctx) return { master: null, bookingSaved: false }

  const registeredAt = input.registeredAt || new Date().toISOString()
  await registerAttendee(ctx.masterId, {
    email: input.email,
    name: input.name,
    source: input.sourceChannel,
    registeredAt,
  })

  let userId = ctx.userId
  if (!userId) {
    userId = await resolveUserIdFromChannelEvent(
      input.sourceChannel as ChannelName,
      input.channelEventId,
    )
  }

  let bookingSaved = false
  if (userId) {
    bookingSaved = await upsertWebhookBooking({
      userId,
      channel: input.sourceChannel as ChannelName,
      externalId:
        input.externalId
        || webhookExternalId(input.sourceChannel, input.channelEventId, input.email),
      eventExternalId: input.channelEventId,
      eventTitle: ctx.title,
      guestName: input.name,
      guestEmail: input.email,
      registeredAt: new Date(registeredAt),
      status: input.status || 'confirmed',
    })
  }

  const master = await getMasterEvent(ctx.masterId)
  return { master, bookingSaved }
}
