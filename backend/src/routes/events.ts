import { Router } from 'express'
import type { AuthedRequest } from '../middleware/auth.js'
import { requireAuth } from '../middleware/auth.js'
import {
  deleteChannelEvent,
  listChannelEvents,
  upsertChannelEvents,
  type ChannelName,
} from '../services/events.js'

export const eventsRouter = Router()

function parseChannel(raw: string): ChannelName | null {
  if (raw === 'luma' || raw === 'eventbrite' || raw === 'hightribe') return raw
  return null
}

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
