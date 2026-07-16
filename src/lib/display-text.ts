/**
 * UI display helpers — Ewentcast always shows English / Latin script labels.
 * Arabic / Urdu / Persian script from Places or channel payloads is not shown.
 */

const ARABIC_SCRIPT_RE =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/

/** True when the string contains Arabic-script characters (incl. Urdu). */
export function hasArabicScript(text: string): boolean {
  return ARABIC_SCRIPT_RE.test(text)
}

function normKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Drop repeated comma segments (e.g. "Abu Dhabi, Abu Dhabi"). */
function dedupeCommaSegments(label: string): string {
  const segs = label.split(',').map((s) => s.trim()).filter(Boolean)
  const out: string[] = []
  const seen = new Set<string>()
  for (const s of segs) {
    const k = normKey(s)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(s)
  }
  return out.join(', ')
}

/**
 * Collapse a location that was accidentally joined 2–3 times
 * ("A, B, C, A, B, C" → "A, B, C").
 */
function collapseRepeatedBlock(label: string): string {
  const segs = label.split(',').map((s) => s.trim()).filter(Boolean)
  if (segs.length < 4) return label
  for (let block = Math.floor(segs.length / 2); block >= 2; block--) {
    if (segs.length % block !== 0) continue
    const repeats = segs.length / block
    if (repeats < 2) continue
    const first = segs.slice(0, block).map(normKey).join('|')
    let ok = true
    for (let r = 1; r < repeats; r++) {
      const chunk = segs.slice(r * block, (r + 1) * block).map(normKey).join('|')
      if (chunk !== first) {
        ok = false
        break
      }
    }
    if (ok) return segs.slice(0, block).join(', ')
  }
  return label
}

/** Drop Arabic-script segments from a comma-separated location label. */
export function sanitizeDisplayLocation(label?: string | null): string | undefined {
  if (!label?.trim()) return undefined
  const raw = label.trim()
  const withoutArabic = hasArabicScript(raw)
    ? raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((p) => !hasArabicScript(p))
        .join(', ')
    : raw
  if (!withoutArabic) return undefined
  return collapseRepeatedBlock(dedupeCommaSegments(withoutArabic))
}

/**
 * Join location parts for UI.
 * Skips Arabic script, exact duplicates, and parts already contained in a longer part.
 */
export function displayLocationLabel(
  ...parts: Array<string | null | undefined>
): string | undefined {
  const cleaned = parts
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .filter((p) => !hasArabicScript(p))

  if (!cleaned.length) return undefined

  const unique: string[] = []
  for (const part of cleaned) {
    const lower = normKey(part)
    if (unique.some((u) => normKey(u) === lower)) continue
    // Drop this part if a longer kept part already contains it.
    if (unique.some((u) => normKey(u).includes(lower) && u.length >= part.length)) continue
    // Drop shorter kept parts that this longer part contains.
    for (let i = unique.length - 1; i >= 0; i--) {
      const u = unique[i]
      if (lower.includes(normKey(u)) && part.length > u.length) unique.splice(i, 1)
    }
    unique.push(part)
  }

  if (!unique.length) return undefined
  return sanitizeDisplayLocation(unique.join(', '))
}

/** Build a clean street/city address line without repeating venue into address. */
export function buildPlaceAddressLine(ev: {
  venue?: unknown
  address?: unknown
  city?: unknown
  region?: unknown
  postal?: unknown
  country?: unknown
}): string {
  const venue = String(ev.venue || '').trim()
  const address = String(ev.address || '').trim()
  const city = String(ev.city || '').trim()
  const region = String(ev.region || '').trim()
  const postal = String(ev.postal || '').trim()
  const country = String(ev.country || '').trim()

  // If address already looks like a full place string, don't re-append city/country.
  const addressLower = normKey(address)
  const street =
    address
    && venue
    && addressLower !== normKey(venue)
    && !addressLower.startsWith(`${normKey(venue)},`)
      ? address
      : address || ''

  const extras = [city, region, postal, country].filter((p) => {
    if (!p) return false
    if (!street) return true
    return !normKey(street).includes(normKey(p))
  })

  return displayLocationLabel(street || undefined, ...extras) || ''
}
