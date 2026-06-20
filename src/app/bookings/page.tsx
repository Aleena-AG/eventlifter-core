'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { getSettings } from '@/lib/api'
import { loadAllBookings, type BookingListItem } from '@/lib/bookings'
import { InlineLoader, PageLoader } from '@/components/Loader'
import { getUser } from '@/lib/auth'
import type { ChannelKey } from '@/lib/types'

const CH_META: Record<ChannelKey, { label: string; icon: string; color: string }> = {
  hightribe: { label: 'HighTribe', icon: '🏔', color: '#a78bfa' },
  luma: { label: 'Luma', icon: '✨', color: '#22d3ee' },
  eventbrite: { label: 'Eventbrite', icon: '🎫', color: '#fbbf24' },
}

type Filter = 'all' | ChannelKey

function formatDate(utc: string) {
  try {
    return new Date(utc).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return utc
  }
}

function statusColor(status?: string) {
  if (!status) return '#8b949e'
  if (status === 'approved') return '#3fb950'
  if (status === 'pending') return '#fbbf24'
  if (status === 'rejected') return '#f85149'
  return '#8b949e'
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<BookingListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const htLoggedIn = !!getUser()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const settings = await getSettings() as {
        luma?: { configured?: boolean }
        eventbrite?: { configured?: boolean; hasPrivateToken?: boolean }
      }
      setBookings(await loadAllBookings({
        ebConfigured: !!(settings.eventbrite?.configured || settings.eventbrite?.hasPrivateToken),
        lumaConfigured: !!settings.luma?.configured,
      }))
    } catch {
      setBookings([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return bookings.filter(b => {
      if (filter !== 'all' && b.channel !== filter) return false
      if (!q) return true
      return (
        b.name.toLowerCase().includes(q)
        || b.email.toLowerCase().includes(q)
        || b.eventTitle.toLowerCase().includes(q)
      )
    })
  }, [bookings, filter, query])

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: bookings.length, hightribe: 0, luma: 0, eventbrite: 0 }
    for (const b of bookings) c[b.channel]++
    return c
  }, [bookings])

  return (
    <div style={{ maxWidth: '960px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#e6edf3' }}>Bookings</h1>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#8b949e' }}>
            Incoming registrations from webhooks and connected channels
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{ background: '#1c2128', border: '1px solid #30363d', borderRadius: '6px', color: '#8b949e', padding: '8px 14px', fontSize: '13px', cursor: loading ? 'default' : 'pointer' }}
        >
          {loading ? <InlineLoader label="Refreshing" /> : '↻ Refresh'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {(['all', 'hightribe', 'luma', 'eventbrite'] as Filter[]).map(f => {
          const meta = f === 'all' ? null : CH_META[f]
          const active = filter === f
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                background: active ? '#1c2128' : 'transparent',
                border: `1px solid ${active ? (meta?.color || '#388bfd') + '66' : '#30363d'}`,
                borderRadius: '999px',
                color: active ? '#e6edf3' : '#8b949e',
                padding: '6px 14px',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              {f === 'all' ? 'All' : `${meta!.icon} ${meta!.label}`} ({counts[f]})
            </button>
          )
        })}
      </div>

      <input
        type="search"
        placeholder="Search by name, email, or event…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: '8px',
          color: '#e6edf3',
          padding: '10px 14px',
          fontSize: '14px',
          marginBottom: '20px',
          outline: 'none',
        }}
      />

      {!htLoggedIn && (
        <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#fbbf24' }}>
          Sign in to HighTribe to load live bookings from your events API. Webhook registrations still appear below.
        </div>
      )}

      {loading ? (
        <PageLoader label="Loading bookings…" />
      ) : filtered.length === 0 ? (
        <div style={{ background: '#161b22', border: '2px dashed #30363d', borderRadius: '10px', padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>📋</div>
          <div style={{ fontSize: '15px', color: '#e6edf3', fontWeight: 500, marginBottom: '8px' }}>No bookings yet</div>
          <p style={{ color: '#8b949e', fontSize: '13px', margin: 0, lineHeight: 1.5 }}>
            When someone registers on HighTribe, Luma, or Eventbrite, they will appear here via webhooks.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map(b => {
            const meta = CH_META[b.channel]
            return (
              <div
                key={b.id}
                style={{
                  background: '#161b22',
                  border: '1px solid #30363d',
                  borderRadius: '10px',
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  flexWrap: 'wrap',
                }}
              >
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: meta.color + '22',
                    border: `1px solid ${meta.color}44`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    fontWeight: 700,
                    color: meta.color,
                    flexShrink: 0,
                  }}
                >
                  {b.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                </div>

                <div style={{ flex: 1, minWidth: '180px' }}>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: '#e6edf3' }}>{b.name}</div>
                  <div style={{ fontSize: '13px', color: '#8b949e', marginTop: '2px' }}>{b.email}</div>
                  <div style={{ fontSize: '13px', color: '#6e7681', marginTop: '4px' }}>{b.eventTitle}</div>
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <span style={{ fontSize: '11px', padding: '3px 9px', borderRadius: '4px', background: meta.color + '14', border: `1px solid ${meta.color}44`, color: meta.color }}>
                    {meta.icon} {meta.label}
                  </span>
                  {b.status && (
                    <div style={{ fontSize: '11px', color: statusColor(b.status), marginTop: '6px', textTransform: 'capitalize' }}>
                      {b.status}
                      {b.ticketCount != null && b.ticketCount > 0 ? ` · ${b.ticketCount} ticket${b.ticketCount === 1 ? '' : 's'}` : ''}
                    </div>
                  )}
                  <div style={{ fontSize: '12px', color: '#6e7681', marginTop: '6px' }}>{formatDate(b.registeredAt)}</div>
                  <div style={{ fontSize: '10px', color: '#484f58', marginTop: '2px' }}>
                    {b.source === 'webhook' ? 'via webhook' : 'via API'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ marginTop: '16px', fontSize: '12px', color: '#6e7681', textAlign: 'center' }}>
          Showing {filtered.length} of {bookings.length} booking{bookings.length === 1 ? '' : 's'}
        </div>
      )}
    </div>
  )
}
