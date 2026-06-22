import { htDataToAppSettings } from '@/lib/channel-settings-shared'
import { fetchHtChannelSettings } from '@/lib/ht-channel-settings'
import {
  loadSettings,
  mergeSettingsPatch,
  saveSettings,
  type AppSettings,
} from '@/lib/settings-store'

/** Resolve channel keys for this request — syncs from HighTribe when a Bearer token is present. */
export async function resolveAppSettings(authorization?: string | null): Promise<AppSettings> {
  let settings = loadSettings()
  const auth = authorization?.trim()
  if (!auth) return settings

  try {
    const ht = await fetchHtChannelSettings(auth, false)
    settings = mergeSettingsPatch(settings, htDataToAppSettings(ht))
    saveSettings(settings)
  } catch (e) {
    console.warn('[resolveAppSettings] HighTribe sync failed:', e instanceof Error ? e.message : e)
  }

  return settings
}
