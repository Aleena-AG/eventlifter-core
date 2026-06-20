import fs from 'fs'
import path from 'path'
import { getDb } from '@/lib/db/index'

export interface AppSettings {
  eventbrite: {
    clientId: string
    clientSecret: string
    redirectUri: string
    privateToken: string
    publicToken: string
  }
  luma: {
    apiKey: string
    calendarId: string
    apiBaseUrl: string
    discoverBaseUrl: string
  }
  hightribe: {
    serviceUrl: string
    apiKey: string
    webhookSecret: string
  }
}

export const DEFAULT_SETTINGS: AppSettings = {
  eventbrite: {
    clientId: '',
    clientSecret: '',
    redirectUri: 'http://localhost:3000/api/eventbrite/callback',
    privateToken: '',
    publicToken: '',
  },
  luma: {
    apiKey: '',
    calendarId: '',
    apiBaseUrl: 'https://public-api.luma.com',
    discoverBaseUrl: 'https://api.lu.ma',
  },
  hightribe: {
    serviceUrl: '',
    apiKey: '',
    webhookSecret: '',
  },
}

const LEGACY_FILE = path.join(process.cwd(), 'settings.json')

function mergeSettings(raw: Partial<AppSettings>): AppSettings {
  return {
    eventbrite: { ...DEFAULT_SETTINGS.eventbrite, ...raw.eventbrite },
    luma: { ...DEFAULT_SETTINGS.luma, ...raw.luma },
    hightribe: { ...DEFAULT_SETTINGS.hightribe, ...raw.hightribe },
  }
}

function migrateLegacyJsonFile() {
  const db = getDb()
  const row = db.prepare('SELECT 1 FROM app_settings WHERE id = 1').get()
  if (row) return

  if (fs.existsSync(LEGACY_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(LEGACY_FILE, 'utf8')) as Partial<AppSettings>
      saveAppSettings(mergeSettings(raw))
      return
    } catch {
      // fall through to defaults
    }
  }

  saveAppSettings({ ...DEFAULT_SETTINGS })
}

export function loadAppSettings(): AppSettings {
  migrateLegacyJsonFile()
  const row = getDb().prepare('SELECT data FROM app_settings WHERE id = 1').get() as { data: string } | undefined
  if (!row) return { ...DEFAULT_SETTINGS }
  try {
    return mergeSettings(JSON.parse(row.data) as Partial<AppSettings>)
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveAppSettings(settings: AppSettings): void {
  const db = getDb()
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO app_settings (id, data, updated_at)
    VALUES (1, @data, @updated_at)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).run({
    data: JSON.stringify(settings, null, 2),
    updated_at: now,
  })
}

export function applySettingsPatch(
  current: AppSettings,
  patch: Partial<AppSettings> & {
    eventbrite?: Partial<AppSettings['eventbrite']>
    luma?: Partial<AppSettings['luma']>
    hightribe?: Partial<AppSettings['hightribe']>
  },
): AppSettings {
  const updated: AppSettings = {
    eventbrite: { ...current.eventbrite, ...(patch.eventbrite || {}) },
    luma: { ...current.luma, ...(patch.luma || {}) },
    hightribe: { ...current.hightribe, ...(patch.hightribe || {}) },
  }

  if (patch.eventbrite?.clientSecret?.includes('*'))
    updated.eventbrite.clientSecret = current.eventbrite.clientSecret
  if (patch.eventbrite?.privateToken?.includes('*'))
    updated.eventbrite.privateToken = current.eventbrite.privateToken
  if (patch.eventbrite?.publicToken?.includes('*'))
    updated.eventbrite.publicToken = current.eventbrite.publicToken
  if (patch.luma?.apiKey?.includes('*')) updated.luma.apiKey = current.luma.apiKey
  if (patch.hightribe?.apiKey?.includes('*')) updated.hightribe.apiKey = current.hightribe.apiKey
  if (patch.hightribe?.webhookSecret?.includes('*'))
    updated.hightribe.webhookSecret = current.hightribe.webhookSecret

  return updated
}
