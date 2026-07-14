import { getBackendUrl, apiV1Path } from '@/lib/backend-client'

export type WebhookLogRow = {
  id: number
  created_at: string
  method: string
  path: string
  status_code: number
  outcome: string
  duration_ms: number
  channel: string | null
  error_message: string | null
  request_body: unknown
  response_body: unknown
}

/** Local DB webhook logs removed — remote API owns persistence. */
export function isValidWebhookLogToken(token: string): boolean {
  const expected = process.env.WEBHOOK_LOG_TOKEN
  return Boolean(expected && token && token === expected)
}

export async function saveWebhookLog(_entry: {
  path: string
  statusCode: number
  outcome: string
  durationMs: number
  payload?: unknown
  responseBody?: unknown
  errorMessage?: string
}): Promise<void> {
  // no-op — database lives on the remote API
}

export async function listWebhookLogs(limit = 100, token?: string): Promise<WebhookLogRow[]> {
  const resolved = token || process.env.WEBHOOK_LOG_TOKEN
  if (!resolved) return []

  const qs = new URLSearchParams({
    limit: String(limit),
    token: resolved,
    WEBHOOK_LOG_TOKEN: resolved,
  })
  const url = `${getBackendUrl()}${apiV1Path('webhooks/logs')}?${qs.toString()}`

  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${resolved}`,
        WEBHOOK_LOG_TOKEN: resolved,
      },
      cache: 'no-store',
    })
    if (!res.ok) return []
    const data = await res.json() as { logs?: WebhookLogRow[] }
    return Array.isArray(data.logs) ? data.logs : []
  } catch {
    return []
  }
}
