import { getUserSettings } from '../../backend/src/services/user-settings'
import { loadSettings, type AppSettings } from '@/lib/settings-store'

/** Resolve channel keys for API proxies — per-user MySQL when authenticated. */
export async function resolveAppSettings(authorization?: string | null): Promise<AppSettings> {
  const auth = authorization?.trim()
  if (auth) {
    try {
      const { resolveSession } = await import('../../backend/src/services/auth')
      const user = await resolveSession(auth)
      if (user) {
        return await getUserSettings(user.id)
      }
    } catch (e) {
      console.warn('[resolveAppSettings] user settings load failed:', e instanceof Error ? e.message : e)
    }
  }

  return loadSettings()
}
