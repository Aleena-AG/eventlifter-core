/** Hightribe public pages use /event/{slug} from the title — not /events/{id}. */

export function hightribeEventSlug(titleOrSlug: string): string {
  const slug = String(titleOrSlug || '')
    .trim()
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'event'
}

/**
 * Prefer an API-returned share URL when it already looks like /event/{slug}.
 * Otherwise build https://hightribe.com/event/{slug-from-title}.
 */
export function hightribeEventPublicUrl(opts: {
  title?: string
  slug?: string
  apiUrl?: string
}): string {
  const api = String(opts.apiUrl || '').trim()
  if (/hightribe\.com\/event\//i.test(api)) {
    return api.replace(/\/$/, '')
  }
  const slug = hightribeEventSlug(opts.slug || opts.title || '')
  return `https://hightribe.com/event/${slug}`
}
