import { channelFetch } from '@/lib/channel-fetch'

/** Parse comma-separated tags from the wizard field. */
export function parseTagsInput(raw: unknown): string[] {
  return coerceTagList(raw)
}

export function formatTagsInput(tags: string[] | undefined): string {
  if (!tags?.length) return ''
  return tags.join(', ')
}

/** Normalize any tags / highlights payload into a clean string list. */
export function coerceTagList(raw: unknown): string[] {
  if (raw == null || raw === '') return []
  if (typeof raw === 'string') {
    return raw
      .split(/[,|]/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  if (!Array.isArray(raw)) return []
  const names: string[] = []
  for (const item of raw) {
    if (typeof item === 'string' && item.trim()) {
      names.push(item.trim())
      continue
    }
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>
      const name = String(
        o.name || o.label || o.title || o.text || o.highlight || o.value || o.tag || '',
      ).trim()
      if (name) names.push(name)
    }
  }
  return names
}

export function extractLumaTags(source: Record<string, unknown>): string[] {
  const candidates = [
    source._tags,
    source.tags,
    source.event_tags,
    source.tag_list,
    source.calendar_event_tags,
  ]
  for (const c of candidates) {
    const list = coerceTagList(c)
    if (list.length) return list
  }
  return []
}

export function extractHightribeTags(e: Record<string, unknown>, raw: Record<string, unknown>): string[] {
  const nested = (e.data && typeof e.data === 'object')
    ? (e.data as Record<string, unknown>)
    : null
  const candidates = [
    e._tags, raw._tags,
    e.tags, raw.tags, nested?.tags,
    e.highlights, raw.highlights, nested?.highlights,
    e.event_highlights, raw.event_highlights,
  ]
  for (const c of candidates) {
    const list = coerceTagList(c)
    if (list.length) return list
  }
  return []
}

async function postLumaTagPath(path: string, body: Record<string, unknown>): Promise<boolean> {
  const attempts = [
    `/api/luma/calendars/event-tags/${path}`,
    `/api/luma/calendar/event-tags/${path}`,
  ]
  for (const url of attempts) {
    try {
      const res = await channelFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) return true
    } catch {
      // try legacy path
    }
  }
  return false
}

/** Apply Luma calendar event tags after create/update (tags are not on the event body). */
export async function syncLumaEventTags(eventId: string, tagNames: string[]): Promise<void> {
  const id = String(eventId || '').trim()
  if (!id || !tagNames.length) return

  for (const tag of tagNames) {
    const name = tag.trim()
    if (!name) continue
    await postLumaTagPath('apply', { tag: name, event_ids: [id] })
  }
}

/** Best-effort load of Luma tags for an event (API shapes vary). */
export async function fetchLumaEventTags(eventId: string | number): Promise<string[]> {
  const id = String(eventId || '').trim()
  if (!id) return []
  const attempts = [
    `/api/luma/calendars/event-tags/list?event_api_id=${encodeURIComponent(id)}`,
    `/api/luma/calendars/event-tags/list?event_id=${encodeURIComponent(id)}`,
    `/api/luma/calendar/event-tags/list?event_api_id=${encodeURIComponent(id)}`,
  ]
  for (const url of attempts) {
    try {
      const res = await channelFetch(url)
      if (!res.ok) continue
      const data = await res.json() as Record<string, unknown>
      for (const candidate of [data.tags, data.event_tags, data.entries, data.data]) {
        const list = coerceTagList(candidate)
        if (list.length) return list
      }
      if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
        const d = data.data as Record<string, unknown>
        for (const candidate of [d.tags, d.event_tags, d.entries]) {
          const list = coerceTagList(candidate)
          if (list.length) return list
        }
      }
    } catch {
      // try next
    }
  }
  return []
}
