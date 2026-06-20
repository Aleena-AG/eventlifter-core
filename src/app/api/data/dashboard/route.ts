import { NextRequest, NextResponse } from 'next/server'
import { loadSettings } from '@/app/api/settings/route'
import { buildDashboardFromDb } from '@/lib/server/build-dashboard'

export async function GET(req: NextRequest) {
  const settings = loadSettings()
  const htConfigured = !!req.headers.get('authorization')?.startsWith('Bearer ')
  const lumaConfigured = !!settings.luma.apiKey
  const ebConfigured = !!settings.eventbrite.privateToken

  const stats = buildDashboardFromDb({ htConfigured, lumaConfigured, ebConfigured })
  return NextResponse.json(stats)
}
