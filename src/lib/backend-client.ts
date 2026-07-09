/**
 * Internal API base URL — server-side only (Next.js API routes).
 *
 * APP_URL = public site (OAuth, webhooks, emails, CORS). Set once in .env.
 *
 * Set BACKEND_URL only when the API runs on a different host (split deployment).
 * By default the API is collocated with Next.js on port 3000, not legacy Express :4000.
 */
export function getBackendUrl(): string {
  if (process.env.BACKEND_URL) {
    return process.env.BACKEND_URL.replace(/\/$/, '')
  }
  const port = process.env.PORT || '3000'
  const host = process.env.HOST || '127.0.0.1'
  return `http://${host}:${port}`
}

export async function backendFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = `${getBackendUrl()}${path.startsWith('/') ? path : `/${path}`}`
  return fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
    cache: 'no-store',
  })
}

export async function backendJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await backendFetch(path, init)
  const data = await res.json() as T & { error?: string }
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : `Backend error ${res.status}`)
  }
  return data
}
