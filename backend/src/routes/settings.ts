import { Router } from 'express'
import type { AuthedRequest } from '../middleware/auth.js'
import { requireAuth } from '../middleware/auth.js'
import type { AppSettings } from '../types/settings.js'
import {
  clearChannelSettings,
  getUserSettings,
  toPublicSettingsView,
  updateUserSettings,
} from '../services/user-settings.js'

export const settingsRouter = Router()

settingsRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const full = req.query.full === '1'
    const settings = await getUserSettings(req.user!.id)
    return res.json(full ? settings : toPublicSettingsView(settings))
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'load failed' })
  }
})

settingsRouter.put('/', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const patch = req.body as Partial<AppSettings>
    const updated = await updateUserSettings(req.user!.id, patch)
    return res.json(toPublicSettingsView(updated))
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'save failed' })
  }
})

settingsRouter.delete('/:channel', requireAuth, async (req: AuthedRequest, res) => {
  const ch = req.params.channel
  if (ch !== 'luma' && ch !== 'eventbrite' && ch !== 'hightribe') {
    return res.status(400).json({ error: 'invalid channel' })
  }
  try {
    const updated = await clearChannelSettings(req.user!.id, ch)
    return res.json({ ok: true, settings: toPublicSettingsView(updated) })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'clear failed' })
  }
})
