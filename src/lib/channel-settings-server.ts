import { backendJson } from '@/lib/backend-client'
import {
  isMaskedSecret,
  loadSettings,
  type AppSettings,
} from '@/lib/settings-store'
import {
  settingsPayloadToAppPartial,
  unwrapSettingsResponse,
} from '@/lib/settings-response'

export class SessionRequiredError extends Error {
  constructor(message = 'Session expired. Sign in again.') {
    super(message)
    this.name = 'SessionRequiredError'
  }
}

function mergeFullSettings(payload: ReturnType<typeof settingsPayloadToAppPartial>): AppSettings {
  const fallback = loadSettings()
  return {
    eventbrite: { ...fallback.eventbrite, ...(payload.eventbrite || {}) },
    luma: { ...fallback.luma, ...(payload.luma || {}) },
    hightribe: { ...fallback.hightribe, ...(payload.hightribe || {}) },
  }
}

function sanitizeSecrets(settings: AppSettings): AppSettings {
  const out: AppSettings = {
    eventbrite: { ...settings.eventbrite },
    luma: { ...settings.luma },
    hightribe: { ...settings.hightribe },
  }
  if (isMaskedSecret(out.luma.apiKey)) out.luma.apiKey = ''
  if (isMaskedSecret(out.eventbrite.privateToken)) out.eventbrite.privateToken = ''
  if (isMaskedSecret(out.eventbrite.clientSecret)) out.eventbrite.clientSecret = ''
  if (isMaskedSecret(out.hightribe.apiKey)) out.hightribe.apiKey = ''
  return out
}

/** Resolve channel keys for API proxies — per-user settings from remote API when authenticated. */
export async function resolveAppSettings(authorization?: string | null): Promise<AppSettings> {
  const auth = authorization?.trim()
  if (!auth) {
    // No session: local/dev file settings only (never shared across users).
    return loadSettings()
  }

  try {
    const raw = await backendJson<unknown>('settings?full=1', {
      headers: { Authorization: auth },
    })
    const payload = unwrapSettingsResponse(raw)
    // Authenticated users only use their own stored keys — no env / settings.json fallback.
    return sanitizeSecrets(mergeFullSettings(settingsPayloadToAppPartial(payload)))
  } catch (e) {
    console.warn('[resolveAppSettings] remote settings load failed:', e instanceof Error ? e.message : e)
    throw new SessionRequiredError()
  }
}
