import type { RowDataPacket } from 'mysql2'
import { config, useDatabase } from '../config'
import { getPool, query } from '../db/pool'
import { localGetUserSettings, localSetUserSettings } from '../db/local-store'
import type { AppSettings, ChannelSettingsKey } from '../types/settings'

function defaultRedirectUri(): string {
  const base = config.appUrl
  return `${base}/api/eventbrite/callback`
}

export function defaultSettings(): AppSettings {
  return {
    eventbrite: {
      clientId: '',
      clientSecret: '',
      redirectUri: defaultRedirectUri(),
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
}

function isMaskedSecret(s: string): boolean {
  return !!s && s.includes('*')
}

function normalizeLumaStored(luma: Record<string, unknown> | undefined): AppSettings['luma'] | undefined {
  if (!luma) return undefined
  let apiKey = String(luma.apiKey ?? luma.api_key ?? '').trim()
  if (isMaskedSecret(apiKey)) apiKey = ''
  return {
    apiKey,
    calendarId: String(luma.calendarId ?? luma.calendar_id ?? ''),
    apiBaseUrl: String(luma.apiBaseUrl ?? luma.api_base_url ?? '') || 'https://public-api.luma.com',
    discoverBaseUrl: String(luma.discoverBaseUrl ?? luma.discover_base_url ?? '') || 'https://api.lu.ma',
  }
}

function normalizeStored(stored: Partial<AppSettings> | null): Partial<AppSettings> | null {
  if (!stored) return null
  const raw = stored as Partial<AppSettings> & { luma?: Record<string, unknown> }
  const luma = normalizeLumaStored(raw.luma)
  return luma ? { ...stored, luma } : stored
}

function mergeSettings(base: AppSettings, patch?: Partial<AppSettings> | null): AppSettings {
  if (!patch) return base
  return {
    eventbrite: { ...base.eventbrite, ...(patch.eventbrite || {}) },
    luma: { ...base.luma, ...(patch.luma || {}) },
    hightribe: { ...base.hightribe, ...(patch.hightribe || {}) },
  }
}

function mergePatch(current: AppSettings, patch: Partial<AppSettings>): AppSettings {
  const updated = mergeSettings(current, patch)
  if (patch.eventbrite?.clientSecret?.includes('*'))
    updated.eventbrite.clientSecret = current.eventbrite.clientSecret
  if (patch.eventbrite?.privateToken?.includes('*'))
    updated.eventbrite.privateToken = current.eventbrite.privateToken
  if (patch.eventbrite?.publicToken?.includes('*'))
    updated.eventbrite.publicToken = current.eventbrite.publicToken
  if (patch.luma?.apiKey?.includes('*')) {
    if (!current.luma.apiKey) {
      throw new Error('Enter your full Luma API key — paste it from lu.ma/settings, not the masked display value')
    }
    updated.luma.apiKey = current.luma.apiKey
  }
  if (patch.hightribe?.apiKey?.includes('*')) updated.hightribe.apiKey = current.hightribe.apiKey
  if (patch.hightribe?.webhookSecret?.includes('*'))
    updated.hightribe.webhookSecret = current.hightribe.webhookSecret
  return updated
}

function maskSecret(s: string): string {
  return s ? `${s.slice(0, 4)}${'*'.repeat(Math.max(0, s.length - 4))}` : ''
}

export function toPublicSettingsView(d: AppSettings) {
  return {
    eventbrite: {
      clientId: d.eventbrite.clientId,
      clientSecret: maskSecret(d.eventbrite.clientSecret),
      redirectUri: d.eventbrite.redirectUri,
      privateToken: maskSecret(d.eventbrite.privateToken),
      publicToken: maskSecret(d.eventbrite.publicToken),
      configured: !!d.eventbrite.privateToken,
      oauthConfigured: !!(d.eventbrite.clientId && d.eventbrite.clientSecret),
      hasPrivateToken: !!d.eventbrite.privateToken,
    },
    luma: {
      apiKey: maskSecret(d.luma.apiKey),
      calendarId: d.luma.calendarId,
      apiBaseUrl: d.luma.apiBaseUrl,
      discoverBaseUrl: d.luma.discoverBaseUrl,
      configured: !!d.luma.apiKey && !isMaskedSecret(d.luma.apiKey),
    },
    hightribe: {
      serviceUrl: d.hightribe.serviceUrl,
      webhookSecret: maskSecret(d.hightribe.webhookSecret),
      configured: !!d.hightribe.serviceUrl,
      hasWebhookSecret: !!d.hightribe.webhookSecret,
    },
  }
}

async function readStored(userId: number): Promise<Partial<AppSettings> | null> {
  const rows = await query<RowDataPacket[]>(
    'SELECT settings_json FROM user_settings WHERE user_id = ? LIMIT 1',
    [userId],
  )
  const raw = rows[0]?.settings_json
  if (!raw) return null
  let parsed: Partial<AppSettings> | null = null
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw) as Partial<AppSettings> } catch { return null }
  } else {
    parsed = raw as Partial<AppSettings>
  }
  return normalizeStored(parsed)
}

export async function getUserSettings(userId: number): Promise<AppSettings> {
  if (!useDatabase()) {
    const stored = localGetUserSettings(userId)
    return mergeSettings(defaultSettings(), stored)
  }
  const stored = await readStored(userId)
  return mergeSettings(defaultSettings(), stored)
}

export async function updateUserSettings(
  userId: number,
  patch: Partial<AppSettings>,
): Promise<AppSettings> {
  const current = await getUserSettings(userId)
  const updated = mergePatch(current, patch)

  if (!useDatabase()) {
    localSetUserSettings(userId, updated)
    return updated
  }

  const now = new Date()

  await getPool().query(
    `INSERT INTO user_settings (user_id, settings_json, updated_at)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE settings_json = VALUES(settings_json), updated_at = VALUES(updated_at)`,
    [userId, JSON.stringify(updated), now],
  )

  return updated
}

export async function clearChannelSettings(
  userId: number,
  channel: ChannelSettingsKey,
): Promise<AppSettings> {
  const empty = defaultSettings()
  if (channel === 'luma') return updateUserSettings(userId, { luma: empty.luma })
  if (channel === 'eventbrite') return updateUserSettings(userId, { eventbrite: empty.eventbrite })
  return updateUserSettings(userId, { hightribe: empty.hightribe })
}
