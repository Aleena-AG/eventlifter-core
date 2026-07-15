'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import type { WebhookLogRow } from '@/lib/server/webhook-log'
import './webhook-logs.css'

type Props = {
  token: string
  initialLogs: WebhookLogRow[]
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return iso
  }
}

function JsonBlock({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="wh-muted">—</span>
  }
  return (
    <pre className="wh-json">{JSON.stringify(value, null, 2)}</pre>
  )
}

function statusClass(code: number) {
  if (code >= 500) return 'wh-badge wh-badge-error'
  if (code >= 400) return 'wh-badge wh-badge-warn'
  return 'wh-badge wh-badge-ok'
}

function skipHint(response: unknown): string {
  if (!response || typeof response !== 'object') return ''
  const skipped = (response as { skipped?: unknown }).skipped
  if (typeof skipped !== 'string' || !skipped) return ''
  return ` · ${skipped}`
}

export function WebhookLogsViewer({ token, initialLogs }: Props) {
  const [logs, setLogs] = useState(initialLogs)
  const [loading, setLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(() => new Date())

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const { resolveClientApiUrl } = await import('@/lib/client-api-url')
      const res = await fetch(
        resolveClientApiUrl(`/api/wh-logs/${encodeURIComponent(token)}?limit=150`),
        { cache: 'no-store' },
      )
      if (!res.ok) return
      const data = await res.json() as { logs?: WebhookLogRow[] }
      if (Array.isArray(data.logs)) {
        setLogs(data.logs)
        setLastRefresh(new Date())
      }
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh()
    }, 10_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  return (
    <div className="wh-page">
      <header className="wh-header">
        <div>
          <h1>Webhook logs</h1>
          <p className="wh-sub">Incoming webhook requests (auto-refresh every 10s)</p>
        </div>
        <div className="wh-actions">
          <span className="wh-muted">
            {loading ? 'Refreshing…' : `Updated ${formatWhen(lastRefresh.toISOString())}`}
          </span>
          <button type="button" className="wh-btn" onClick={() => void refresh()} disabled={loading}>
            Refresh
          </button>
        </div>
      </header>

      {logs.length === 0 ? (
        <div className="wh-empty">No webhook logs yet. Send a test webhook to any channel endpoint.</div>
      ) : (
        <div className="wh-table-wrap">
          <table className="wh-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Channel</th>
                <th>Status</th>
                <th>Outcome</th>
                <th>Duration</th>
                <th>Preview</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const open = expandedId === log.id
                const preview = JSON.stringify(log.payload_json)
                return (
                  <Fragment key={log.id}>
                    <tr
                      className={open ? 'wh-row-open' : 'wh-row'}
                      onClick={() => setExpandedId(open ? null : log.id)}
                    >
                      <td>{formatWhen(log.created_at)}</td>
                      <td><span className="wh-channel">{log.channel}</span></td>
                      <td><span className={statusClass(log.status_code)}>{log.status_code}</span></td>
                      <td>{log.outcome || '—'}{skipHint(log.response_json)}</td>
                      <td>{log.duration_ms != null ? `${log.duration_ms}ms` : '—'}</td>
                      <td className="wh-preview">{preview.slice(0, 120)}{preview.length > 120 ? '…' : ''}</td>
                    </tr>
                    {open && (
                      <tr key={`${log.id}-detail`} className="wh-detail-row">
                        <td colSpan={6}>
                          <div className="wh-detail-grid">
                            <section>
                              <h3>Payload</h3>
                              <JsonBlock value={log.payload_json} />
                            </section>
                            <section>
                              <h3>Response</h3>
                              <JsonBlock value={log.response_json} />
                            </section>
                            <section>
                              <h3>Headers</h3>
                              <JsonBlock value={log.headers_json} />
                            </section>
                            {log.error_message && (
                              <section className="wh-error-box">
                                <h3>Error</h3>
                                <p>{log.error_message}</p>
                              </section>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
