/**
 * Remote Ewentcast API (separated from this Next.js app).
 * Default: https://ewentcast-backend.vercel.app
 *
 * Override with BACKEND_URL in .env when needed.
 */
const DEFAULT_BACKEND_URL = 'https://ewentcast-backend.vercel.app'

export function getBackendUrl(): string {
  const raw = process.env.BACKEND_URL || DEFAULT_BACKEND_URL
  return raw.replace(/\/$/, '')
}

/** Path under /api/v1 — e.g. apiV1Path('auth/me') → /api/v1/auth/me */
export function apiV1Path(path: string): string {
  const cleaned = path.replace(/^\//, '')
  return `/api/v1/${cleaned}`
}

export async function backendFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const normalized = path.startsWith('/api/')
    ? path
    : apiV1Path(path)
  const url = `${getBackendUrl()}${normalized}`
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
  const data = await res.json() as T & { error?: string; message?: string }
  if (!res.ok) {
    throw new Error(
      typeof data.message === 'string'
        ? data.message
        : typeof data.error === 'string'
          ? data.error
          : `Backend error ${res.status}`,
    )
  }
  return data
}

/** Forward a Next.js request to the remote API (same method, query, body, auth). */
export async function proxyToBackend(
  req: Request,
  path: string,
  init?: { method?: string; body?: string | null },
): Promise<Response> {
  const url = new URL(req.url)
  const targetPath = path.startsWith('/api/') ? path : apiV1Path(path)
  const target = `${getBackendUrl()}${targetPath}${url.search}`

  const method = init?.method || req.method
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  const auth = req.headers.get('authorization')
  if (auth) headers.Authorization = auth
  const contentType = req.headers.get('content-type')
  if (contentType) headers['Content-Type'] = contentType
  const stripeSig = req.headers.get('stripe-signature')
  if (stripeSig) headers['stripe-signature'] = stripeSig
  const webhookSecret = req.headers.get('x-webhook-secret')
  if (webhookSecret) headers['X-Webhook-Secret'] = webhookSecret
  const webhookLogToken = req.headers.get('webhook_log_token') || req.headers.get('x-webhook-log-token')
  if (webhookLogToken) headers['WEBHOOK_LOG_TOKEN'] = webhookLogToken
  const envLogToken = process.env.WEBHOOK_LOG_TOKEN
  if (envLogToken && targetPath.includes('/webhooks/logs') && !headers.WEBHOOK_LOG_TOKEN && !auth) {
    headers['WEBHOOK_LOG_TOKEN'] = envLogToken
  }

  let body: string | undefined
  if (init?.body !== undefined) {
    body = init.body ?? undefined
  } else if (method !== 'GET' && method !== 'HEAD') {
    body = await req.text()
  }

  if (body !== undefined && body !== '' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(target, {
    method,
    headers,
    body: body && body.length > 0 ? body : undefined,
    cache: 'no-store',
  })

  const text = await res.text()
  const outHeaders = new Headers()
  const resType = res.headers.get('content-type')
  if (resType) outHeaders.set('content-type', resType)

  return new Response(text, { status: res.status, headers: outHeaders })
}
