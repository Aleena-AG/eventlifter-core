'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { PageLoader } from '@/components/Loader'
import { SubscriptionBillingSection } from '@/components/billing/SubscriptionBillingSection'
import {
  fetchAuthMe,
  getEwentcastAccount,
  shouldShowBilling,
  type EwentcastAccount,
} from '@/lib/ewentcast-session'
import '@/app/settings/settings.css'
import '@/components/billing/billing.css'

export default function BillingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [account, setAccount] = useState<EwentcastAccount | null>(null)

  useEffect(() => {
    fetchAuthMe()
      .then((data) => setAccount(data?.ewentcast ?? getEwentcastAccount()))
      .catch(() => setAccount(getEwentcastAccount()))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (loading) return
    if (!shouldShowBilling()) {
      router.replace('/dashboard')
    }
  }, [loading, router])

  if (loading) {
    return <PageLoader label="Loading billing…" />
  }

  if (!shouldShowBilling() || !account) {
    return <PageLoader label="Redirecting…" />
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
