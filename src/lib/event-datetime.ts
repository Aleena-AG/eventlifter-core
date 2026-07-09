/** Normalize display / API timezone strings to a valid IANA id when possible. */
export function normalizeTimeZone(timeZone: string | null | undefined): string {
  const raw = String(timeZone || '').trim()
  if (!raw) return 'UTC'
  const candidates = [
    raw,
    raw.replace(/\s+/g, '_'),
    raw.replace(/-/g, '_'),
    raw.replace(/\s+/g, '_').replace(/-/g, '_'),
  ]
  for (const c of candidates) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: c })
      return c
    } catch {
      // try next
    }
  }
  return 'UTC'
}

/** Convert a wall-clock date + time in an IANA timezone to UTC ISO (Eventbrite/Luma/HT). */
export function zonedDateTimeToUtcIso(date: string, time: string, timeZone: string): string {
  const datePart = String(date || '').trim()
  const timePart = String(time || '00:00').trim().slice(0, 5)
  const zone = normalizeTimeZone(timeZone)

  const [y, m, d] = datePart.split('-').map((v) => Number(v))
  const [hh, mm] = timePart.split(':').map((v) => Number(v))
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  }

  const targetMs = Date.UTC(y, m - 1, d, hh, mm, 0)
  let utcMs = targetMs

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  for (let i = 0; i < 4; i++) {
    const parts = formatter.formatToParts(new Date(utcMs))
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0)
    const fy = get('year')
    const fm = get('month')
    const fd = get('day')
    const fh = get('hour')
    const fmin = get('minute')
    const zonedAsUtc = Date.UTC(fy, fm - 1, fd, fh, fmin, 0)
    const diff = targetMs - zonedAsUtc
    if (diff === 0) break
    utcMs += diff
  }

  return new Date(utcMs).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** Convert a UTC ISO timestamp into calendar date/time fields in an IANA timezone. */
export function utcIsoToZonedParts(isoUtc: string, timeZone: string): { date: string; time: string } {
  const d = new Date(isoUtc)
  if (Number.isNaN(d.getTime())) return { date: '', time: '' }
  const zone = normalizeTimeZone(timeZone)
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    const parts = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, p.value]))
    let hour = parts.hour || '00'
    // Some runtimes emit "24:00" for midnight — normalize for <input type="time">.
    if (hour === '24') hour = '00'
    return {
      date: `${parts.year}-${parts.month}-${parts.day}`,
      time: `${hour}:${parts.minute}`,
    }
  } catch {
    const pad = (n: number) => String(n).padStart(2, '0')
    return {
      date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
      time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
    }
  }
}

/**
 * Hightribe dates: prefer wall-clock start_date/start_time + timezone (source of truth
 * on HT update payloads). Fall back to starts_at only when wall-clock fields are missing.
 * Never use `new Date('YYYY-MM-DDTHH:mm')` — that treats the value as the browser's
 * local zone and skews edit form times.
 */
export function hightribeDatesToUtc(
  dates: {
    starts_at?: string
    ends_at?: string
    start_date?: string
    start_time?: string
    end_date?: string
    end_time?: string
    timezone?: string
  } | null | undefined,
  fallbackTimezone?: string,
): { startUtc: string; endUtc: string; timezone: string } {
  const tz = normalizeTimeZone(dates?.timezone || fallbackTimezone || 'UTC')
  const stripMs = (s: string) => s.replace(/\.\d{3}Z$/, 'Z')

  let startUtc: string
  if (dates?.start_date) {
    startUtc = zonedDateTimeToUtcIso(dates.start_date, dates.start_time || '00:00', tz)
  } else if (dates?.starts_at) {
    startUtc = stripMs(String(dates.starts_at))
  } else {
    startUtc = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  }

  let endUtc: string
  if (dates?.end_date) {
    endUtc = zonedDateTimeToUtcIso(dates.end_date, dates.end_time || dates.start_time || '00:00', tz)
  } else if (dates?.ends_at) {
    endUtc = stripMs(String(dates.ends_at))
  } else {
    endUtc = startUtc
  }

  return { startUtc, endUtc, timezone: tz }
}
