'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { isAuthenticated } from '@/lib/auth'
import { EWENTCAST_WORDMARK } from '@/lib/brand'
import { ChannelLogo } from '@/components/ChannelLogo'
import type { ChannelKey } from '@/lib/types'

import { CHANNEL_META } from '@/lib/channels'

const PLATFORM_ORDER: ChannelKey[] = ['hightribe', 'luma', 'eventbrite']
const PLATFORMS_COPY = 'Hightribe, Luma, and Eventbrite'

function channelCssVar(key: ChannelKey) {
  if (key === 'hightribe') return 'honey'
  if (key === 'luma') return 'plum'
  return 'rust'
}

const CHANNEL_STATS: { key: ChannelKey; sold: number; width: string }[] = [
  { key: 'hightribe', sold: 45, width: '43%' },
  { key: 'luma', sold: 25, width: '24%' },
  { key: 'eventbrite', sold: 35, width: '33%' },
]

const MARQUEE_IMAGES = [
  'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=520&q=70',
  'https://images.unsplash.com/photo-1603910234616-3b5f4a6be2b4?auto=format&fit=crop&w=520&q=70',
  'https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?auto=format&fit=crop&w=520&q=70',
  'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=520&q=70',
  'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?auto=format&fit=crop&w=520&q=70',
]

const METRICS = [
  { value: '3', label: 'Platforms synced' },
  { value: '1', label: 'Shared capacity pool' },
  { value: '0', label: 'Double bookings' },
  { value: '$20', label: 'Per month flat' },
]

const EVENT_TYPES = [
  { label: 'Workshops', emoji: '🛠', desc: 'Hands-on sessions with limited seats' },
  { label: 'Meetups', emoji: '🤝', desc: 'Community nights and networking' },
  { label: 'Conferences', emoji: '🎤', desc: 'Multi-day programs and keynotes' },
  { label: 'Festivals', emoji: '🎪', desc: 'Large crowds across ticket tiers' },
  { label: 'Classes', emoji: '📚', desc: 'Recurring cohorts and courses' },
  { label: 'Pop-ups', emoji: '✨', desc: 'One-night launches and drops' },
]

const BENEFITS = [
  { title: 'Publish everywhere at once', desc: `One event live on ${PLATFORMS_COPY} in seconds — not three separate forms.`, icon: 'cast' },
  { title: 'More bookings, no oversell', desc: "Reach every platform's audience at once while one shared capacity makes double-booking impossible.", icon: 'shield' },
  { title: 'One attendee list', desc: 'Every signup from every platform, merged and deduplicated. No stitching spreadsheets the night before.', icon: 'list' },
  { title: 'One revenue number', desc: 'Total sales across all channels in a single figure, with a clean per-platform breakdown.', icon: 'revenue' },
  { title: 'Update once, sync everywhere', desc: 'Change the time or venue once. Ewentcast pushes it to every platform automatically.', icon: 'sync' },
  { title: 'See what fills the room', desc: 'Per-channel signups show which platform actually drives attendance — so you spend effort where it pays.', icon: 'chart' },
]

const FOOTER_LINKS = {
  product: [
    { href: '#how', label: 'How it works' },
    { href: '#bookings', label: 'Capacity sync' },
    { href: '#benefits', label: 'Benefits' },
    { href: '#pricing', label: 'Pricing' },
    { href: '#faq', label: 'FAQ' },
  ],
  account: [
    { href: '/login', label: 'Sign in' },
    { href: '/signup', label: 'Create account' },
    { href: '/login', label: 'Start free trial' },
  ],
}

const NAV_LINKS = [
  { href: '#how', label: 'How it works' },
  { href: '#bookings', label: 'More bookings' },
  { href: '#benefits', label: 'Benefits' },
  { href: '#events', label: 'Event types' },
  { href: '#pricing', label: 'Pricing' },
]

const FAQ_ITEMS = [
  {
    q: 'Which platforms does it publish to?',
    a: `${PLATFORMS_COPY} today, with two-way sync — your event goes out and bookings come back. Hightribe is built in natively; Luma and Eventbrite connect in one click. More channels are on the way.`,
    open: true,
  },
  {
    q: 'How does it stop overbooking?',
    a: 'Your event has one shared pool of seats. The moment a ticket sells on any platform, Ewentcast updates the remaining count everywhere else — so the same seat can never be sold twice.',
  },
  {
    q: 'Do I need accounts on those platforms?',
    a: `Yes. Hightribe is your native home base — connect Luma and Eventbrite once in your profile, and every event reuses them. (Luma's API requires a Luma Plus plan on their side.)`,
  },
  {
    q: 'How does the free trial work?',
    a: "14 days free, no credit card to start. Connect your platforms and publish real events during the trial. Keep going and it's $20/month — cancel anytime.",
  },
  {
    q: 'What happens to my attendees?',
    a: 'Every signup from every platform lands in one list, deduplicated by email — so a person who registers on two platforms shows up once, not twice.',
  },
]

function PlatformChips({ featured }: { featured?: boolean }) {
  return (
    <>
      {PLATFORM_ORDER.map((key) => (
        <span
          key={key}
          className={`chip${featured && key === 'hightribe' ? ' chip--featured' : ''}`}
        >
          <span className="sw" style={{ background: `var(--${channelCssVar(key)})` }} />
          {CHANNEL_META[key].name}
          {featured && key === 'hightribe' && <span className="chip-badge">Native</span>}
        </span>
      ))}
    </>
  )
}

function LandingLogo({ className }: { className?: string }) {
  return (
    <img
      src={EWENTCAST_WORDMARK}
      alt="Ewentcast"
      className={['landing-logo', className].filter(Boolean).join(' ')}
    />
  )
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 13l4 4L19 7" stroke="#4E7A4B" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function BenefitIcon({ name }: { name: string }) {
  const props = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true as const }
  switch (name) {
    case 'cast':
      return <svg {...props}><path d="M4 12h8m0 0-3-3m3 3-3 3M12 6h8M12 18h8" stroke="#B66F1C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'shield':
      return <svg {...props}><path d="M12 3 20 7v6c0 4-3.5 7-8 8-4.5-1-8-4-8-8V7l8-4Z" stroke="#B66F1C" strokeWidth="2" strokeLinejoin="round" /><path d="m9 12 2 2 4-4" stroke="#B66F1C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'list':
      return <svg {...props}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke="#B66F1C" strokeWidth="2" strokeLinecap="round" /></svg>
    case 'revenue':
      return <svg {...props}><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke="#B66F1C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'sync':
      return <svg {...props}><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" stroke="#B66F1C" strokeWidth="2" strokeLinecap="round" /><path d="M3 3v5h5M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" stroke="#B66F1C" strokeWidth="2" strokeLinecap="round" /><path d="M16 16h5v5" stroke="#B66F1C" strokeWidth="2" strokeLinecap="round" /></svg>
    default:
      return <svg {...props}><path d="M3 3v18h18M7 16l4-4 4 4 5-6" stroke="#B66F1C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
  }
}

function EventPreviewCard({ className, variant = 'default' }: { className?: string; variant?: 'default' | 'showcase' }) {
  return (
    <div className={['event-preview', variant === 'showcase' && 'event-preview--showcase', className].filter(Boolean).join(' ')}>
      <div className="event-preview-cover">
        <span className="event-preview-price">$25 · General</span>
      </div>
      <div className="event-preview-body">
        <div className="event-preview-meta">
          <span className="event-preview-date">Sat, Jul 12 · 7:00 PM</span>
          <span className="event-preview-live"><span className="pulse-dot" /> Live on 3 channels</span>
        </div>
        <h3>Summer Rooftop Mixer</h3>
        <p>Downtown Arts District · 150 seats</p>
        <div className="event-preview-channels">
          {CHANNEL_STATS.map(({ key, sold }) => (
            <span key={key} className="event-preview-channel">
              <span className="event-preview-channel-label">
                <ChannelLogo channel={key} size={22} />
                {CHANNEL_META[key].name}
              </span>
              <span>{sold} sold</span>
            </span>
          ))}
        </div>
        <div className="event-preview-bar-wrap">
          <div className="event-preview-bar-labels">
            <span>105 sold</span>
            <span>70% full</span>
          </div>
          <div className="event-preview-bar">
            <span style={{ width: '70%' }} />
          </div>
        </div>
        <div className="event-preview-foot">
          <span className="event-preview-synced"><span className="pulse-dot" /> 45 left · synced everywhere</span>
          <span className="event-preview-revenue">$2,625</span>
        </div>
      </div>
    </div>
  )
}

function DashboardShowcase() {
  return (
    <div className="dash-showcase">
      <div className="dash-showcase-panel">
        <div className="dash-showcase-chrome">
          <span className="dash-showcase-dots" aria-hidden="true">
            <i /><i /><i />
          </span>
          <span className="dash-showcase-title">Ewentcast · Dashboard</span>
          <span className="dash-showcase-status"><span className="pulse-dot" /> All synced</span>
        </div>
        <div className="dash-showcase-body">
          <div className="dash-showcase-head">
            <div>
              <div className="eyebrow">One dashboard</div>
              <h2>Every event, every channel — in one view.</h2>
            </div>
            <div className="dash-showcase-event-pill">Summer Rooftop Mixer</div>
          </div>

          <div className="dash-kpis">
            <div className="dash-kpi">
              <span className="dash-kpi-label">Attendees</span>
              <strong>105</strong>
              <span className="dash-kpi-sub">103 unique · 2 merged</span>
            </div>
            <div className="dash-kpi">
              <span className="dash-kpi-label">Revenue</span>
              <strong>$2,625</strong>
              <span className="dash-kpi-sub">across 3 channels</span>
            </div>
            <div className="dash-kpi">
              <span className="dash-kpi-label">Capacity</span>
              <strong>70%</strong>
              <span className="dash-kpi-sub">105 of 150</span>
            </div>
            <div className="dash-kpi">
              <span className="dash-kpi-label">Channels</span>
              <strong>3</strong>
              <span className="dash-kpi-sub">all synced</span>
            </div>
          </div>

          <div className="dash-channel-panel">
            <div className="dash-channel-head">
              <span>Bookings by channel</span>
              <span>105 total</span>
            </div>
            <div className="bar bar--showcase">
              {CHANNEL_STATS.map(({ key, width }) => (
                <span key={key} style={{ width, background: `var(--${channelCssVar(key)})` }} />
              ))}
            </div>
            <div className="dash-channel-rows">
              {CHANNEL_STATS.map(({ key, sold }) => (
                <div className="dash-channel-row" key={key}>
                  <span className="dash-channel-name">
                    <ChannelLogo channel={key} size={24} />
                    {CHANNEL_META[key].name}
                  </span>
                  <div className="dash-channel-track">
                    <span className="dash-channel-fill" style={{ width: `${(sold / 105) * 100}%`, background: `var(--${channelCssVar(key)})` }} />
                  </div>
                  <span className="dash-channel-count">{sold}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="dash-activity">
            <span className="dash-activity-label">Latest</span>
            <div className="dash-activity-item">
              <ChannelLogo channel="hightribe" size={20} />
              <span>New ticket · Maya Chen · via Hightribe</span>
              <time>2m ago</time>
            </div>
          </div>
        </div>
      </div>

      <EventPreviewCard variant="showcase" />
    </div>
  )
}

const HERO_CHANNELS: { key: ChannelKey; sold: number; label: string; accent: string }[] = [
  { key: 'hightribe', sold: 45, label: 'Hightribe', accent: CHANNEL_META.hightribe.color },
  { key: 'luma', sold: 25, label: 'Luma', accent: CHANNEL_META.luma.color },
  { key: 'eventbrite', sold: 35, label: 'Eventbrite', accent: CHANNEL_META.eventbrite.color },
]

const HERO_TOTAL_SOLD = 105
const HERO_REVENUE = 2625
const HERO_TICKET_PRICE = 25
const HERO_CAPACITY = 150

function heroChannelSaleBonus(saleCount: number, channelIndex: number) {
  if (saleCount <= 0) return 0
  return Math.floor((saleCount + 2 - channelIndex) / 3)
}

function heroLastSaleChannel(saleCount: number): ChannelKey {
  return PLATFORM_ORDER[(saleCount - 1) % PLATFORM_ORDER.length]
}

function useCountUp(target: number, duration = 1400, start = false) {
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!start) {
      setValue(0)
      return
    }

    let frame = 0
    let startTime: number | null = null

    const step = (timestamp: number) => {
      if (startTime === null) startTime = timestamp
      const progress = Math.min((timestamp - startTime) / duration, 1)
      const eased = 1 - (1 - progress) ** 3
      setValue(Math.round(eased * target))
      if (progress < 1) frame = requestAnimationFrame(step)
    }

    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target, duration, start])

  return value
}

function formatHeroRevenue(value: number) {
  return `$${value.toLocaleString()}`
}

function HeroEventCard() {
  const [active, setActive] = useState(false)
  const [saleNotice, setSaleNotice] = useState(0)
  const [salePulse, setSalePulse] = useState(false)

  useEffect(() => {
    const mountTimer = window.setTimeout(() => setActive(true), 120)
    return () => window.clearTimeout(mountTimer)
  }, [])

  useEffect(() => {
    if (!active) return

    const flash = () => setSaleNotice((n) => n + 1)

    const first = window.setTimeout(flash, 2400)
    const loop = window.setInterval(flash, 6200)

    return () => {
      window.clearTimeout(first)
      window.clearInterval(loop)
    }
  }, [active])

  useEffect(() => {
    if (saleNotice === 0) return
    setSalePulse(true)
    const timer = window.setTimeout(() => setSalePulse(false), 1400)
    return () => window.clearTimeout(timer)
  }, [saleNotice])

  const totalSold = useCountUp(HERO_TOTAL_SOLD, 1500, active)
  const revenue = useCountUp(HERO_REVENUE, 1600, active)
  const hightribeSold = useCountUp(HERO_CHANNELS[0].sold, 1300, active)
  const lumaSold = useCountUp(HERO_CHANNELS[1].sold, 1300, active)
  const eventbriteSold = useCountUp(HERO_CHANNELS[2].sold, 1300, active)

  const displayTotal = totalSold + saleNotice
  const lastSaleChannel = saleNotice > 0 ? heroLastSaleChannel(saleNotice) : null
  const displayChannelSold = HERO_CHANNELS.map((_, index) => {
    const base = [hightribeSold, lumaSold, eventbriteSold][index]
    return base + heroChannelSaleBonus(saleNotice, index)
  })
  const displayCapacity = displayTotal > 0
    ? Math.min(100, Math.round((displayTotal / HERO_CAPACITY) * 100))
    : 0
  const displayRevenue = revenue + saleNotice * HERO_TICKET_PRICE
  const seatsLeft = Math.max(HERO_CAPACITY - displayTotal, 0)
  const bumpClass = salePulse ? 'hec-count-bump' : ''

  return (
    <div className={`hec${active ? ' hec--active' : ''}${salePulse ? ' hec--sale' : ''}`}>
      {saleNotice > 0 && lastSaleChannel && (
        <div key={saleNotice} className="hec-toast hec-toast--visible">
          <ChannelLogo channel={lastSaleChannel} size={20} />
          <span><strong>+1 ticket</strong> just sold on {CHANNEL_META[lastSaleChannel].name}</span>
        </div>
      )}

      <div className="hec-cover">
        <div className="hec-cover-mesh" />
        <div className="hec-cover-top">
          <span className="hec-tag hec-tag--price">$25 · General admission</span>
          <span className="hec-tag hec-tag--sync"><span className="pulse-dot" /> Synced live</span>
        </div>
      </div>

      <div className="hec-capacity-ring" aria-hidden="true">
          <svg viewBox="0 0 56 56">
            <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="5" />
            <circle
              cx="28"
              cy="28"
              r="22"
              fill="none"
              stroke="url(#hecRingGrad)"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={`${(displayCapacity / 100) * 138.2} 138.2`}
              transform="rotate(-90 28 28)"
              className="hec-capacity-ring-fill"
            />
            <defs>
              <linearGradient id="hecRingGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#F9B233" />
                <stop offset="100%" stopColor="#FF5A4E" />
              </linearGradient>
            </defs>
          </svg>
          <span>{displayCapacity}%</span>
        </div>

      <div className="hec-body">
        <div className="hec-meta">
          <span>Sat, Jul 12 · 7:00 PM</span>
          <span className="hec-live"><span className="pulse-dot" /> 3 channels</span>
        </div>
        <h3 className="hec-title">Summer Rooftop Mixer</h3>
        <p className="hec-sub">Downtown Arts District · 150 seats</p>

        <div className="hec-channel-grid">
          {HERO_CHANNELS.map(({ key, label, accent }, index) => (
            <div
              className={`hec-channel${key === 'hightribe' ? ' hec-channel--featured' : ''}`}
              key={key}
              style={{ '--hec-accent': accent, animationDelay: `${0.4 + index * 0.1}s` } as CSSProperties}
            >
              <ChannelLogo channel={key} size={26} />
              <span className="hec-channel-name">{label}</span>
              <strong className={['hec-channel-sold', key === lastSaleChannel && bumpClass].filter(Boolean).join(' ')}>
                {displayChannelSold[index]}
              </strong>
              <span className="hec-channel-unit">sold</span>
              {salePulse && key === lastSaleChannel && (
                <span className="hec-channel-plus" key={saleNotice}>+1</span>
              )}
            </div>
          ))}
        </div>

        <div className="hec-progress">
          <div className="hec-progress-head">
            <span><strong className={bumpClass || undefined}>{displayTotal}</strong> tickets sold</span>
            <span><strong>{displayCapacity}%</strong> full · <strong>{seatsLeft}</strong> left</span>
          </div>
          <div className="hec-progress-track">
            <span
              className="hec-progress-fill"
              style={{ width: `${(displayTotal / HERO_CAPACITY) * 100}%` }}
            />
          </div>
        </div>

        <div className="hec-footer">
          <div className="hec-footer-stat">
            <span className="hec-footer-label">Revenue</span>
            <strong className={bumpClass || undefined}>{formatHeroRevenue(displayRevenue)}</strong>
          </div>
          <div className="hec-footer-divider" />
          <div className="hec-footer-stat hec-footer-stat--sync">
            <span className="hec-footer-label">Status</span>
            <strong><span className="pulse-dot" /> All platforms synced</strong>
          </div>
        </div>
      </div>
    </div>
  )
}

function HeroMockup() {
  return (
    <div className="hero-mockup" aria-hidden="true">
      <div className="hero-mockup-glow" />
      <HeroEventCard />
    </div>
  )
}

function CastDiagram() {
  return (
    <svg viewBox="0 0 460 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label={`One event broadcasting to ${PLATFORMS_COPY}`}>
      <g fill="none" strokeLinecap="round">
        <path d="M150 180 C 230 120, 270 90, 350 84" stroke="#E8DFD0" strokeWidth="6" />
        <path d="M150 180 C 240 180, 270 180, 350 180" stroke="#E8DFD0" strokeWidth="6" />
        <path d="M150 180 C 230 240, 270 270, 350 276" stroke="#E8DFD0" strokeWidth="6" />
        <path className="signal" d="M150 180 C 230 120, 270 90, 350 84" stroke="#D98A2B" strokeWidth="3" />
        <path className="signal" d="M150 180 C 240 180, 270 180, 350 180" stroke="#D98A2B" strokeWidth="3" />
        <path className="signal" d="M150 180 C 230 240, 270 270, 350 276" stroke="#D98A2B" strokeWidth="3" />
      </g>
      <g className="pulse">
        <circle cx="92" cy="180" r="58" fill="#D98A2B" opacity="0.14" />
      </g>
      <circle cx="92" cy="180" r="44" fill="#211B16" />
      <text x="92" y="174" textAnchor="middle" fill="#C9A86B" fontFamily="Inter, sans-serif" fontSize="9" fontWeight="700" letterSpacing="1.5">YOUR</text>
      <text x="92" y="190" textAnchor="middle" fill="#fff" fontFamily="Inter, sans-serif" fontSize="13" fontWeight="700">EVENT</text>
      <g fontFamily="Inter, sans-serif" fontSize="13" fontWeight="600">
        <rect x="350" y="62" width="98" height="44" rx="12" fill="#fff" stroke="#E8DFD0" />
        <circle cx="368" cy="84" r="6" fill={CHANNEL_META.hightribe.color} />
        <text x="382" y="88" fill="#211B16">Hightribe</text>
        <rect x="350" y="158" width="98" height="44" rx="12" fill="#fff" stroke="#E8DFD0" />
        <circle cx="368" cy="180" r="6" fill={CHANNEL_META.luma.color} />
        <text x="382" y="184" fill="#211B16">Luma</text>
        <rect x="350" y="254" width="98" height="44" rx="12" fill="#fff" stroke="#E8DFD0" />
        <circle cx="368" cy="276" r="6" fill={CHANNEL_META.eventbrite.color} />
        <text x="382" y="280" fill="#211B16">Eventbrite</text>
      </g>
    </svg>
  )
}

export function LandingPage() {
  const router = useRouter()
  const [promoOpen, setPromoOpen] = useState(false)
  const [promoCode, setPromoCode] = useState('')
  const [promoMsg, setPromoMsg] = useState('')
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    if (isAuthenticated()) router.replace('/dashboard')
  }, [router])

  useEffect(() => {
    document.documentElement.style.scrollBehavior = 'smooth'
    return () => { document.documentElement.style.scrollBehavior = '' }
  }, [])

  useEffect(() => {
    if (!navOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [navOpen])

  const applyPromo = () => {
    const v = promoCode.trim()
    if (!v) return
    setPromoMsg(`Code "${v.toUpperCase()}" will be applied at checkout.`)
  }

  const closeNav = () => setNavOpen(false)

  return (
    <div className="landing">
      <nav className={navOpen ? 'nav-open' : undefined}>
        <div className="wrap nav-in">
          <a className="brand" href="#top" onClick={closeNav}>
            <LandingLogo />
          </a>
          <div className="nav-links">
            {NAV_LINKS.map(({ href, label }) => (
              <a key={href} href={href} onClick={closeNav}>{label}</a>
            ))}
          </div>
          <div className="nav-cta">
            <Link className="btn btn-ghost" href="/login">Sign in</Link>
            <Link className="btn btn-primary" href="/login">Start free trial</Link>
          </div>
          <button
            type="button"
            className="nav-toggle"
            aria-expanded={navOpen}
            aria-label={navOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setNavOpen((o) => !o)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
        <div className="nav-mobile">
          <div className="nav-mobile-links">
            {NAV_LINKS.map(({ href, label }) => (
              <a key={href} href={href} className="nav-mobile-link" onClick={closeNav}>
                {label}
              </a>
            ))}
          </div>
          <div className="nav-mobile-cta">
            <Link className="btn btn-ghost" href="/login" onClick={closeNav}>Sign in</Link>
            <Link className="btn btn-primary" href="/signup" onClick={closeNav}>Start free trial</Link>
          </div>
        </div>
      </nav>

      <header className="hero" id="top">
        <div className="hero-bg" />
        <div className="wrap hero-layout">
          <div className="hero-in">
            <div className="hero-reveal hero-reveal--1 eyebrow">Create once · publish everywhere</div>
            <h1 className="hero-reveal hero-reveal--2">Get booked everywhere. Oversold nowhere.</h1>
            <p className="lead hero-reveal hero-reveal--3">
              Ewentcast publishes your event to {PLATFORMS_COPY} at once — and keeps capacity in sync across all of them. Fill more seats, never double-book the room.
            </p>
            <div className="cta-row hero-reveal hero-reveal--4">
              <Link className="btn btn-primary" href="/login">Start your 14-day free trial</Link>
              <a className="btn btn-light" href="#how">See how it works</a>
            </div>
            <div className="trust hero-reveal hero-reveal--5">
              <span>14-day free trial</span><span className="tdot" />
              <span>No credit card to start</span><span className="tdot" />
              <span>$20/mo after</span>
            </div>
          </div>
          <HeroMockup />
        </div>
      </header>

      <div className="metrics-bar">
        <div className="wrap metrics-in">
          {METRICS.map(({ value, label }) => (
            <div className="metric" key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="strip">
        <div className="wrap strip-in">
          <span className="label">Publishes to</span>
          <div className="strip-chips">
            <PlatformChips featured />
          </div>
          <span className="strip-note">Two-way sync · more channels coming</span>
        </div>
      </div>

      <div className="marquee" aria-hidden="true">
        <div className="m-track">
          {[...MARQUEE_IMAGES, ...MARQUEE_IMAGES].map((src, i) => (
            <img key={i} src={src} alt="" loading="lazy" />
          ))}
        </div>
      </div>

      <section className="band" id="how">
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">How it works</div>
            <h2 className="section-title">Three steps. No copy-pasting.</h2>
            <p>Build your event once. Ewentcast formats it for each platform, posts it, and keeps everything in sync.</p>
          </div>
          <div className="how-grid">
            <div className="steps">
              {[
                { n: '1', title: 'Create once', desc: 'Enter your event a single time — title, time, venue, tickets, the works. This is your source of truth.' },
                { n: '2', title: 'Cast everywhere', desc: `Hit publish. Your event goes live on ${PLATFORMS_COPY} at the same moment.` },
                { n: '3', title: 'Track in one place', desc: 'Bookings, revenue, and remaining seats flow back into one dashboard — deduped and totalled.' },
              ].map(({ n, title, desc }) => (
                <div className="step" key={n}>
                  <span className="num">{n}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="cast"><CastDiagram /></div>
          </div>
        </div>
      </section>

      <section className="band band--paper" id="compare">
        <div className="wrap">
          <div className="section-head center">
            <div className="eyebrow">The old way vs Ewentcast</div>
            <h2 className="section-title">Stop juggling five tabs before every event.</h2>
          </div>
          <div className="compare-grid">
            <div className="compare-card compare-card--old">
              <h3>Without Ewentcast</h3>
              <ul>
                <li>Copy the same details into 3 platform forms</li>
                <li>Manually update capacity on each site</li>
                <li>Merge attendee spreadsheets by hand</li>
                <li>Risk selling the same seat twice</li>
                <li>No idea which channel drives signups</li>
              </ul>
            </div>
            <div className="compare-card compare-card--new">
              <h3>With Ewentcast</h3>
              <ul>
                <li>One event form → live everywhere instantly</li>
                <li>Shared capacity syncs in real time</li>
                <li>One deduplicated attendee list</li>
                <li>Overbooking prevented automatically</li>
                <li>Per-channel analytics in one dashboard</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="band" id="bookings">
        <div className="wrap">
          <div className="book">
            <div>
              <div className="eyebrow">More bookings, zero overbooking</div>
              <h2 className="section-title section-title--lg">List on every platform. Sell every seat. Never twice.</h2>
              <p className="section-lead">
                The more places your event lives, the more bookings you get — but listing everywhere usually risks selling the same seat twice. Ewentcast keeps one shared capacity across all your platforms. The instant a ticket sells anywhere, every other platform knows.
              </p>
              <div className="section-cta">
                <Link className="btn btn-primary" href="/login">Start filling more seats</Link>
              </div>
            </div>
            <div className="cap-card">
              <div className="top">
                <div>
                  <div className="eyebrow">Live capacity</div>
                  <div className="cap-num">
                    47 <span className="cap-denom">of 150 left</span>
                  </div>
                </div>
                <div className="synced"><span className="pulse-dot" /> Synced</div>
              </div>
              <div className="cap-rows">
                {PLATFORM_ORDER.map((key) => (
                  <div className="cap-row" key={key}>
                    <span className="left"><span className="sw" style={{ background: `var(--${channelCssVar(key)})` }} />{CHANNEL_META[key].name}</span>
                    <span className="synced"><span className="pulse-dot" />47 left</span>
                  </div>
                ))}
              </div>
              <p className="cap-note">
                One pool of seats. The moment one sells on any platform, the others update — automatically.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="band band--paper" id="benefits">
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">Why hosts switch</div>
            <h2 className="section-title">Stop building the same event five times.</h2>
            <p>Listing everywhere shouldn&apos;t mean five forms to fill, five guest lists to merge, and five places to update. Ewentcast collapses it into one.</p>
          </div>
          <div className="benefits">
            {BENEFITS.map(({ title, desc, icon }) => (
              <div className="bcard" key={title}>
                <div className="ic"><BenefitIcon name={icon} /></div>
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="band" id="events">
        <div className="wrap">
          <div className="section-head center">
            <div className="eyebrow">Built for real events</div>
            <h2 className="section-title">Whatever you&apos;re hosting, cast it once.</h2>
            <p className="section-lead section-lead--center">
              From intimate workshops to sold-out festivals — one event form, published everywhere, with capacity that stays honest across every platform.
            </p>
          </div>
          <div className="event-types">
            {EVENT_TYPES.map(({ label, emoji, desc }) => (
              <div className="event-type" key={label}>
                <span className="event-type-emoji" aria-hidden="true">{emoji}</span>
                <h3>{label}</h3>
                <p>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="band band--paper" id="dashboard">
        <div className="wrap">
          <DashboardShowcase />
        </div>
      </section>

      <section className="band" id="pricing">
        <div className="wrap">
          <div className="price-layout">
            <div className="price-aside">
              <div className="eyebrow">Pricing</div>
              <h2 className="section-title">One simple plan. Everything included.</h2>
              <p className="section-lead">
                Start free for two weeks — connect your platforms and publish your first real event before you pay a cent.
              </p>
              <ul className="price-aside-list">
                <li><CheckIcon /> Unlimited events, no per-ticket fees</li>
                <li><CheckIcon /> All three platforms included</li>
                <li><CheckIcon /> Real-time capacity sync</li>
                <li><CheckIcon /> Cancel anytime</li>
              </ul>
            </div>
            <div className="price">
              <span className="tag">14-day free trial</span>
              <div className="amt"><span className="num">$20</span><span className="per">/month</span></div>
              <div className="sub">billed monthly · cancel anytime</div>
              <ul>
                <li><CheckIcon /> Unlimited events</li>
                <li><CheckIcon /> Publish to Hightribe, Luma &amp; Eventbrite</li>
                <li><CheckIcon /> Shared capacity — never oversell</li>
                <li><CheckIcon /> Unified, deduplicated attendee list</li>
                <li><CheckIcon /> One revenue dashboard, by channel</li>
                <li><CheckIcon /> Update once, syncs everywhere</li>
              </ul>

              <div className={`promo${promoOpen ? ' open' : ''}`}>
                <button className="toggle" type="button" onClick={() => setPromoOpen((o) => !o)}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2a2 2 0 0 1-.6-1.4V5a2 2 0 0 1 2-2h6.9a2 2 0 0 1 1.4.6l7.5 7.5a2 2 0 0 1 0 2.8Z" stroke="#B66F1C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="7.5" cy="7.5" r="1.5" fill="#B66F1C" />
                  </svg>
                  Have a promo code?
                </button>
                <div className="field">
                  <input
                    type="text"
                    placeholder="ENTER CODE"
                    aria-label="Promo code"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value)}
                  />
                  <button className="apply" type="button" onClick={applyPromo}>Apply</button>
                </div>
                {promoMsg && <div className="msg show">{promoMsg}</div>}
              </div>

              <Link className="btn btn-primary price-btn" href="/login">Start your free trial</Link>
              <div className="fine">No credit card required to start.</div>
            </div>
          </div>
        </div>
      </section>

      <section className="band band--paper" id="faq">
        <div className="wrap">
          <div className="faq-layout">
            <div className="section-head">
              <div className="eyebrow">Questions</div>
              <h2 className="section-title">Good to know.</h2>
              <p>Everything event hosts ask before they cast their first event.</p>
            </div>
            <div className="faq">
              {FAQ_ITEMS.map(({ q, a, open }) => (
                <details key={q} open={open}>
                  <summary>{q}<span className="plus">+</span></summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="final">
        <div className="final-bg" />
        <div className="wrap final-in">
          <div className="eyebrow">Ready when you are</div>
          <h2>Your next event deserves every seat filled.</h2>
          <p>Create once, publish to {PLATFORMS_COPY} — and watch bookings roll in without the overbooking risk.</p>
          <div className="final-types" aria-hidden="true">
            {EVENT_TYPES.slice(0, 4).map(({ label, emoji }) => (
              <span key={label} className="final-type-pill">{emoji} {label}</span>
            ))}
          </div>
          <div className="final-cta">
            <Link className="btn btn-primary" href="/login">Start your 14-day free trial</Link>
            <Link className="btn btn-light" href="/signup">Create free account</Link>
          </div>
          <div className="final-trust">
            <span>14-day free trial</span><span className="tdot" />
            <span>No credit card to start</span><span className="tdot" />
            <span>Cancel anytime</span>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap foot-grid">
          <div className="foot-brand">
            <div className="brand brand--footer">
              <LandingLogo />
            </div>
            <p>Create once. Publish everywhere. Keep every seat in sync.</p>
            <div className="foot-platforms">
              <PlatformChips />
            </div>
          </div>
          <div className="foot-nav">
            <div className="foot-col">
              <h4>Product</h4>
              <ul>
                {FOOTER_LINKS.product.map(({ href, label }) => (
                  <li key={label}><a href={href}>{label}</a></li>
                ))}
              </ul>
            </div>
            <div className="foot-col">
              <h4>Account</h4>
              <ul>
                {FOOTER_LINKS.account.map(({ href, label }) => (
                  <li key={label}><Link href={href}>{label}</Link></li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <div className="wrap foot-bottom">
          <span>© 2026 Ewentcast</span>
          <span>Create once · Publish everywhere</span>
        </div>
      </footer>
    </div>
  )
}
