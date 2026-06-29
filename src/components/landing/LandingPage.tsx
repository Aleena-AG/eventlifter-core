'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { isAuthenticated } from '@/lib/auth'
import { EwentcastLogo } from '@/components/EwentcastLogo'

const MARQUEE_IMAGES = [
  'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=520&q=70',
  'https://images.unsplash.com/photo-1603910234616-3b5f4a6be2b4?auto=format&fit=crop&w=520&q=70',
  'https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?auto=format&fit=crop&w=520&q=70',
  'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=520&q=70',
  'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?auto=format&fit=crop&w=520&q=70',
]

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 13l4 4L19 7" stroke="#4E7A4B" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CastDiagram() {
  return (
    <svg viewBox="0 0 460 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="One event broadcasting to Eventbrite, Luma, and Hightribe">
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
        <circle cx="368" cy="84" r="6" fill="#C2502E" />
        <text x="382" y="88" fill="#211B16">Eventbrite</text>
        <rect x="350" y="158" width="98" height="44" rx="12" fill="#fff" stroke="#E8DFD0" />
        <circle cx="368" cy="180" r="6" fill="#7C5C8A" />
        <text x="382" y="184" fill="#211B16">Luma</text>
        <rect x="350" y="254" width="98" height="44" rx="12" fill="#fff" stroke="#E8DFD0" />
        <circle cx="368" cy="276" r="6" fill="#D98A2B" />
        <text x="382" y="280" fill="#211B16">Hightribe</text>
      </g>
    </svg>
  )
}

const FAQ_ITEMS = [
  {
    q: 'Which platforms does it publish to?',
    a: 'Eventbrite, Luma, and Hightribe today, with two-way sync — your event goes out and bookings come back. More channels are on the way.',
    open: true,
  },
  {
    q: 'How does it stop overbooking?',
    a: 'Your event has one shared pool of seats. The moment a ticket sells on any platform, Ewentcast updates the remaining count everywhere else — so the same seat can never be sold twice.',
  },
  {
    q: 'Do I need accounts on those platforms?',
    a: 'Yes. You connect your existing Eventbrite, Luma, and Hightribe accounts once in your profile, and every event reuses them. (Luma\'s API requires a Luma Plus plan on their side.)',
  },
  {
    q: 'How does the free trial work?',
    a: '14 days free, no credit card to start. Connect your platforms and publish real events during the trial. Keep going and it\'s $20/month — cancel anytime.',
  },
  {
    q: 'What happens to my attendees?',
    a: 'Every signup from every platform lands in one list, deduplicated by email — so a person who registers on two platforms shows up once, not twice.',
  },
]

export function LandingPage() {
  const router = useRouter()
  const [promoOpen, setPromoOpen] = useState(false)
  const [promoCode, setPromoCode] = useState('')
  const [promoMsg, setPromoMsg] = useState('')

  useEffect(() => {
    if (isAuthenticated()) router.replace('/dashboard')
  }, [router])

  const applyPromo = () => {
    const v = promoCode.trim()
    if (!v) return
    setPromoMsg(`Code "${v.toUpperCase()}" will be applied at checkout.`)
  }

  return (
    <div className="landing">
      <nav>
        <div className="wrap nav-in">
          <a className="brand" href="#top">
            <EwentcastLogo height={30} wordmarkOnly onLight className="ewentcast-logo-band--compact" />
          </a>
          <div className="nav-links">
            <a href="#how">How it works</a>
            <a href="#bookings">More bookings</a>
            <a href="#benefits">Benefits</a>
            <a href="#pricing">Pricing</a>
          </div>
          <div className="nav-cta">
            <Link className="btn btn-ghost" href="/login">Sign in</Link>
            <Link className="btn btn-primary" href="/login">Start free trial</Link>
          </div>
        </div>
      </nav>

      <header className="hero" id="top">
        <div className="hero-bg" />
        <div className="wrap hero-in">
          <div className="eyebrow">Create once · publish everywhere</div>
          <h1>Get booked everywhere. Oversold nowhere.</h1>
          <p className="lead">
            Ewentcast publishes your event to Eventbrite, Luma, and Hightribe at once — and keeps capacity in sync across all of them. Fill more seats, never double-book the room.
          </p>
          <div className="cta-row">
            <Link className="btn btn-primary" href="/login">Start your 14-day free trial</Link>
            <a className="btn btn-light" href="#how">See how it works</a>
          </div>
          <div className="trust">
            <span>14-day free trial</span><span className="tdot" />
            <span>No credit card to start</span><span className="tdot" />
            <span>$20/mo after</span>
          </div>
        </div>
      </header>

      <div className="strip">
        <div className="wrap strip-in">
          <span className="label">Publishes to</span>
          <span className="chip"><span className="sw" style={{ background: 'var(--rust)' }} />Eventbrite</span>
          <span className="chip"><span className="sw" style={{ background: 'var(--plum)' }} />Luma</span>
          <span className="chip"><span className="sw" style={{ background: 'var(--honey)' }} />Hightribe</span>
          <span style={{ color: 'var(--muted)', fontSize: 14, marginLeft: 'auto' }}>Two-way sync · more channels coming</span>
        </div>
      </div>

      <div className="marquee" aria-hidden="true">
        <div className="m-track">
          {[...MARQUEE_IMAGES, ...MARQUEE_IMAGES].map((src, i) => (
            <img key={i} src={src} alt="" />
          ))}
        </div>
      </div>

      <section className="band" id="how">
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">How it works</div>
            <h2 style={{ marginTop: 12 }}>Three steps. No copy-pasting.</h2>
            <p>Build your event once. Ewentcast formats it for each platform, posts it, and keeps everything in sync.</p>
          </div>
          <div className="how-grid">
            <div className="steps">
              <div className="step">
                <span className="num">1</span>
                <div>
                  <h3>Create once</h3>
                  <p>Enter your event a single time — title, time, venue, tickets, the works. This is your source of truth.</p>
                </div>
              </div>
              <div className="step">
                <span className="num">2</span>
                <div>
                  <h3>Cast everywhere</h3>
                  <p>Hit publish. Your event goes live on Eventbrite, Luma, and Hightribe at the same moment.</p>
                </div>
              </div>
              <div className="step">
                <span className="num">3</span>
                <div>
                  <h3>Track in one place</h3>
                  <p>Bookings, revenue, and remaining seats flow back into one dashboard — deduped and totalled.</p>
                </div>
              </div>
            </div>
            <div className="cast"><CastDiagram /></div>
          </div>
        </div>
      </section>

      <section className="band" id="bookings" style={{ background: 'var(--paper)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div className="wrap">
          <div className="book">
            <div>
              <div className="eyebrow">More bookings, zero overbooking</div>
              <h2 style={{ fontSize: 40, marginTop: 12 }}>List on every platform. Sell every seat. Never twice.</h2>
              <p style={{ color: 'var(--body)', fontSize: 18, margin: '16px 0 0' }}>
                The more places your event lives, the more bookings you get — but listing everywhere usually risks selling the same seat twice. Ewentcast keeps one shared capacity across all your platforms. The instant a ticket sells anywhere, every other platform knows.
              </p>
              <div style={{ marginTop: 26 }}>
                <Link className="btn btn-primary" href="/login">Start filling more seats</Link>
              </div>
            </div>
            <div className="cap-card">
              <div className="top">
                <div>
                  <div className="eyebrow">Live capacity</div>
                  <div className="cap-num">
                    47 <span style={{ fontSize: 18, color: 'var(--muted)', fontWeight: 500, fontFamily: 'var(--font-sans)' }}>of 150 left</span>
                  </div>
                </div>
                <div className="synced"><span className="pulse-dot" /> Synced</div>
              </div>
              <div className="cap-rows">
                <div className="cap-row">
                  <span className="left"><span className="sw" style={{ background: 'var(--rust)' }} />Eventbrite</span>
                  <span className="synced"><span className="pulse-dot" />47 left</span>
                </div>
                <div className="cap-row">
                  <span className="left"><span className="sw" style={{ background: 'var(--plum)' }} />Luma</span>
                  <span className="synced"><span className="pulse-dot" />47 left</span>
                </div>
                <div className="cap-row">
                  <span className="left"><span className="sw" style={{ background: 'var(--honey)' }} />Hightribe</span>
                  <span className="synced"><span className="pulse-dot" />47 left</span>
                </div>
              </div>
              <p style={{ margin: '18px 0 0', fontSize: 13.5, color: 'var(--muted)' }}>
                One pool of seats. The moment one sells on any platform, the others update — automatically.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="band" id="benefits">
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">Why hosts switch</div>
            <h2 style={{ marginTop: 12 }}>Stop building the same event five times.</h2>
            <p>Listing everywhere shouldn&apos;t mean five forms to fill, five guest lists to merge, and five places to update. Ewentcast collapses it into one.</p>
          </div>
          <div className="benefits">
            {[
              { title: 'Publish everywhere at once', desc: 'One event live on Eventbrite, Luma, and Hightribe in seconds — not three separate forms.' },
              { title: 'More bookings, no oversell', desc: 'Reach every platform\'s audience at once while one shared capacity makes double-booking impossible.' },
              { title: 'One attendee list', desc: 'Every signup from every platform, merged and deduplicated. No stitching spreadsheets the night before.' },
              { title: 'One revenue number', desc: 'Total sales across all channels in a single figure, with a clean per-platform breakdown.' },
              { title: 'Update once, sync everywhere', desc: 'Change the time or venue once. Ewentcast pushes it to every platform automatically.' },
              { title: 'See what fills the room', desc: 'Per-channel signups show which platform actually drives attendance — so you spend effort where it pays.' },
            ].map(({ title, desc }) => (
              <div className="bcard" key={title}>
                <div className="ic">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M5 12h14M13 6l6 6-6 6" stroke="#B66F1C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="band" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="dash">
            <div className="eyebrow">One dashboard</div>
            <h2>Everything, pulled back into a single view.</h2>
            <div className="stats">
              <div className="stat"><div className="k">Attendees</div><div className="v">105</div><div className="s">103 unique · 2 merged</div></div>
              <div className="stat"><div className="k">Revenue</div><div className="v">$2,625</div><div className="s">across 3 channels</div></div>
              <div className="stat"><div className="k">Capacity</div><div className="v">70%</div><div className="s">105 of 150</div></div>
              <div className="stat"><div className="k">Channels</div><div className="v">3</div><div className="s">all synced</div></div>
            </div>
            <div className="bar">
              <span style={{ width: '33%', background: 'var(--honey)' }} />
              <span style={{ width: '40%', background: 'var(--rust)' }} />
              <span style={{ width: '27%', background: 'var(--plum)' }} />
            </div>
            <div style={{ display: 'flex', gap: 24, marginTop: 14, fontSize: 13.5, color: '#B6A88F', flexWrap: 'wrap' }}>
              <span><span className="sw" style={{ background: 'var(--honey)', marginRight: 6 }} />Hightribe 35</span>
              <span><span className="sw" style={{ background: 'var(--rust)', marginRight: 6 }} />Eventbrite 42</span>
              <span><span className="sw" style={{ background: 'var(--plum)', marginRight: 6 }} />Luma 28</span>
            </div>
          </div>
        </div>
      </section>

      <section className="band" id="pricing" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="section-head center">
            <div className="eyebrow">Pricing</div>
            <h2 style={{ marginTop: 12 }}>One simple plan.</h2>
            <p style={{ marginLeft: 'auto', marginRight: 'auto' }}>
              Everything Ewentcast does, one flat price. Start free for two weeks — connect your platforms and publish your first event before you pay a cent.
            </p>
          </div>
          <div className="price-wrap">
            <div className="price">
              <span className="tag">14-day free trial</span>
              <div className="amt"><span className="num">$20</span><span className="per">/month</span></div>
              <div className="sub">billed monthly · cancel anytime</div>
              <ul>
                <li><CheckIcon /> Unlimited events</li>
                <li><CheckIcon /> Publish to Eventbrite, Luma &amp; Hightribe</li>
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

              <Link className="btn btn-primary" href="/login" style={{ marginTop: 6 }}>Start your free trial</Link>
              <div className="fine">No credit card required to start.</div>
            </div>
          </div>
        </div>
      </section>

      <section className="band" id="faq" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">Questions</div>
            <h2 style={{ marginTop: 12 }}>Good to know.</h2>
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
      </section>

      <section className="final">
        <div className="final-bg" />
        <div className="wrap final-in">
          <h2>Cast your next event everywhere.</h2>
          <p>More bookings. No overbooking. One dashboard.</p>
          <Link className="btn btn-primary" href="/login" style={{ fontSize: 17, padding: '16px 30px' }}>
            Start your 14-day free trial
          </Link>
        </div>
      </section>

      <footer>
        <div className="wrap foot-in">
          <div className="brand">
            <EwentcastLogo height={26} wordmarkOnly onLight className="ewentcast-logo-band--compact" />
          </div>
          <span>© 2026 Ewentcast · Create once. Publish everywhere.</span>
        </div>
      </footer>
    </div>
  )
}
