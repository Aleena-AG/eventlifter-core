import { NextRequest, NextResponse } from 'next/server'
import {
  applySettingsPatch,
  loadAppSettings,
  saveAppSettings,
  type AppSettings,
} from '@/lib/db/settings-store'

export type { AppSettings }

function mask(s: string) {
  return s ? `${s.slice(0, 4)}${'*'.repeat(Math.max(0, s.length - 4))}` : ''
}

export function loadSettings(): AppSettings {
  return loadAppSettings()
}

function toPublicView(d: AppSettings) {
  return {
    eventbrite: {
      clientId: d.eventbrite.clientId,
      clientSecret: mask(d.eventbrite.clientSecret),
      redirectUri: d.eventbrite.redirectUri,
      privateToken: mask(d.eventbrite.privateToken),
      publicToken: mask(d.eventbrite.publicToken),
      configured: !!(d.eventbrite.clientId && d.eventbrite.clientSecret),
      hasPrivateToken: !!d.eventbrite.privateToken,
    },
    luma: {
      apiKey: mask(d.luma.apiKey),
      calendarId: d.luma.calendarId,
      apiBaseUrl: d.luma.apiBaseUrl,
      discoverBaseUrl: d.luma.discoverBaseUrl,
      configured: !!d.luma.apiKey,
    },
    hightribe: {
      serviceUrl: d.hightribe.serviceUrl,
      webhookSecret: mask(d.hightribe.webhookSecret),
      configured: !!d.hightribe.serviceUrl,
      hasWebhookSecret: !!d.hightribe.webhookSecret,
    },
  }
}

export function GET() {
  try {
    return NextResponse.json(toPublicView(loadAppSettings()))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load settings'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const patch = await req.json()
    const current = loadAppSettings()
    const updated = applySettingsPatch(current, patch)
    saveAppSettings(updated)
    return NextResponse.json(toPublicView(updated))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to save settings'
    console.error('[settings PUT]', msg, e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
