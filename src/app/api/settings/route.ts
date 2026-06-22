import { NextRequest, NextResponse } from 'next/server'
import { htDataToAppSettings } from '@/lib/channel-settings-shared'
import { fetchHtChannelSettings } from '@/lib/ht-channel-settings'
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
    let settings = loadSettings()
    const auth = req.headers.get('authorization')?.trim()
    if (auth) {
      try {
        const ht = await fetchHtChannelSettings(auth, false)
        settings = mergeSettingsPatch(settings, htDataToAppSettings(ht))
        saveSettings(settings)
      } catch (e) {
        console.warn('[settings GET] HighTribe channel sync failed:', e instanceof Error ? e.message : e)
      }
    }
    return NextResponse.json(toPublicSettingsView(settings))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load settings'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** Local cache only (webhook secret). Luma/Eventbrite keys live on HighTribe API. */
export async function PUT(req: NextRequest) {
  try {
    const localOnly = req.nextUrl.searchParams.get('localOnly') === '1'
    const patch = await req.json() as Partial<AppSettings>
    let updated = mergeSettingsPatch(loadSettings(), patch)

    if (!localOnly) {
      const auth = req.headers.get('authorization')?.trim()
      if (patch.luma || patch.eventbrite) {
        if (!auth) {
          return NextResponse.json(
            { error: 'Use HighTribe channel-integrations API for Luma/Eventbrite keys' },
            { status: 400 },
          )
        }
      }
    }

    saveSettings(updated)
    return NextResponse.json(toPublicSettingsView(updated))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to save settings'
    console.error('[settings PUT]', msg, e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
