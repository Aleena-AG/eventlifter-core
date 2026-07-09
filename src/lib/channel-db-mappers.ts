import type { HtEventListItem } from '@/lib/hightribe-events'
import type { StoredChannelEvent } from '@/lib/channel-events-store'

export interface DbLumaEvent {
  api_id: string
  name: string
  start_at: string
  end_at: string
  timezone: string
  url?: string
  cover_url?: string
  geo_address_json?: { full_address?: string; city?: string }
  meeting_url?: string
}

export interface DbEbEvent {
  id: string
  name?: { text?: string }
  start?: { utc?: string }
  end?: { utc?: string }
  url?: string
  logo?: { original?: { url?: string } }
  is_free?: boolean
  status?: string
}

export function storedToHtEvent(row: StoredChannelEvent): HtEventListItem {
  const p = row.payload as HtEventListItem & Record<string, unknown>
  const dates = p.dates || {}
  if (row.start_at && !dates.starts_at) {
    dates.starts_at = row.start_at
  }
  const publishStatus = String(
    p.publish_status || row.status || p.status || '',
  ).trim() || undefined
  return {
    ...p,
    id: row.external_id,
    title: row.title || p.title,
    cover_image: row.cover_url || p.cover_image,
    status: publishStatus,
    publish_status: publishStatus,
    is_public: typeof p.is_public === 'boolean' ? p.is_public : undefined,
    dates,
    share_url: row.url || p.share_url,
  }
}

export function storedToLumaEvent(row: StoredChannelEvent): DbLumaEvent {
  const p = row.payload as Record<string, unknown>
  const event = (p.event as Record<string, unknown>) || p
  const geo = event.geo_address_json || p.geo_address_json
  return {
    api_id: row.external_id,
    name: row.title || String(event.name || p.name || ''),
    start_at: row.start_at || String(event.start_at || p.start_at || ''),
    end_at: row.end_at || String(event.end_at || p.end_at || ''),
    timezone: row.timezone || String(event.timezone || p.timezone || 'UTC'),
    url: row.url || String(event.url || p.url || '') || undefined,
    cover_url: row.cover_url || String(event.cover_url || p.cover_url || '') || undefined,
    geo_address_json: geo as DbLumaEvent['geo_address_json'],
    meeting_url: String(event.meeting_url || p.meeting_url || '') || undefined,
  }
}

export function storedToEbEvent(row: StoredChannelEvent): DbEbEvent {
  const p = row.payload as DbEbEvent
  return {
    ...p,
    id: row.external_id,
    name: p.name || { text: row.title },
    start: p.start || (row.start_at ? { utc: row.start_at } : undefined),
    end: p.end || (row.end_at ? { utc: row.end_at } : undefined),
    url: row.url || p.url,
    logo: p.logo || (row.cover_url ? { original: { url: row.cover_url } } : undefined),
    status: row.status || p.status,
  }
}
