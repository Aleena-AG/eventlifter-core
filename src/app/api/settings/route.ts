import { NextRequest, NextResponse } from 'next/server'
import {
  loadSettings,
  mergeSettingsPatch,
  saveSettings,
  toPublicSettingsView,
  type AppSettings,
} from '@/lib/settings-store'

export { loadSettings, saveSettings } from '@/lib/settings-store'

export async function GET() {
  try {
    return NextResponse.json(toPublicSettingsView(loadSettings()))
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
