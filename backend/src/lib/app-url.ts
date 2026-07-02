/** Single public site URL — set APP_URL in .env.local / production env. */
export function resolveAppUrl(): string {
  const raw =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.BACKEND_CORS_ORIGIN ||
    'http://localhost:3000'
  return raw.replace(/\/$/, '')
}
