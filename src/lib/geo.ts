'use client'

// Free, key-less public dataset for countries + their states/regions.
const BASE = 'https://countriesnow.space/api/v0.1'

let countriesCache: string[] | null = null
let countriesInflight: Promise<string[]> | null = null
const statesCache = new Map<string, string[]>()
const statesInflight = new Map<string, Promise<string[]>>()

/** All country names (alphabetical). Cached for the session. Empty array on failure. */
export function fetchCountries(): Promise<string[]> {
  if (countriesCache) return Promise.resolve(countriesCache)
  if (countriesInflight) return countriesInflight

  countriesInflight = (async () => {
    try {
      const res = await fetch(`${BASE}/countries/iso`)
      const json = (await res.json()) as { data?: { name?: string }[] }
      const list = (json.data || [])
        .map(c => String(c.name || '').trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
      countriesCache = list
      return list
    } catch {
      return []
    } finally {
      countriesInflight = null
    }
  })()

  return countriesInflight
}

/** State / region names for a country. Cached per country. Empty array when none/failure. */
export function fetchStates(country: string): Promise<string[]> {
  const key = country.trim()
  if (!key) return Promise.resolve([])
  const cached = statesCache.get(key)
  if (cached) return Promise.resolve(cached)
  const inflight = statesInflight.get(key)
  if (inflight) return inflight

  const promise = (async () => {
    try {
      const res = await fetch(`${BASE}/countries/states`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country: key }),
      })
      const json = (await res.json()) as { data?: { states?: { name?: string }[] } }
      const list = (json.data?.states || [])
        .map(s => String(s.name || '').trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
      statesCache.set(key, list)
      return list
    } catch {
      return []
    } finally {
      statesInflight.delete(key)
    }
  })()

  statesInflight.set(key, promise)
  return promise
}
