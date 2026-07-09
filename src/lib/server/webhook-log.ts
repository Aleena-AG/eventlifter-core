import { useDatabase } from '../../../backend/src/config'
import { query } from '../../../backend/src/db/pool'

const REDACT_HEADERS = new Set([
  'authorization',
  'x-webhook-secret',
  'x-channel-manager-secret',
  'stripe-signature',
  'cookie',
])

export type WebhookLogRow = {
  id: number
  channel: string
  method: string
  path: string
  status_code: number
  outcome: string | null
  payload_json: unknown
  headers_json: unknown
  response_json: unknown
  error_message: string | null
  duration_ms: number | null
  created_at: string
}

export type SaveWebhookLogInput = {
  channel: string
  method?: string
  path?: string
  statusCode: number
  outcome?: string
  payload: unknown
  headers?: Headers
  response?: unknown
  error?: string
  durationMs?: number
}

export function getWebhookLogToken(): string | null {
  const token = process.env.WEBHOOK_LOG_TOKEN?.trim()
  return token || null
}

export function isValidWebhookLogToken(token: string): boolean {
  const expected = getWebhookLogToken()
  if (!expected || !token) return false
  return token === expected
}

export function sanitizeHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  headers.forEach((value, key) => {
    out[key] = REDACT_HEADERS.has(key.toLowerCase()) ? '[redacted]' : value
  })
  return out
}

export async function saveWebhookLog(input: SaveWebhookLogInput): Promise<void> {
  if (!useDatabase()) return

  try {
    const now = new Date()
    await query(
      `INSERT INTO webhook_logs (
        channel, method, path, status_code, outcome,
        payload_json, headers_json, response_json, error_message, duration_ms, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.channel,
        input.method || 'POST',
        input.path || '',
        input.statusCode,
        input.outcome || null,
        JSON.stringify(input.payload ?? null),
        input.headers ? JSON.stringify(sanitizeHeaders(input.headers)) : null,
        input.response !== undefined ? JSON.stringify(input.response) : null,
        input.error || null,
        input.durationMs ?? null,
        now,
      ],
    )
  } catch (e) {
    console.error('[webhook-log] save failed:', e instanceof Error ? e.message : e)
  }
}

export async function listWebhookLogs(limit = 150): Promise<WebhookLogRow[]> {
  if (!useDatabase()) return []

  const safeLimit = Math.min(Math.max(limit, 1), 500)
  const rows = await query<WebhookLogRow[]>(
    `SELECT id, channel, method, path, status_code, outcome,
            payload_json, headers_json, response_json, error_message, duration_ms, created_at
     FROM webhook_logs
     ORDER BY id DESC
     LIMIT ?`,
    [safeLimit],
  )

  return rows.map((row) => ({
    ...row,
    payload_json: parseJsonColumn(row.payload_json),
    headers_json: parseJsonColumn(row.headers_json),
    response_json: parseJsonColumn(row.response_json),
    created_at: formatDbDate(row.created_at),
  }))
}

function parseJsonColumn(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (typeof value === 'object') return value
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  return value
}

function formatDbDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  return String(value)
}
