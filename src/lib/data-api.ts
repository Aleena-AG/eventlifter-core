'use client'

import { authHeader } from '@/lib/auth'
import type { DashboardStats } from '@/lib/dashboard-stats'
import type { BookingListItem } from '@/lib/bookings'

export async function syncChannelsFromApi(): Promise<{
  ok: boolean
  syncedAt: string
  errors: string[]
}> {
  const res = await fetch('/api/sync', {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      Accept: 'application/json',
    },
  })
  const data = await res.json() as { ok?: boolean; syncedAt?: string; errors?: string[]; error?: string }
  if (!res.ok) throw new Error(data.error || `Sync failed (${res.status})`)
  return {
    ok: !!data.ok,
    syncedAt: data.syncedAt || new Date().toISOString(),
    errors: data.errors || [],
  }
}

export async function fetchDashboardFromDb(): Promise<DashboardStats & { lastSyncedAt: string | null }> {
  const res = await fetch('/api/data/dashboard', {
    headers: { Authorization: authHeader(), Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Failed to load dashboard (${res.status})`)
  return res.json()
}

export async function fetchBookingsFromDb(): Promise<{
  bookings: BookingListItem[]
  lastSyncedAt: string | null
}> {
  const res = await fetch('/api/data/bookings', { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Failed to load bookings (${res.status})`)
  return res.json()
}

export async function fetchEventsFromDb(channel: 'hightribe' | 'luma' | 'eventbrite'): Promise<{
  events: Array<{ externalId: string; title: string; startUtc?: string; priceLabel?: string; payload?: unknown }>
  lastSyncedAt: string | null
}> {
  const res = await fetch(`/api/data/events?channel=${channel}`, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Failed to load ${channel} events (${res.status})`)
  return res.json()
}
