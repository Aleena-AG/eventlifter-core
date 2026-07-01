import type { RowDataPacket } from 'mysql2'
import { config } from '../config.js'
import { getPool, query } from '../db/pool.js'
import type { AppSettings, ChannelSettingsKey } from '../types/settings.js'

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
  if (patch.luma?.apiKey?.includes('*')) updated.luma.apiKey = current.luma.apiKey
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
      configured: !!d.luma.apiKey,
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
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as Partial<AppSettings> } catch { return null }
  }
  return raw as Partial<AppSettings>
}

export async function getUserSettings(userId: number): Promise<AppSettings> {
  const stored = await readStored(userId)
  return mergeSettings(defaultSettings(), stored)
}

export async function updateUserSettings(
  userId: number,
  patch: Partial<AppSettings>,
): Promise<AppSettings> {
  const current = await getUserSettings(userId)
  const updated = mergePatch(current, patch)
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
