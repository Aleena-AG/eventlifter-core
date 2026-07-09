import { channelFetch } from '@/lib/channel-fetch'

/** Parse comma-separated tags from the wizard field. */
export function parseTagsInput(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v).trim()).filter(Boolean)
  }
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function formatTagsInput(tags: string[] | undefined): string {
  if (!tags?.length) return ''
  return tags.join(', ')
}

function tagNamesFromObjects(items: unknown): string[] {
  if (!Array.isArray(items)) return []
  const names: string[] = []
  for (const item of items) {
    if (typeof item === 'string' && item.trim()) {
      names.push(item.trim())
      continue
    }
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>
      const name = String(o.name || o.label || o.title || '').trim()
      if (name) names.push(name)
    }
  }
  return names
}

export function extractLumaTags(source: Record<string, unknown>): string[] {
  const fromTags = tagNamesFromObjects(source.tags)
  if (fromTags.length) return fromTags
  const fromEventTags = tagNamesFromObjects(source.event_tags)
  if (fromEventTags.length) return fromEventTags
  return tagNamesFromObjects(source.tag_list)
}

export function extractHightribeTags(e: Record<string, unknown>, raw: Record<string, unknown>): string[] {
  const fromTags = tagNamesFromObjects(e.tags ?? raw.tags)
  if (fromTags.length) return fromTags
  return tagNamesFromObjects(e.highlights ?? raw.highlights)
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
