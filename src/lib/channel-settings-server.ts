import { backendFetch } from '@/lib/backend-client'
import { loadSettings, type AppSettings } from '@/lib/settings-store'

/** Resolve channel keys for API proxies — per-user MySQL when authenticated. */
export async function resolveAppSettings(authorization?: string | null): Promise<AppSettings> {
  const auth = authorization?.trim()
  if (auth) {
    try {
      const res = await backendFetch('/api/settings?full=1', {
        headers: { Authorization: auth },
      })
      if (res.ok) {
        return await res.json() as AppSettings
      }
    } catch (e) {
      console.warn('[resolveAppSettings] user settings load failed:', e instanceof Error ? e.message : e)
    }
  }

  return loadSettings()
}
