'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { EventLiveDashboard } from '@/components/events/EventLiveDashboard'
import { PageLoader } from '@/components/Loader'
import { loadEventDashboardData, type EventDashboardData } from '@/lib/event-dashboard-data'
import { CHANNEL_KEYS } from '@/lib/channels'
import type { ChannelKey } from '@/lib/types'

function isChannelKey(v: string): v is ChannelKey {
  return CHANNEL_KEYS.includes(v as ChannelKey)
}

export default function EventDetailPage() {
  const params = useParams()
  const router = useRouter()
  const channelParam = String(params.channel || '')
  const eventId = String(params.eventId || '')

  const [data, setData] = useState<EventDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const channel = isChannelKey(channelParam) ? channelParam : null

  const load = useCallback(async (isRefresh = false) => {
    if (!channel || !eventId) return
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const next = await loadEventDashboardData(channel, eventId, { refresh: isRefresh })
      setData(next)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [channel, eventId])

  useEffect(() => {
    if (!channel) {
      router.replace('/events')
      return
    }
    load()
  }, [channel, load, router])

  if (!channel) return null

  if (loading && !data) {
    return <PageLoader label="Loading event dashboard…" />
  }

  if (!data) {
    return (
      <div style={{ padding: '24px 0', color: 'var(--muted)' }}>
        Could not load this event.{' '}
        <button
          type="button"
          onClick={() => router.push('/events')}
          style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', font: 'inherit' }}
        >
          Back to events
        </button>
      </div>
    )
  }

  return (
    <EventLiveDashboard
      title={data.title}
      capacity={data.capacity}
      attendees={data.attendees}
      channels={data.channels}
      channelCounts={data.channelCounts}
      registrations={data.registrations}
      uniqueAttendees={data.uniqueAttendees}
      loading={refreshing}
      onRefresh={() => load(true)}
    />
  )
}
