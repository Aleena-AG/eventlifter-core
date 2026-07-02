/** Live production site — used when APP_URL is not set. */
export const PRODUCTION_APP_URL = 'https://ewentcast.com'

const DEV_APP_URL = 'http://localhost:3000'

export function defaultAppUrl(): string {
  return process.env.NODE_ENV === 'production' ? PRODUCTION_APP_URL : DEV_APP_URL
}

/** Public app URL — override with APP_URL in .env.local (local: eventlifter-core.test). */
export function getAppUrl(): string {
  const raw =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    defaultAppUrl()
  return raw.replace(/\/$/, '')
}

export function eventbriteRedirectUri(): string {
  return `${getAppUrl()}/api/eventbrite/callback`
}
