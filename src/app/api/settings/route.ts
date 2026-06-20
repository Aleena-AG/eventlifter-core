import { NextRequest, NextResponse } from 'next/server'
import {
  loadSettings,
  mergeSettingsPatch,
  saveSettings,
  toPublicSettingsView,
  type AppSettings,
} from '@/lib/settings-store'

export { loadSettings, saveSettings } from '@/lib/settings-store'

export function GET() {
  try {
    return NextResponse.json(toPublicSettingsView(loadSettings()))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load settings'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const patch = await req.json() as Partial<AppSettings>
    const updated = mergeSettingsPatch(loadSettings(), patch)
    saveSettings(updated)
    return NextResponse.json(toPublicSettingsView(updated))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to save settings'
    console.error('[settings PUT]', msg, e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
