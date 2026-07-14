import { NextRequest, NextResponse } from 'next/server'
import { proxyToBackend } from '@/lib/backend-client'
import {
  loadSettings,
  mergeSettingsPatch,
  saveSettings,
  toPublicSettingsView,
  type AppSettings,
} from '@/lib/settings-store'
import { assertEwentcastSubscription, isErrorResponse, requireSession } from '@/lib/server/session'

export { loadSettings, saveSettings } from '@/lib/settings-store'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const session = await requireSession(req)
  if (!isErrorResponse(session)) {
    const denied = await assertEwentcastSubscription(
      session.user.id,
      req.headers.get('authorization'),
    )
    if (denied) return denied
    return proxyToBackend(req, 'settings')
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
  const session = await requireSession(req)

  if (!isErrorResponse(session)) {
    const denied = await assertEwentcastSubscription(
      session.user.id,
      req.headers.get('authorization'),
    )
    if (denied) return denied
    return proxyToBackend(req, 'settings')
  }

  try {
    const patch = await req.json() as Partial<AppSettings>
    const updated = mergeSettingsPatch(loadSettings(), patch)
    saveSettings(updated)
    return NextResponse.json(toPublicSettingsView(updated))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to save settings'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
