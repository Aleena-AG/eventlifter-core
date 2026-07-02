import { Router } from 'express'
import type { ChannelKey } from '../types.js'
import {
  createMasterEvent,
  deleteMasterEvent,
  findMasterByChannelEvent,
  getMasterEvent,
  linkChannelEvent,
  listMasterEvents,
  registerAttendee,
  removeChannelFromMaster,
} from '../services/registry.js'

export const registryRouter = Router()

registryRouter.get('/', async (req, res) => {
  try {
    const channel = req.query.channel as ChannelKey | undefined
    const eventId = req.query.eventId as string | undefined

    if (channel && eventId) {
      const master = await findMasterByChannelEvent(channel, eventId)
      if (!master) {
        return res.json({ master: null, links: {} })
      }
      const links: Partial<Record<ChannelKey, { eventId: string; url?: string }>> = {}
      for (const ch of ['hightribe', 'luma', 'eventbrite'] as ChannelKey[]) {
        const ref = master.channels[ch]
        if (ref?.eventId) links[ch] = { eventId: ref.eventId, url: ref.url }
      }
      return res.json({ master: { id: master.id, title: master.title }, links })
    }

    const events = await listMasterEvents()
    return res.json({ events })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'registry list failed' })
  }
})

registryRouter.post('/', async (req, res) => {
  try {
    const body = req.body as {
      action?: string
      masterId?: string
      title?: string
      capacity?: number
      channel?: ChannelKey
      ref?: { eventId: string; ticketId?: string; url?: string }
    }

    if (body.action === 'create') {
      const master = await createMasterEvent({
        title: body.title || 'Untitled',
        capacity: body.capacity || 150,
      })
      return res.json(master)
    }

    if (body.action === 'link' && body.masterId && body.channel && body.ref) {
      const master = await linkChannelEvent(body.masterId, body.channel, body.ref)
      if (!master) return res.status(404).json({ error: 'not found' })
      return res.json(master)
    }

    if (body.action === 'register_attendee' && body.masterId && body.attendee) {
      const att = body.attendee as {
        email: string
        name: string
        source: ChannelKey
        registeredAt?: string
      }
      const master = await registerAttendee(body.masterId, att)
      if (!master) return res.status(404).json({ error: 'not found' })
      return res.json(master)
    }

    if (body.masterId) {
      const master = await getMasterEvent(body.masterId)
      if (!master) return res.status(404).json({ error: 'not found' })
      return res.json(master)
    }

    if (body.action === 'unlink' && body.masterId && body.channel) {
      const master = await removeChannelFromMaster(body.masterId, body.channel)
      return res.json({ ok: true, master })
    }

    if (body.action === 'delete' && body.masterId) {
      await deleteMasterEvent(body.masterId)
      return res.json({ ok: true })
    }

    return res.status(400).json({ error: 'invalid request' })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'registry write failed' })
  }
})
