'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { EventLiveDashboard } from '@/components/events/EventLiveDashboard'
import { PageLoader } from '@/components/Loader'
import { loadEventDashboardData, type EventDashboardData } from '@/lib/event-dashboard-data'
import { decodeEventRef } from '@/lib/event-ref'

export default function EventDetailPage() {
  const params = useParams()
  const router = useRouter()
  const ref = String(params.ref || '')
  const decoded = decodeEventRef(ref)

  const [data, setData] = useState<EventDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (isRefresh = false) => {
    if (!decoded) return
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const next = await loadEventDashboardData(decoded.channel, decoded.id, { refresh: isRefresh })
      setData(next)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [decoded])

  useEffect(() => {
    if (!decoded) {
      router.replace('/events')
      return
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref])

  if (!decoded) return null

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
      bookings={data.bookings}
      channels={data.channels}
      channelCounts={data.channelCounts}
      channelRevenue={data.channelRevenue}
      registrations={data.registrations}
      ticketPrice={data.ticketPrice}
      currency={data.currency}
      isFree={data.isFree}
      hasPricing={data.hasPricing}
      revenue={data.revenue}
      ticketsSoldPct={data.ticketsSoldPct}
      ticketTypes={data.ticketTypes}
      startAt={data.startAt}
      endAt={data.endAt}
      coverUrl={data.coverUrl}
      venue={data.venue}
      status={data.status}
      eventUrl={data.eventUrl}
      primaryChannel={data.primaryChannel}
      loading={refreshing}
      onRefresh={() => load(true)}
    />
  )
}
