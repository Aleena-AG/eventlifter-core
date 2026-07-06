'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PageLoader } from '@/components/Loader'
import { SubscriptionBillingSection } from '@/components/billing/SubscriptionBillingSection'
import {
  fetchAuthMe,
  getEwentcastAccount,
  isEwentcastSignupUser,
  type EwentcastAccount,
} from '@/lib/ewentcast-session'
import '@/app/settings/settings.css'
import '@/components/billing/billing.css'

export default function BillingPage() {
  const [loading, setLoading] = useState(true)
  const [account, setAccount] = useState<EwentcastAccount | null>(null)

  useEffect(() => {
    fetchAuthMe()
      .then((data) => setAccount(data?.ewentcast ?? getEwentcastAccount()))
      .catch(() => setAccount(getEwentcastAccount()))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <PageLoader label="Loading billing…" />
  }

  if (!isEwentcastSignupUser() || !account) {
    return (
      <div className="billing-page">
        <div className="billing-page__header">
          <h1>Billing</h1>
          <p>Subscription billing is for Ewentcast Pro accounts.</p>
        </div>
        <div className="billing-page__card">
          <p style={{ margin: 0, fontSize: '14px', color: '#8C7F6D', lineHeight: 1.6 }}>
            You signed in with a HighTribe-native account — billing is managed on HighTribe.
            {' '}
            <Link href="/settings" className="billing-page__settings-link">Open Settings →</Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="billing-page">
      <div className="billing-page__header">
        <h1>Billing & subscription</h1>
        <p>
          Trial status, Stripe invoices, and manage your Pro plan ($
          {account.subscription_amount_usd ?? 20}/mo).
          {' '}
          <Link href="/settings" className="billing-page__settings-link">Channel settings →</Link>
        </p>
      </div>
      <div className="billing-page__card">
        <SubscriptionBillingSection account={account} />
      </div>
    </div>
  )
}
