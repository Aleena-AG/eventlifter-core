'use client'

import Link from 'next/link'
import { ChannelLogo } from '@/components/ChannelLogo'
import { InlineLoader } from '@/components/Loader'
import { CH_META } from '@/components/ewentcast/config'
import type { AttendeeRecord } from '@/lib/event-registry'
import type { ChannelKey } from '@/lib/types'
import '@/app/create/ewentcast.css'
import './event-live.css'

function Swatch({ color, size = 10 }: { color: string; size?: number }) {
  return <span className="ew-swatch" style={{ width: size, height: size, background: color }} />
}

interface EventLiveDashboardProps {
  title: string
  capacity: number
  attendees: AttendeeRecord[]
  channels: ChannelKey[]
  channelCounts: Partial<Record<ChannelKey, number>>
  registrations: number
  uniqueAttendees: number
  loading?: boolean
  onRefresh?: () => void
}

export function EventLiveDashboard({
  title,
  capacity,
  attendees,
  channels,
  channelCounts,
  registrations,
  uniqueAttendees,
  loading,
  onRefresh,
}: EventLiveDashboardProps) {
  const filled = capacity > 0 ? Math.round((uniqueAttendees / capacity) * 100) : 0
  const totalChannelAttendees = Object.values(channelCounts).reduce((sum, n) => sum + (n || 0), 0)
  const barTotal = Math.max(totalChannelAttendees, 1)

  return (
    <div className="ew-root ew-embedded">
      <div className="ew-wrap">
        <div className="ew-view">
          <div className="ew-view-body">
            <div className="ew-head">
              <span className="ew-eyebrow">Step 3 · Live</span>
              <h2>{title}</h2>
              <p>One attendee list, one revenue number — pulled back from every channel via webhooks.</p>
            </div>

            <div className="ew-stats">
              <div className="ew-stat">
                <div className="k">Attendees</div>
                <div className="v">{uniqueAttendees}</div>
                <div className="s">{uniqueAttendees} unique</div>
              </div>
              <div className="ew-stat">
                <div className="k">Registrations</div>
                <div className="v">{registrations}</div>
                <div className="s">across all channels</div>
              </div>
              <div className="ew-stat">
                <div className="k">Capacity</div>
                <div className="v">{filled}%</div>
                <div className="s">{uniqueAttendees} of {capacity}</div>
              </div>
              <div className="ew-stat">
                <div className="k">Channels</div>
                <div className="v">{channels.length}</div>
                <div className="s">all synced</div>
              </div>
            </div>

            <div className="ew-card">
              <span className="ew-eyebrow">By channel</span>
              <div className="ew-bar-chart" aria-hidden="true">
                {channels.map(ch => {
                  const count = channelCounts[ch] || 0
                  if (!count) return null
                  return (
                    <span
                      key={ch}
                      style={{
                        width: `${(count / barTotal) * 100}%`,
                        background: CH_META[ch].color,
                        display: 'block',
                      }}
                    />
                  )
                })}
              </div>
              {channels.map(ch => (
                <div key={ch} className="ew-channel-row">
                  <span className="ew-channel-name">
                    <ChannelLogo channel={ch} size={20} />
                    {CH_META[ch].name}
                  </span>
                  <span className="ew-channel-count">{channelCounts[ch] || 0} attendees</span>
                </div>
              ))}
            </div>

            <div className="ew-card">
              <span className="ew-eyebrow">Unified attendee list</span>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
                ↻ deduped by email · capacity syncs across channels
              </div>
              {attendees.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: 14, margin: '12px 0' }}>
                  No registrations yet. Bookings on any channel will appear here automatically.
                </p>
              ) : (
                attendees.map(a => (
                  <div key={a.email} className="ew-att">
                    <div className="who">
                      <span className="ava">
                        {a.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </span>
                      <div>
                        <div className="nm">{a.name}</div>
                        <div className="ew-srcs">
                          <span>
                            <Swatch color={CH_META[a.source].color} size={7} />
                            {CH_META[a.source].name}
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className="ew-text-success" style={{ fontSize: 12 }}>✓ Registered</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="ew-foot">
            <div className="ew-foot-actions">
              <Link href="/events" className="ew-btn ghost">← Back to events</Link>
              {onRefresh && (
                <button
                  type="button"
                  className="ew-btn primary"
                  onClick={onRefresh}
                  disabled={loading}
                >
                  {loading ? <InlineLoader label="Refreshing" /> : '↻ Refresh'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
