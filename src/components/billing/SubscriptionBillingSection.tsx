'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  fetchBillingTransactions,
  fetchMoneyBackRefundStatus,
  openStripeBillingPortal,
  requestMoneyBackRefund,
  type BillingSummary,
  type BillingTransaction,
  type EwentcastAccount,
  type MoneyBackRefundStatus,
} from '@/lib/ewentcast-session'
import './billing.css'

function subscriptionStatusMeta(account: EwentcastAccount): {
  label: string
  tone: 'active' | 'trial' | 'inactive' | 'expired'
  detail: string
} {
  const price = account.subscription_amount_usd ?? 20
  if (account.subscription_status === 'active' && account.subscription_active) {
    return {
      label: 'Pro — Active',
      tone: 'active',
      detail: `$${price}/month · Full access`,
    }
  }
  if (account.subscription_status === 'trialing' && account.subscription_active) {
    const days = account.trial_days_remaining
    const detail = days != null
      ? `${days} day${days === 1 ? '' : 's'} left in free trial`
      : account.trial_ends_at
        ? `Trial ends ${new Date(account.trial_ends_at).toLocaleDateString()}`
        : 'Free trial active'
    return { label: 'Free trial', tone: 'trial', detail }
  }
  if (account.subscription_status === 'inactive' || !account.subscription_active) {
    return {
      label: 'Inactive',
      tone: 'inactive',
      detail: 'Subscribe to Pro to use Ewentcast',
    }
  }
  return {
    label: account.subscription_status,
    tone: 'expired',
    detail: 'Upgrade required',
  }
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount)
  } catch {
    return `$${amount.toFixed(2)}`
  }
}

function TrialHero({ account }: { account: EwentcastAccount }) {
  if (account.subscription_status !== 'trialing' || !account.subscription_active) return null

  const days = account.trial_days_remaining ?? null
  const urgent = days != null && days <= 3

  return (
    <div className={`billing-trial-hero${urgent ? ' billing-trial-hero--urgent' : ''}`}>
      <div className="billing-trial-hero__content">
        <p className="billing-trial-hero__eyebrow">Free trial</p>
        <p className="billing-trial-hero__days">
          {days != null ? (
            <>
              <strong>{days}</strong>
              <span>day{days === 1 ? '' : 's'} left</span>
            </>
          ) : (
            <span>Active trial</span>
          )}
        </p>
        {account.trial_ends_at && (
          <p className="billing-trial-hero__ends">
            Ends {new Date(account.trial_ends_at).toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        )}
      </div>
      <Link href="/subscribe" className="billing-trial-hero__cta">
        Upgrade to Pro
      </Link>
    </div>
  )
}

function MoneyBackRefundPanel({ account }: { account: EwentcastAccount }) {
  const [refundStatus, setRefundStatus] = useState<MoneyBackRefundStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const isPaid = account.subscription_status === 'active' && account.subscription_active

  useEffect(() => {
    if (!isPaid) {
      setLoading(false)
      return
    }
    let cancelled = false
    fetchMoneyBackRefundStatus()
      .then((status) => { if (!cancelled) setRefundStatus(status) })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load refund info')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [isPaid, account.subscription_status])

  const handleRefund = async () => {
    if (!window.confirm(
      'Request a full money-back refund? Your Pro subscription will be canceled immediately and access will end.',
    )) return

    setSubmitting(true)
    setError('')
    setMessage('')
    try {
      const result = await requestMoneyBackRefund()
      setMessage(
        `${result.message} Refunded ${formatMoney(result.refunded_amount, result.currency)}.`,
      )
      setRefundStatus((prev) => prev ? { ...prev, eligible: false, already_refunded: true } : prev)
      window.location.href = '/subscribe'
    } catch (err) {
      if (err instanceof Error && err.message === 'SESSION_EXPIRED') {
        window.location.href = '/login?reason=session'
        return
      }
      setError(err instanceof Error ? err.message : 'Refund failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isPaid && !refundStatus?.already_refunded) return null

  return (
    <div className="billing-refund">
      <p className="billing-refund__title">14-day money-back guarantee</p>
      {loading ? (
        <p className="settings-billing__empty">Checking eligibility…</p>
      ) : refundStatus?.already_refunded ? (
        <p className="settings-billing__empty">A money-back refund was already processed for this account.</p>
      ) : refundStatus?.eligible ? (
        <>
          <p className="billing-refund__detail">
            Not satisfied? Full refund within {refundStatus.refund_days} days of your first payment.
            {refundStatus.days_remaining != null && (
              <> <strong>{refundStatus.days_remaining} day{refundStatus.days_remaining === 1 ? '' : 's'} left</strong> to request.</>
            )}
          </p>
          {refundStatus.refund_deadline && (
            <p className="billing-refund__deadline">
              Refund deadline: {new Date(refundStatus.refund_deadline).toLocaleDateString(undefined, {
                month: 'short', day: 'numeric', year: 'numeric',
              })}
            </p>
          )}
          <button
            type="button"
            className="billing-refund__btn"
            onClick={handleRefund}
            disabled={submitting}
          >
            {submitting ? 'Processing refund…' : 'Request full refund'}
          </button>
        </>
      ) : (
        <p className="settings-billing__empty">
          {refundStatus?.reason || 'Money-back refund is not available for this account.'}
        </p>
      )}
      {error && <p className="settings-billing__error">{error}</p>}
      {message && <p className="billing-refund__success">{message}</p>}
    </div>
  )
}

function formatBillingDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function SubscriptionBillingPanel({
  account,
  transactions,
  billing,
  loading,
  error,
  onError,
}: {
  account: EwentcastAccount
  transactions: BillingTransaction[]
  billing: BillingSummary | null
  loading: boolean
  error: string
  onError: (message: string) => void
}) {
  const [portalLoading, setPortalLoading] = useState(false)

  const isPaid = account.subscription_status === 'active' && account.subscription_active
  const hasStripeCustomer = isPaid || transactions.length > 0
  const nextBillingDate = billing?.current_period_end || account.current_period_end || null

  const openPortal = async () => {
    setPortalLoading(true)
    onError('')
    try {
      const url = await openStripeBillingPortal()
      window.location.href = url
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Billing portal failed')
    } finally {
      setPortalLoading(false)
    }
  }

  return (
    <div className="settings-billing">
      <div className="settings-billing__header">
        <div>
          <p className="settings-billing__title">Stripe billing</p>
          <p className="settings-billing__subtitle">
            Invoices and payment method are managed through Stripe.
          </p>
        </div>
        {(isPaid || hasStripeCustomer) && (
          <button
            type="button"
            className="settings-billing__portal-btn"
            onClick={openPortal}
            disabled={portalLoading}
          >
            {portalLoading ? 'Opening…' : 'Manage billing'}
          </button>
        )}
      </div>

      <div className="settings-subscription__grid">
        <div className="settings-subscription__item">
          <span className="settings-subscription__item-label">Billing cycle</span>
          <span className="settings-subscription__item-value">Monthly</span>
        </div>
        <div className="settings-subscription__item">
          <span className="settings-subscription__item-label">Payment provider</span>
          <span className="settings-subscription__item-value">Stripe</span>
        </div>
        {nextBillingDate && isPaid && (
          <div className="settings-subscription__item settings-subscription__item--highlight">
            <span className="settings-subscription__item-label">Next billing</span>
            <span className="settings-subscription__item-value">
              {formatBillingDate(nextBillingDate)}
            </span>
          </div>
        )}
      </div>

      {error && (
        <p className="settings-billing__error">{error}</p>
      )}

      <MoneyBackRefundPanel account={account} />

      <div className="settings-billing__invoices">
        <p className="settings-billing__invoices-title">Invoices from Stripe</p>
        {loading ? (
          <p className="settings-billing__empty">Loading invoices…</p>
        ) : transactions.length === 0 ? (
          <p className="settings-billing__empty">
            {isPaid
              ? 'No invoices yet. They will appear here after your first charge.'
              : 'Subscribe to Pro — your Stripe invoices will show up here.'}
          </p>
        ) : (
          <div className="settings-billing__table-wrap">
            <table className="settings-billing__table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={String(tx.id)}>
                    <td>{new Date(tx.createdAt).toLocaleDateString()}</td>
                    <td>{tx.description}</td>
                    <td>{formatMoney(tx.amount, tx.currency)}</td>
                    <td>
                      <span className={`settings-billing__status settings-billing__status--${tx.status}`}>
                        {tx.status}
                      </span>
                    </td>
                    <td>
                      {tx.invoiceUrl ? (
                        <a
                          href={tx.invoiceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="settings-billing__invoice-link"
                        >
                          View invoice
                        </a>
                      ) : (
                        <span className="settings-billing__muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export function SubscriptionBillingSection({ account }: { account: EwentcastAccount }) {
  const meta = subscriptionStatusMeta(account)
  const showUpgrade = account.auth_source === 'ewentcast_signup'
    && account.subscription_status !== 'active'

  const isPaid = account.subscription_status === 'active' && account.subscription_active
  const [transactions, setTransactions] = useState<BillingTransaction[]>([])
  const [billing, setBilling] = useState<BillingSummary | null>(null)
  const [billingLoading, setBillingLoading] = useState(true)
  const [billingError, setBillingError] = useState('')

  useEffect(() => {
    let cancelled = false
    setBillingLoading(true)
    setBillingError('')
    fetchBillingTransactions()
      .then((data) => {
        if (cancelled) return
        setTransactions(data.transactions)
        setBilling(data.billing)
      })
      .catch((err) => {
        if (cancelled) return
        setTransactions([])
        setBilling(null)
        setBillingError(err instanceof Error ? err.message : 'Could not load billing')
      })
      .finally(() => { if (!cancelled) setBillingLoading(false) })
    return () => { cancelled = true }
  }, [account.subscription_status, account.subscription_active])

  const nextBillingDate = billing?.current_period_end || account.current_period_end || null

  return (
    <div className="settings-subscription">
      <TrialHero account={account} />

      <div className="settings-subscription__main">
        <div>
          <p className="settings-subscription__eyebrow">Ewentcast plan</p>
          <p className="settings-subscription__plan">
            {account.subscription_plan === 'pro_monthly_20' ? 'Pro' : account.subscription_plan}
            <span className="settings-subscription__price">
              ${account.subscription_amount_usd ?? 20}/mo
            </span>
          </p>
        </div>
        <span className={`settings-subscription__badge settings-subscription__badge--${meta.tone}`}>
          {meta.label}
        </span>
      </div>

      <div className="settings-subscription__grid">
        <div className="settings-subscription__item">
          <span className="settings-subscription__item-label">Status</span>
          <span className="settings-subscription__item-value">{account.subscription_status}</span>
        </div>
        <div className="settings-subscription__item">
          <span className="settings-subscription__item-label">Access</span>
          <span className="settings-subscription__item-value">
            {account.subscription_active ? 'Active' : 'Blocked'}
          </span>
        </div>
        {account.subscription_status === 'trialing' && (
          <div className="settings-subscription__item settings-subscription__item--highlight">
            <span className="settings-subscription__item-label">Trial left</span>
            <span className="settings-subscription__item-value">
              {account.trial_days_remaining != null
                ? `${account.trial_days_remaining} day${account.trial_days_remaining === 1 ? '' : 's'}`
                : '—'}
            </span>
          </div>
        )}
        {account.trial_ends_at && account.subscription_status === 'trialing' && (
          <div className="settings-subscription__item">
            <span className="settings-subscription__item-label">Trial ends</span>
            <span className="settings-subscription__item-value">
              {formatBillingDate(account.trial_ends_at)}
            </span>
          </div>
        )}
        {isPaid && nextBillingDate && (
          <div className="settings-subscription__item settings-subscription__item--highlight">
            <span className="settings-subscription__item-label">Next billing</span>
            <span className="settings-subscription__item-value">
              {billingLoading ? '…' : formatBillingDate(nextBillingDate)}
            </span>
          </div>
        )}
        {isPaid && billing?.amount_usd != null && (
          <div className="settings-subscription__item">
            <span className="settings-subscription__item-label">Next charge</span>
            <span className="settings-subscription__item-value">
              {formatMoney(billing.amount_usd, billing.currency || 'usd')}
            </span>
          </div>
        )}
      </div>

      <p className="settings-subscription__detail">{meta.detail}</p>

      {showUpgrade && (
        <Link href="/subscribe" className="settings-subscription__cta">
          {account.subscription_active ? 'Upgrade to Pro' : 'Subscribe to Pro'}
        </Link>
      )}

      <SubscriptionBillingPanel
        account={account}
        transactions={transactions}
        billing={billing}
        loading={billingLoading}
        error={billingError}
        onError={setBillingError}
      />
    </div>
  )
}
