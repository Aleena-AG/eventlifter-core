const EVENT_IMAGES = [
  'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?auto=format&fit=crop&w=400&q=70',
  'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=400&q=70',
  'https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?auto=format&fit=crop&w=400&q=70',
  'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=400&q=70',
  'https://images.unsplash.com/photo-1603910234616-3b5f4a6be2b4?auto=format&fit=crop&w=400&q=70',
]

const PLATFORMS = [
  { name: 'Eventbrite', color: 'var(--rust)' },
  { name: 'Luma', color: 'var(--plum)' },
  { name: 'Hightribe', color: 'var(--honey)' },
]

const HIGHLIGHTS = [
  'Publish to every platform in one click',
  'Real-time capacity sync — no double bookings',
  'All attendees in one unified list',
]

export function AuthShowcase() {
  return (
    <aside className="auth-showcase" aria-hidden="true">
      <div className="auth-showcase-glow auth-showcase-glow--1" />
      <div className="auth-showcase-glow auth-showcase-glow--2" />

      <div className="auth-showcase-content">
        <div className="auth-showcase-eyebrow">Create once · publish everywhere</div>
        <h2 className="auth-showcase-title">
          Your events deserve a bigger audience.
        </h2>
        <p className="auth-showcase-lead">
          Ewentcast broadcasts your event to Eventbrite, Luma, and Hightribe — and keeps every seat in sync.
        </p>

        <div className="auth-showcase-chips">
          {PLATFORMS.map((p) => (
            <span key={p.name} className="auth-showcase-chip">
              <span className="auth-showcase-chip-dot" style={{ background: p.color }} />
              {p.name}
            </span>
          ))}
        </div>

        <ul className="auth-showcase-list">
          {HIGHLIGHTS.map((item) => (
            <li key={item}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M5 13l4 4L19 7"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {item}
            </li>
          ))}
        </ul>

        <div className="auth-showcase-stats">
          <div>
            <strong>3</strong>
            <span>platforms synced</span>
          </div>
          <div>
            <strong>1</strong>
            <span>shared capacity pool</span>
          </div>
          <div>
            <strong>$20</strong>
            <span>per month</span>
          </div>
        </div>
      </div>

      <div className="auth-showcase-marquee">
        <div className="auth-showcase-track">
          {[...EVENT_IMAGES, ...EVENT_IMAGES].map((src, i) => (
            <img key={i} src={src} alt="" loading="lazy" />
          ))}
        </div>
      </div>
    </aside>
  )
}
