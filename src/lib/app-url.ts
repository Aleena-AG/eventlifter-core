/** Public app URL — set APP_URL once in .env.local (live: your domain). */
export function getAppUrl(): string {
  const raw =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  return raw.replace(/\/$/, '')
}

export function eventbriteRedirectUri(): string {
  return `${getAppUrl()}/api/eventbrite/callback`
}
