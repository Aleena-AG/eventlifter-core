import { Router } from 'express'
import type { AuthedRequest } from '../middleware/auth.js'
import { requireAuth } from '../middleware/auth.js'
import {
  deleteChannelEvent,
  listChannelEvents,
  upsertChannelEvents,
  type ChannelName,
} from '../services/events.js'
import { listChannelBookings, listAllUserBookings, upsertChannelBookings } from '../services/bookings.js'
import { purgeChannelData } from '../services/channel-data.js'

export const eventsRouter = Router()

function parseChannel(raw: string): ChannelName | null {
  if (raw === 'luma' || raw === 'eventbrite' || raw === 'hightribe') return raw
  return null
}

eventsRouter.get('/bookings', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const bookings = await listAllUserBookings(req.user!.id)
    return res.json({ bookings })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'list failed' })
  }
})

eventsRouter.get('/:channel', requireAuth, async (req: AuthedRequest, res) => {
  const channel = parseChannel(req.params.channel)
  if (!channel) return res.status(400).json({ error: 'invalid channel' })
  try {
    const events = await listChannelEvents(channel, req.user!.id)
    return res.json({ events })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'list failed' })
  }
})

eventsRouter.post('/:channel/sync', requireAuth, async (req: AuthedRequest, res) => {
  const channel = parseChannel(req.params.channel)
  if (!channel) return res.status(400).json({ error: 'invalid channel' })
  const body = req.body as { events?: Array<Record<string, unknown>> }
  if (!Array.isArray(body.events)) {
    return res.status(400).json({ error: 'events array required' })
  }
  try {
    const result = await upsertChannelEvents(channel, req.user!.id, body.events)
    const events = await listChannelEvents(channel, req.user!.id)
    return res.json({ ...result, events })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'sync failed' })
  }
})

eventsRouter.post('/:channel/sync-bookings', requireAuth, async (req: AuthedRequest, res) => {
  const channel = parseChannel(req.params.channel)
  if (!channel) return res.status(400).json({ error: 'invalid channel' })
  const body = req.body as { bookings?: Array<Record<string, unknown>> }
  if (!Array.isArray(body.bookings)) {
    return res.status(400).json({ error: 'bookings array required' })
  }
  try {
    const result = await upsertChannelBookings(channel, req.user!.id, body.bookings)
    const bookings = await listChannelBookings(channel, req.user!.id)
    return res.json({ ...result, bookings })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'booking sync failed' })
  }
})

eventsRouter.delete('/:channel', requireAuth, async (req: AuthedRequest, res) => {
  const channel = parseChannel(req.params.channel)
  if (!channel) return res.status(400).json({ error: 'invalid channel' })
  try {
    const result = await purgeChannelData(req.user!.id, channel)
    return res.json({ ok: true, ...result })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'purge failed' })
  }
})

eventsRouter.delete('/:channel/:externalId', requireAuth, async (req: AuthedRequest, res) => {
  const channel = parseChannel(req.params.channel)
  if (!channel) return res.status(400).json({ error: 'invalid channel' })
  try {
    const ok = await deleteChannelEvent(channel, req.user!.id, req.params.externalId)
    return res.json({ ok })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'delete failed' })
  }
})
