import { NextRequest, NextResponse } from 'next/server'
import {
  loadSettings,
  mergeSettingsPatch,
  saveSettings,
  toPublicSettingsView,
  type AppSettings,
} from '@/lib/settings-store'
import type { AppSettings as DbAppSettings } from '../../../../backend/src/types/settings'
import {
  clearChannelSettings,
  getUserSettings,
  toPublicSettingsView as toDbPublicSettingsView,
  updateUserSettings,
} from '../../../../backend/src/services/user-settings'
import { assertEwentcastSubscription, isErrorResponse, requireSession } from '@/lib/server/session'

export { loadSettings, saveSettings } from '@/lib/settings-store'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const session = await requireSession(req)
  if (!isErrorResponse(session)) {
    const denied = await assertEwentcastSubscription(session.user.id)
    if (denied) return denied
    try {
      const full = req.nextUrl.searchParams.get('full') === '1'
      const settings = await getUserSettings(session.user.id)
      return NextResponse.json(full ? settings : toDbPublicSettingsView(settings))
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'load failed' },
        { status: 500 },
      )
    }
  }

  try {
    const settings = loadSettings()
    return NextResponse.json(toPublicSettingsView(settings))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load settings'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const patch = await req.json() as Partial<AppSettings>
  const session = await requireSession(req)

  if (!isErrorResponse(session)) {
    const denied = await assertEwentcastSubscription(session.user.id)
    if (denied) return denied
    try {
      const updated = await updateUserSettings(session.user.id, patch as Partial<DbAppSettings>)
      return NextResponse.json(toDbPublicSettingsView(updated))
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'save failed' },
        { status: 500 },
      )
    }
  }

  try {
    const updated = mergeSettingsPatch(loadSettings(), patch)
    saveSettings(updated)
    return NextResponse.json(toPublicSettingsView(updated))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to save settings'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
