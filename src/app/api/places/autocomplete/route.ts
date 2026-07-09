import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const GOOGLE_KEY =
  process.env.NEXT_PUBLIC_GOOGLE_LOCATION_API_KEY ||
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_LOCATION_API_KEY ||
  ''

type Prediction = {
  description: string
  placeId: string
  name?: string
}

/** Soft plural/typo variants so "venus hills" still finds "Venus Hill". */
function queryVariants(input: string): string[] {
  const base = input.trim().replace(/\s+/g, ' ')
  if (base.length < 2) return []
  const out: string[] = [base]
  const singular = base.replace(/\bhills\b/gi, 'hill').replace(/\bstreets\b/gi, 'street')
  if (singular !== base) out.push(singular)
  // Drop trailing "s" on the last word when it looks plural (hills → hill already covered)
  const parts = base.split(' ')
  const last = parts[parts.length - 1]
  if (last && /[a-z]s$/i.test(last) && last.length > 3 && !/ss$/i.test(last)) {
    const alt = [...parts.slice(0, -1), last.slice(0, -1)].join(' ')
    if (!out.includes(alt)) out.push(alt)
  }
  return out
}

function tokensMatchQuery(description: string, query: string): boolean {
  const q = query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 2)
  if (!q.length) return true
  const d = description.toLowerCase()
  // Require at least half of meaningful tokens (min 1) to appear in the result
  const hits = q.filter(t => d.includes(t) || d.includes(t.replace(/s$/, '')))
  return hits.length >= Math.max(1, Math.ceil(q.length / 2))
}

async function fetchAutocomplete(
  input: string,
  countryCode?: string,
): Promise<{ status: string; predictions: Prediction[] }> {
  const params = new URLSearchParams({
    input,
    key: GOOGLE_KEY,
  })
  if (countryCode) params.set('components', `country:${countryCode.toLowerCase()}`)

  const res = await fetch(
    `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`,
    { next: { revalidate: 0 } },
  )
  if (!res.ok) {
    return { status: `HTTP_${res.status}`, predictions: [] }
  }
  const data = (await res.json()) as {
    status?: string
    predictions?: Array<{
      description?: string
      place_id?: string
      structured_formatting?: { main_text?: string }
    }>
  }
  const predictions = (data.predictions || [])
    .filter(p => p.place_id && p.description)
    .map(p => ({
      description: String(p.description),
      placeId: String(p.place_id),
      name: p.structured_formatting?.main_text || String(p.description).split(',')[0]?.trim(),
    }))
  return { status: String(data.status || 'UNKNOWN'), predictions }
}

export async function GET(req: NextRequest) {
  if (!GOOGLE_KEY) {
    return NextResponse.json(
      { error: 'Missing Google Maps API key', predictions: [] },
      { status: 500 },
    )
  }

  const q = String(req.nextUrl.searchParams.get('q') || '').trim()
  const country = String(req.nextUrl.searchParams.get('country') || '').trim().toLowerCase()
  if (q.length < 2) {
    return NextResponse.json({ predictions: [] })
  }

  const variants = queryVariants(q)
  const seen = new Set<string>()
  const merged: Prediction[] = []

  const add = (list: Prediction[]) => {
    for (const p of list) {
      if (seen.has(p.placeId)) continue
      if (!tokensMatchQuery(p.description, q) && !tokensMatchQuery(p.description, variants[0] || q)) {
        continue
      }
      seen.add(p.placeId)
      merged.push(p)
    }
  }

  // 1) Try each variant with country lock
  if (country) {
    for (const v of variants) {
      const { predictions } = await fetchAutocomplete(v, country)
      add(predictions)
      if (merged.length >= 8) break
    }
  }

  // 2) Retry without country — city/country bias often hides valid venues
  if (merged.length < 3) {
    for (const v of variants) {
      const { predictions } = await fetchAutocomplete(v)
      add(predictions)
      if (merged.length >= 8) break
    }
  }

  return NextResponse.json({
    predictions: merged.slice(0, 8),
    query: q,
  })
}
