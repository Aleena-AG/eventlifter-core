import { NextRequest, NextResponse } from 'next/server'
import {
  appSettingsToHtPatch,
  fetchHtChannelSettings,
  htDataToAppSettings,
  saveHtChannelSettings,
} from '@/lib/ht-channel-settings'
import {
  loadSettings,
  mergeSettingsPatch,
  saveSettings,
  toPublicSettingsView,
  type AppSettings,
} from '@/lib/settings-store'

export { loadSettings, saveSettings } from '@/lib/settings-store'

export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization')?.trim()
    let settings = loadSettings()

    if (auth) {
      try {
        const ht = await fetchHtChannelSettings(auth, true)
        settings = mergeSettingsPatch(settings, htDataToAppSettings(ht))
      } catch (e) {
        console.warn('[settings GET] HighTribe channel settings fetch failed:', e)
      }
    }

    return NextResponse.json(toPublicSettingsView(settings))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load settings'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization')?.trim()
    const patch = await req.json() as Partial<AppSettings>
    let updated = loadSettings()

    if (patch.hightribe) {
      updated = mergeSettingsPatch(updated, { hightribe: patch.hightribe })
    }

    const hasChannelPatch = !!(patch.luma || patch.eventbrite)
    if (hasChannelPatch) {
      if (!auth) {
        return NextResponse.json(
          { error: 'Login to HighTribe to save Luma/Eventbrite settings' },
          { status: 401 },
        )
      }

      const channelPatch: Partial<AppSettings> = {}
      if (patch.luma) channelPatch.luma = patch.luma
      if (patch.eventbrite) channelPatch.eventbrite = patch.eventbrite

      const htSaved = await saveHtChannelSettings(auth, appSettingsToHtPatch(channelPatch))
      updated = mergeSettingsPatch(updated, htDataToAppSettings(htSaved))
    }

    saveSettings(updated)
    return NextResponse.json(toPublicSettingsView(updated))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to save settings'
    console.error('[settings PUT]', msg, e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
