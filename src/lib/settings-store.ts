import fs from 'fs'
import path from 'path'

import type { AppSettings } from '@/lib/settings-types'
import { eventbriteRedirectUri } from '@/lib/app-url'

export type { AppSettings }

const DEFAULTS: AppSettings = {
  eventbrite: {
    clientId: '',
    clientSecret: '',
    redirectUri: eventbriteRedirectUri(),
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

declare global {
  // eslint-disable-next-line no-var
  var __ewentcastSettings: AppSettings | undefined
}

function isServerlessDeploy(): boolean {
  return process.cwd() === '/var/task' || process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME != null
}

/** Writable path: local `settings.json`, or `/tmp` on Vercel/Lambda (read-only `/var/task`). */
export function getSettingsFilePath(): string {
  if (process.env.SETTINGS_FILE) return path.resolve(process.env.SETTINGS_FILE)
  if (isServerlessDeploy()) return '/tmp/ewentcast-settings.json'
  return path.join(process.cwd(), 'settings.json')
}

function legacySettingsPath(): string {
  return path.join(process.cwd(), 'settings.json')
}

function readJsonFile(file: string): Partial<AppSettings> | null {
  try {
    if (!fs.existsSync(file)) return null
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<AppSettings>
  } catch {
    return null
  }
}

export function loadFromEnv(): Partial<AppSettings> {
  const pick = (key: string) => process.env[key]?.trim() || ''
  return {
    eventbrite: {
      clientId: pick('EVENTBRITE_CLIENT_ID'),
      clientSecret: pick('EVENTBRITE_CLIENT_SECRET'),
      redirectUri: pick('EVENTBRITE_REDIRECT_URI'),
      privateToken: pick('EVENTBRITE_PRIVATE_TOKEN'),
      publicToken: pick('EVENTBRITE_PUBLIC_TOKEN'),
    },
    luma: {
      apiKey: pick('LUMA_API_KEY'),
      calendarId: pick('LUMA_CALENDAR_ID'),
      apiBaseUrl: pick('LUMA_API_BASE_URL'),
      discoverBaseUrl: pick('LUMA_DISCOVER_BASE_URL'),
    },
    hightribe: {
      serviceUrl: pick('Hightribe_SERVICE_URL') || pick('HT_API_BASE'),
      apiKey: pick('Hightribe_API_KEY'),
      webhookSecret: pick('Hightribe_WEBHOOK_SECRET') || pick('CHANNEL_MANAGER_WEBHOOK_SECRET'),
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

export function applyEnvOverrides(settings: AppSettings, env: Partial<AppSettings>): AppSettings {
  const out = { ...settings, eventbrite: { ...settings.eventbrite }, luma: { ...settings.luma }, hightribe: { ...settings.hightribe } }
  for (const [key, value] of Object.entries(env.eventbrite || {})) {
    if (value) (out.eventbrite as Record<string, string>)[key] = value
  }
  for (const [key, value] of Object.entries(env.luma || {})) {
    if (value) (out.luma as Record<string, string>)[key] = value
  }
  for (const [key, value] of Object.entries(env.hightribe || {})) {
    if (value) (out.hightribe as Record<string, string>)[key] = value
  }
  return out
}

export function loadSettings(): AppSettings {
  const file = getSettingsFilePath()
  const legacy = legacySettingsPath()
  let merged = mergeSettings({ ...DEFAULTS }, readJsonFile(file))
  if (legacy !== file) merged = mergeSettings(merged, readJsonFile(legacy))
  if (global.__ewentcastSettings) merged = mergeSettings(merged, global.__ewentcastSettings)
  return applyEnvOverrides(merged, loadFromEnv())
}

export function saveSettings(settings: AppSettings): void {
  global.__ewentcastSettings = settings
  const file = getSettingsFilePath()
  const dir = path.dirname(file)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const toSave: AppSettings = {
    eventbrite: { ...settings.eventbrite },
    luma: { ...settings.luma },
    hightribe: { ...settings.hightribe },
  }
  fs.writeFileSync(file, JSON.stringify(toSave, null, 2))
}

export function mergeSettingsPatch(current: AppSettings, patch: Partial<AppSettings>): AppSettings {
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

export function maskSecret(s: string): string {
  return s ? `${s.slice(0, 4)}${'*'.repeat(Math.max(0, s.length - 4))}` : ''
}

export function isMaskedSecret(s: string): boolean {
  return !!s && s.includes('*')
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
      apiKey: maskSecret(d.hightribe.apiKey),
      webhookSecret: maskSecret(d.hightribe.webhookSecret),
      configured: !!d.hightribe.apiKey,
      hasWebhookSecret: !!d.hightribe.webhookSecret,
      hasApiKey: !!d.hightribe.apiKey,
    },
  }
}
