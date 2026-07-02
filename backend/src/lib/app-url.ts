/** Live production site — used when APP_URL is not set. */
export const PRODUCTION_APP_URL = 'https://ewentcast.com'

const DEV_APP_URL = 'http://localhost:3000'

export function defaultAppUrl(): string {
  return process.env.NODE_ENV === 'production' ? PRODUCTION_APP_URL : DEV_APP_URL
}

/** Single public site URL — set APP_URL in .env.local / production env. */
export function resolveAppUrl(): string {
  const raw =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.BACKEND_CORS_ORIGIN ||
    defaultAppUrl()
  return raw.replace(/\/$/, '')
}
