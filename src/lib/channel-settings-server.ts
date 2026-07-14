import { backendJson } from '@/lib/backend-client'
import {
  applyEnvOverrides,
  isMaskedSecret,
  loadFromEnv,
  loadSettings,
  type AppSettings,
} from '@/lib/settings-store'

export class SessionRequiredError extends Error {
  constructor(message = 'Session expired. Sign in again.') {
    super(message)
    this.name = 'SessionRequiredError'
  }
}

function withEnvOverrides(settings: AppSettings): AppSettings {
  return applyEnvOverrides(settings, loadFromEnv())
}

function sanitizeSecrets(settings: AppSettings): AppSettings {
  const out: AppSettings = {
    eventbrite: { ...settings.eventbrite },
    luma: { ...settings.luma },
    hightribe: { ...settings.hightribe },
  }
  if (isMaskedSecret(out.luma.apiKey)) out.luma.apiKey = ''
  return out
}

/** Resolve channel keys for API proxies — per-user settings from remote API when authenticated. */
export async function resolveAppSettings(authorization?: string | null): Promise<AppSettings> {
  const fallback = loadSettings()
  const auth = authorization?.trim()
  if (!auth) return fallback

  try {
    const settings = await backendJson<AppSettings>('settings?full=1', {
      headers: { Authorization: auth },
    })
    const userSettings = withEnvOverrides(sanitizeSecrets(settings))
    if (!userSettings.luma.apiKey?.trim() && fallback.luma.apiKey?.trim()) {
      userSettings.luma.apiKey = fallback.luma.apiKey
      if (!userSettings.luma.calendarId) userSettings.luma.calendarId = fallback.luma.calendarId
    }
    return userSettings
  } catch (e) {
    console.warn('[resolveAppSettings] remote settings load failed:', e instanceof Error ? e.message : e)
    throw new SessionRequiredError()
  }
}
