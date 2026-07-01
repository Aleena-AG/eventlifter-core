import { NextRequest, NextResponse } from 'next/server'
import { backendFetch } from '@/lib/backend-client'
import {
  loadSettings,
  mergeSettingsPatch,
  saveSettings,
  toPublicSettingsView,
  type AppSettings,
} from '@/lib/settings-store'

export { loadSettings, saveSettings } from '@/lib/settings-store'

async function proxyToBackend(req: NextRequest, init?: RequestInit): Promise<NextResponse> {
  const auth = req.headers.get('authorization')
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const qs = url.search
  const path = `/api/settings${qs}`

  try {
    const res = await backendFetch(path, {
      ...init,
      method: init?.method || req.method,
      headers: {
        Authorization: auth,
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers as Record<string, string> | undefined),
      },
      body: init?.body,
    })

    const text = await res.text()
    let data: unknown = {}
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      data = { error: text.slice(0, 200) || `HTTP ${res.status}` }
    }
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Backend unavailable' },
      { status: 503 },
    )
  }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')?.trim()
  if (auth) return proxyToBackend(req)

  try {
    const settings = loadSettings()
    return NextResponse.json(toPublicSettingsView(settings))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load settings'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** Per-user settings in MySQL when logged in; file cache only without auth. */
export async function PUT(req: NextRequest) {
  const auth = req.headers.get('authorization')?.trim()
  const patch = await req.json() as Partial<AppSettings>

  if (auth) {
    return proxyToBackend(req, {
      method: 'PUT',
      body: JSON.stringify(patch),
    })
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
