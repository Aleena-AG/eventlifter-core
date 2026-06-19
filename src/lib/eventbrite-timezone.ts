const COUNTRY_TZ: Record<string, string> = {
  PK: 'Asia/Karachi',
  IN: 'Asia/Kolkata',
  US: 'America/New_York',
  GB: 'Europe/London',
  AE: 'Asia/Dubai',
  AU: 'Australia/Sydney',
  JP: 'Asia/Tokyo',
  FR: 'Europe/Paris',
  DE: 'Europe/Berlin',
  CA: 'America/Toronto',
}

const EB_ALIASES: Record<string, string> = {
  UTC: 'Etc/UTC',
  GMT: 'Etc/GMT',
}

const DEFAULT_EB_TIMEZONES = [
  'America/Los_Angeles', 'America/New_York', 'America/Chicago', 'America/Denver',
  'America/Toronto', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Tokyo', 'Asia/Shanghai',
  'Australia/Sydney', 'Pacific/Auckland', 'Etc/UTC', 'Etc/GMT',
  'Etc/GMT-5', 'Etc/GMT+5', 'Etc/GMT-4', 'Etc/GMT+4',
]

let cache: Set<string> | null = null
let cacheAt = 0

function isValidIana(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz })
    return true
  } catch {
    return false
  }
}

function getOffsetMinutes(timeZone: string, isoUtc: string): number | null {
  if (!isValidIana(timeZone)) return null
  try {
    const date = new Date(isoUtc)
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    })
    const parts = dtf.formatToParts(date)
    const get = (t: string) => parts.find(p => p.type === t)?.value || '0'
    const y = parseInt(get('year'), 10)
    const mo = parseInt(get('month'), 10) - 1
    const d = parseInt(get('day'), 10)
    const h = parseInt(get('hour'), 10)
    const mi = parseInt(get('minute'), 10)
    const s = parseInt(get('second'), 10)
    const asUtc = Date.UTC(y, mo, d, h, mi, s)
    return Math.round((asUtc - date.getTime()) / 60000)
  } catch {
    return null
  }
}

function etcGmtFromOffset(offsetMin: number): string {
  const hours = Math.round(offsetMin / 60)
  if (hours === 0) return 'Etc/UTC'
  return hours > 0 ? `Etc/GMT-${hours}` : `Etc/GMT+${Math.abs(hours)}`
}

export async function fetchEbTimezones(): Promise<Set<string>> {
  if (cache && Date.now() - cacheAt < 3_600_000) return cache
  try {
    const res = await fetch('/api/eventbrite/system/timezones?page_size=1000')
    if (res.ok) {
      const data = await res.json() as { timezones?: Array<{ timezone?: string }> }
      const set = new Set(
        (data.timezones || []).map(t => t.timezone).filter((z): z is string => !!z),
      )
      if (set.size > 0) {
        cache = set
        cacheAt = Date.now()
        return cache
      }
    }
  } catch { /* use defaults */ }
  cache = new Set(DEFAULT_EB_TIMEZONES)
  cacheAt = Date.now()
  return cache
}

/** Map any source timezone to one Eventbrite accepts (same UTC offset when possible). */
export async function resolveEbTimezone(
  tz: string | undefined,
  startUtc: string,
  hints?: { country?: string; city?: string },
): Promise<string> {
  const allowed = await fetchEbTimezones()
  const candidates: string[] = []

  const raw = (tz || '').trim()
  if (raw) candidates.push(raw)

  const country = hints?.country?.trim().toUpperCase()
  if (country && COUNTRY_TZ[country]) candidates.push(COUNTRY_TZ[country])

  candidates.push('America/Los_Angeles', 'America/New_York', 'Europe/London', 'Etc/UTC')

  for (const c of candidates) {
    if (allowed.has(c)) return c
    const alias = EB_ALIASES[c]
    if (alias && allowed.has(alias)) return alias
  }

  const sourceTz = raw || (country ? COUNTRY_TZ[country] : '')
  if (sourceTz && isValidIana(sourceTz)) {
    const want = getOffsetMinutes(sourceTz, startUtc)
    if (want != null) {
      for (const z of allowed) {
        if (getOffsetMinutes(z, startUtc) === want) return z
      }
      const etc = etcGmtFromOffset(want)
      if (allowed.has(etc)) return etc
    }
  }

  if (allowed.has('America/Los_Angeles')) return 'America/Los_Angeles'
  return [...allowed][0] || 'America/Los_Angeles'
}

export function inferTimezoneFromEvent(
  e: Record<string, unknown>,
  geo?: Record<string, unknown>,
): string {
  const direct = String(e.timezone || e.time_zone || '').trim()
  if (direct) return direct
  const country = String(geo?.country || e.country || '').trim().toUpperCase()
  if (country && COUNTRY_TZ[country]) return COUNTRY_TZ[country]
  return 'UTC'
}
