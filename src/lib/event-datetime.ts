/** Convert a wall-clock date + time in an IANA timezone to UTC ISO (Eventbrite/Luma/HT). */
export function zonedDateTimeToUtcIso(date: string, time: string, timeZone: string): string {
  const datePart = String(date || '').trim()
  const timePart = String(time || '00:00').trim().slice(0, 5)
  const zone = String(timeZone || 'UTC').trim() || 'UTC'

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
