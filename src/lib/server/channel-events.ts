import { backendFetch, backendJson } from '@/lib/backend-client'
import type { ChannelName } from '@/lib/server/channels'

export async function upsertChannelEvents(
  channel: ChannelName,
  _userId: number,
  events: Array<Record<string, unknown>>,
  opts?: { prune?: boolean },
  authorization?: string,
) {
  const res = await backendFetch(`events/${channel}/sync`, {
    method: 'POST',
    headers: authorization ? { Authorization: authorization } : undefined,
    body: JSON.stringify({ events, prune: opts?.prune !== false }),
  })
  const data = await res.json() as Record<string, unknown>
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : `sync failed ${res.status}`)
  }
  return data
}

export async function deleteChannelEvent(
  channel: ChannelName,
  _userId: number,
  externalId: string,
  authorization?: string,
) {
  const res = await backendFetch(`events/${channel}/${encodeURIComponent(externalId)}`, {
    method: 'DELETE',
    headers: authorization ? { Authorization: authorization } : undefined,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(data.error || `delete failed ${res.status}`)
  }
  const data = await res.json().catch(() => ({ ok: true })) as { ok?: boolean }
  return data.ok !== false
}

export async function listChannelEvents(
  channel: ChannelName,
  authorization: string,
) {
  const data = await backendJson<{ events?: unknown[] }>(`events/${channel}`, {
    headers: { Authorization: authorization },
  })
  return data.events || []
}
