/** Public app URL — Laragon: https://eventlifter-core.test */
export function getAppUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    'http://localhost:3000'
  return raw.replace(/\/$/, '')
}

export function eventbriteRedirectUri(): string {
  return `${getAppUrl()}/api/eventbrite/callback`
}
