'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { getToken, getUser, clearAuth, authHeader, type HtUser } from '@/lib/auth'
import { logoutLocal } from '@/lib/ewentcast-session'
import {
  fetchAuthMe,
  getEwentcastAccount,
  needsSubscription,
  confirmSubscriptionPayment,
  startSubscriptionCheckout,
  type EwentcastAccount,
} from '@/lib/ewentcast-session'
import { ChannelLogo } from '@/components/ChannelLogo'
import { EwentcastLogo } from '@/components/EwentcastLogo'
import { InlineLoader, PageLoader } from '@/components/Loader'

const FEATURES = [
  { icon: '✨', text: 'Publish events to Luma & Eventbrite' },
  { icon: '🔔', text: 'Real-time webhook bookings sync' },
  { icon: '📋', text: 'Unified bookings dashboard' },
  { icon: '🏔', text: 'Optional Hightribe connect for HT events' },
  { icon: '🛡', text: '14-day money-back guarantee' },
]

function SubscribeContent() {
  const router = useRouter()
  const params = useSearchParams()
  const success = params.get('success')
  const canceled = params.get('canceled')
  const sessionId = params.get('session_id')
  const [loading, setLoading] = useState(true)
  const [activating, setActivating] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [error, setError] = useState('')
  const [account, setAccount] = useState<EwentcastAccount | null>(null)
  const [user, setUser] = useState<HtUser | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)

  const refresh = async () => {
    const data = await fetchAuthMe()
    if (!data) {
      router.replace('/login?reason=session')
      return false
    }
    setAccount(data.ewentcast)
    setUser(data.user)
    return true
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login')
      return
    }
    refresh().finally(() => setLoading(false))
  }, [router])

  useEffect(() => {
    if (success !== '1') return

    let cancelled = false

    const finishPayment = async () => {
      setActivating(true)
      setError('')

      try {
        if (sessionId) {
          await confirmSubscriptionPayment(sessionId)
        }
      } catch (err) {
        if (err instanceof Error && err.message === 'SESSION_EXPIRED') {
          router.replace('/login?reason=session')
          return
        }
      }

      for (let attempt = 0; attempt < 12; attempt++) {
        if (cancelled) return
        const ok = await refresh()
        if (!ok) return
        if (!needsSubscription()) {
          router.replace('/dashboard')
          return
        }
        await new Promise((resolve) => setTimeout(resolve, 1500))
      }

      if (!cancelled) {
        setError('Payment received. Activation is taking longer than usual — refresh in a moment or contact support.')
        setActivating(false)
      }
    }

    void finishPayment()
    return () => { cancelled = true }
  }, [success, sessionId, router])

  const startCheckout = async () => {
    setCheckoutLoading(true)
    setError('')
    try {
      const url = await startSubscriptionCheckout()
      window.location.href = url
    } catch (err) {
      if (err instanceof Error && err.message === 'SESSION_EXPIRED') {
        router.replace('/login?reason=session')
        return
      }
      if (err instanceof Error && err.message === 'ALREADY_ACTIVE') {
        router.replace('/dashboard')
        return
      }
      setError(err instanceof Error ? err.message : 'Checkout failed')
    } finally {
      setCheckoutLoading(false)
    }
  }

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await logoutLocal()
    } catch {
      // clear locally regardless
    }
    clearAuth()
    router.replace('/login')
  }

  const price = account?.subscription_amount_usd ?? 20
  const paidActive = account?.subscription_status === 'active' && account?.subscription_active
  const isTrialing = account?.subscription_status === 'trialing' && account?.subscription_active
  const needsPay = needsSubscription()

  if (loading || (success === '1' && activating && needsSubscription())) {
    return (
      <div style={{ position: 'fixed', inset: 0, width: '100%', overflowY: 'auto', background: '#FBF7F0' }}>
        <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', boxSizing: 'border-box' }}>
          <PageLoader label={success === '1' ? 'Activating your Pro plan…' : 'Loading subscription…'} />
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        background: '#FBF7F0',
        overflowY: 'auto',
        zIndex: 9999,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          margin: '0 auto',
          padding: '48px 24px 40px',
          boxSizing: 'border-box',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <Link href="/" style={{ textDecoration: 'none', color: 'inherit', display: 'inline-block' }}>
            <EwentcastLogo height={52} wordmarkOnly onLight style={{ margin: '0 auto 16px' }} />
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#211B16' }}>
              {paidActive
                ? 'You\'re all set!'
                : isTrialing
                  ? 'Upgrade to Pro'
                  : 'Your trial has ended'}
            </h1>
            <p style={{ margin: '8px 0 0', fontSize: '14px', color: '#8C7F6D' }}>
              {paidActive
                ? 'Your Pro subscription is active'
                : isTrialing
                  ? `${account?.trial_days_remaining ?? 14} days left in your free trial`
                  : 'Upgrade to Pro to continue using Ewentcast'}
            </p>
          </Link>
        </div>

        {/* Card */}
        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid #E8DFD0',
            borderRadius: '16px',
            padding: '28px',
            boxShadow: '0 14px 40px rgba(33, 27, 22, 0.06)',
          }}
        >
          {!paidActive && (
            <>
              {/* Price block */}
              <div
                style={{
                  textAlign: 'center',
                  padding: '20px 16px',
                  marginBottom: '20px',
                  background: 'linear-gradient(135deg, rgba(217,138,43,0.08), rgba(209,71,157,0.06))',
                  borderRadius: '12px',
                  border: '1px solid rgba(217,138,43,0.2)',
                }}
              >
                <div style={{ fontSize: '36px', fontWeight: 700, color: '#211B16', lineHeight: 1 }}>
                  ${price}
                  <span style={{ fontSize: '16px', fontWeight: 500, color: '#8C7F6D' }}>/mo</span>
                </div>
                <div style={{ fontSize: '13px', color: '#8C7F6D', marginTop: '6px' }}>Billed monthly · Cancel anytime</div>
                <div
                  style={{
                    display: 'inline-block', marginTop: '10px',
                    fontSize: '12px', fontWeight: 600, color: '#4E7A4B',
                    background: 'rgba(78,122,75,0.1)', border: '1px solid rgba(78,122,75,0.25)',
                    borderRadius: '20px', padding: '4px 12px',
                  }}
                >
                  14-day money-back guarantee
                </div>
              </div>

              {/* Channel logos */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginBottom: '20px' }}>
                <ChannelLogo channel="luma" size={36} />
                <ChannelLogo channel="eventbrite" size={36} />
                <ChannelLogo channel="hightribe" size={36} />
              </div>

              {/* Features */}
              <ul style={{ listStyle: 'none', margin: '0 0 24px', padding: 0 }}>
                {FEATURES.map((f) => (
                  <li
                    key={f.text}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: '10px',
                      fontSize: '13px', color: '#211B16', lineHeight: 1.5,
                      marginBottom: '10px',
                    }}
                  >
                    <span style={{ flexShrink: 0, fontSize: '15px' }}>{f.icon}</span>
                    {f.text}
                  </li>
                ))}
              </ul>
            </>
          )}

          {paidActive && (
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div
                style={{
                  width: '64px', height: '64px', borderRadius: '50%',
                  background: 'rgba(78,122,75,0.12)', border: '2px solid rgba(78,122,75,0.35)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 16px', fontSize: '28px',
                }}
              >
                ✓
              </div>
              <p style={{ margin: 0, fontSize: '14px', color: '#8C7F6D', lineHeight: 1.55 }}>
                Luma & Eventbrite are ready. Connect Hightribe anytime from Settings for HT events.
              </p>
            </div>
          )}

          {success === '1' && needsPay && (
            <div
              style={{
                marginBottom: '16px', padding: '12px 14px',
                background: 'rgba(78,122,75,0.08)', border: '1px solid rgba(78,122,75,0.25)',
                borderRadius: '10px', fontSize: '13px', color: '#4E7A4B', lineHeight: 1.5,
              }}
            >
              Payment received — activating your plan…
            </div>
          )}

          {canceled === '1' && needsPay && (
            <div
              style={{
                marginBottom: '16px', padding: '12px 14px',
                background: 'rgba(217,138,43,0.08)', border: '1px solid rgba(217,138,43,0.25)',
                borderRadius: '10px', fontSize: '13px', color: '#8C7F6D', lineHeight: 1.5,
              }}
            >
              Checkout canceled. You can subscribe whenever you&apos;re ready.
            </div>
          )}

          {error && (
            <div
              style={{
                marginBottom: '16px', padding: '12px 14px',
                background: 'rgba(194,80,46,0.08)', border: '1px solid rgba(194,80,46,0.35)',
                borderRadius: '10px', fontSize: '13px', color: '#C2502E',
              }}
            >
              {error}
            </div>
          )}

          {!paidActive ? (
            <>
              <button
                type="button"
                onClick={startCheckout}
                disabled={checkoutLoading}
                style={{
                  width: '100%', background: checkoutLoading ? '#F1EADC' : '#D98A2B',
                  border: 'none', borderRadius: '11px',
                  color: checkoutLoading ? '#8C7F6D' : '#fff',
                  padding: '13px', fontSize: '15px', fontWeight: 600,
                  cursor: checkoutLoading ? 'default' : 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                {checkoutLoading
                  ? <InlineLoader label="Opening Stripe checkout" />
                  : isTrialing
                    ? `Upgrade to Pro — $${price}/mo`
                    : `Subscribe — $${price}/mo`}
              </button>
              <p style={{ textAlign: 'center', margin: '12px 0 0', fontSize: '11px', color: '#8C7F6D', lineHeight: 1.5 }}>
                Secure payment via Stripe
                <br />
                Not satisfied? Request a full refund within 14 days from Billing.
              </p>
              {isTrialing ? (
                <Link
                  href="/dashboard"
                  style={{
                    display: 'block', textAlign: 'center', marginTop: '14px',
                    background: 'none', border: '1px solid #E8DFD0', borderRadius: '10px',
                    color: '#8C7F6D', padding: '10px', fontSize: '13px',
                    textDecoration: 'none',
                  }}
                >
                  Continue with free trial →
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  style={{
                    width: '100%', marginTop: '14px',
                    background: 'none', border: '1px solid #E8DFD0', borderRadius: '10px',
                    color: '#8C7F6D', padding: '10px', fontSize: '13px',
                    cursor: loggingOut ? 'default' : 'pointer',
                    opacity: loggingOut ? 0.6 : 1,
                  }}
                >
                  {loggingOut ? <InlineLoader label="Signing out" /> : 'Sign out — pay later or use another account'}
                </button>
              )}
            </>
          ) : (
            <Link
              href="/dashboard"
              style={{
                display: 'block', textAlign: 'center', background: '#D98A2B',
                color: '#fff', padding: '13px', borderRadius: '11px',
                textDecoration: 'none', fontWeight: 600, fontSize: '15px',
              }}
            >
              Go to Dashboard →
            </Link>
          )}
        </div>

        {user && (
          <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '12px', color: '#8C7F6D' }}>
            Signed in as <strong style={{ color: '#211B16' }}>{user.email}</strong>
          </p>
        )}

        <p style={{ textAlign: 'center', marginTop: user ? '8px' : '20px', fontSize: '12px', color: '#8C7F6D', lineHeight: 1.6 }}>
          Hightribe connect is optional
          {!paidActive && (
            <>
              {' · '}
              <Link href="/signup" style={{ color: '#8C7F6D', textDecoration: 'none' }}>Create another account</Link>
            </>
          )}
        </p>
      </div>
    </div>
  )
}

export default function SubscribePage() {
  return (
    <Suspense
      fallback={
        <div style={{ position: 'fixed', inset: 0, width: '100%', overflowY: 'auto', background: '#FBF7F0' }}>
          <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px' }}>
            <PageLoader label="Loading…" />
          </div>
        </div>
      }
    >
      <SubscribeContent />
    </Suspense>
  )
}
