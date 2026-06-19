import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export interface AppSettings {
  eventbrite: {
    clientId: string
    clientSecret: string
    redirectUri: string
    privateToken: string
    publicToken: string
  }
  luma: {
    apiKey: string
    calendarId: string
    apiBaseUrl: string
    discoverBaseUrl: string
  }
  hightribe: {
    serviceUrl: string
    apiKey: string
  }
}

const FILE = path.join(process.cwd(), 'settings.json')

const DEFAULTS: AppSettings = {
  eventbrite: {
    clientId: '',
    clientSecret: '',
    redirectUri: 'http://localhost:3000/api/eventbrite/callback',
    privateToken: '',
    publicToken: '',
  },
  luma: {
    apiKey: '',
    calendarId: '',
    apiBaseUrl: 'https://public-api.luma.com',
    discoverBaseUrl: 'https://api.lu.ma',
  },
  hightribe: {
    serviceUrl: '',
    apiKey: '',
  },
}

function load(): AppSettings {
  try {
    if (fs.existsSync(FILE)) {
      const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'))
      return {
        eventbrite: { ...DEFAULTS.eventbrite, ...raw.eventbrite },
        luma: { ...DEFAULTS.luma, ...raw.luma },
        hightribe: { ...DEFAULTS.hightribe, ...raw.hightribe },
      }
    }
  } catch {
    // ignore errors, return defaults
  }
  return { ...DEFAULTS }
}

function mask(s: string) {
  return s ? `${s.slice(0, 4)}${'*'.repeat(Math.max(0, s.length - 4))}` : ''
}

export function loadSettings(): AppSettings {
  return load()
}

export function GET() {
  const d = load()
  return NextResponse.json({
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
      configured: !!d.hightribe.serviceUrl,
    },
  })
}

export async function PUT(req: NextRequest) {
  const patch = await req.json()
  const current = load()
  const updated: AppSettings = {
    eventbrite: { ...current.eventbrite, ...(patch.eventbrite || {}) },
    luma: { ...current.luma, ...(patch.luma || {}) },
    hightribe: { ...current.hightribe, ...(patch.hightribe || {}) },
  }
  // Don't overwrite secrets with masked values
  if (patch.eventbrite?.clientSecret?.includes('*'))
    updated.eventbrite.clientSecret = current.eventbrite.clientSecret
  if (patch.eventbrite?.privateToken?.includes('*'))
    updated.eventbrite.privateToken = current.eventbrite.privateToken
  if (patch.eventbrite?.publicToken?.includes('*'))
    updated.eventbrite.publicToken = current.eventbrite.publicToken
  if (patch.luma?.apiKey?.includes('*')) updated.luma.apiKey = current.luma.apiKey
  if (patch.hightribe?.apiKey?.includes('*')) updated.hightribe.apiKey = current.hightribe.apiKey
  fs.writeFileSync(FILE, JSON.stringify(updated, null, 2))
  // Return safe view
  return GET()
}
