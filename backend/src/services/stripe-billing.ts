import type { RowDataPacket } from 'mysql2'
import Stripe from 'stripe'
import { config, stripeConfigured } from '../config'
import { getPool, query } from '../db/pool'

let stripeClient: Stripe | null = null

export function isStripeConfigured(): boolean {
  return stripeConfigured()
}

export function getStripe(): Stripe {
  if (!config.stripe.secretKey) {
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_PRICE_ID.')
  }
  if (!stripeClient) {
    stripeClient = new Stripe(config.stripe.secretKey)
  }
  return stripeClient
}

interface UserBillingRow extends RowDataPacket {
  email: string
  name: string
  plan: string | null
  sub_status: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
}

async function getUserBillingRow(userId: number): Promise<UserBillingRow | null> {
  const rows = await query<UserBillingRow[]>(
    `SELECT u.email, u.name,
            s.plan, s.status AS sub_status,
            s.stripe_customer_id, s.stripe_subscription_id
     FROM users u
     LEFT JOIN subscriptions s ON s.user_id = u.id
     WHERE u.id = ?
     LIMIT 1`,
    [userId],
  )
  return rows[0] || null
}

export async function ensureStripeCustomer(userId: number): Promise<string> {
  const row = await getUserBillingRow(userId)
  if (!row) throw new Error('User not found')

  if (row.stripe_customer_id) return row.stripe_customer_id

  const customer = await getStripe().customers.create({
    email: row.email,
    name: row.name,
    metadata: { user_id: String(userId) },
  })

  const now = new Date()
  const pool = getPool()
  const [result] = await pool.query<{ affectedRows: number }>(
    'UPDATE subscriptions SET stripe_customer_id = ?, updated_at = ? WHERE user_id = ?',
    [customer.id, now, userId],
  )
  const affected = (result as unknown as { affectedRows?: number }).affectedRows ?? 0
  if (affected === 0) {
    await pool.query(
      `INSERT INTO subscriptions (user_id, plan, status, stripe_customer_id, created_at, updated_at)
       VALUES (?, 'pro_monthly_20', 'trialing', ?, ?, ?)`,
      [userId, customer.id, now, now],
    )
  }

  return customer.id
}

function mapStripeStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case 'active':
      return 'active'
    case 'trialing':
      return 'trialing'
    case 'past_due':
      return 'past_due'
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
      return 'canceled'
    default:
      return 'past_due'
  }
}

export async function syncSubscriptionFromStripe(
  userId: number,
  subscription: Stripe.Subscription,
  customerId?: string,
): Promise<void> {
  const status = mapStripeStatus(subscription.status)
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null
  const trialEnd = subscription.trial_end
    ? new Date(subscription.trial_end * 1000)
    : null
  const now = new Date()

  await getPool().query(
    `UPDATE subscriptions
     SET plan = 'pro_monthly_20',
         status = ?,
         stripe_customer_id = COALESCE(?, stripe_customer_id),
         stripe_subscription_id = ?,
         current_period_end = ?,
         trial_ends_at = COALESCE(?, trial_ends_at),
         updated_at = ?
     WHERE user_id = ?`,
    [
      status,
      customerId || null,
      subscription.id,
      periodEnd,
      trialEnd,
      now,
      userId,
    ],
  )
}

async function findUserIdByStripeCustomer(customerId: string): Promise<number | null> {
  const rows = await query<{ user_id: number }[]>(
    'SELECT user_id FROM subscriptions WHERE stripe_customer_id = ? LIMIT 1',
    [customerId],
  )
  return rows[0]?.user_id ?? null
}

export async function createCheckoutSession(
  userId: number,
  successUrl: string,
  cancelUrl: string,
): Promise<string> {
  const row = await getUserBillingRow(userId)
  if (!row) throw new Error('User not found')

  if (row.sub_status === 'active') {
    throw new Error('Subscription is already active')
  }

  const customerId = await ensureStripeCustomer(userId)
  const session = await getStripe().checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: config.stripe.priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: String(userId),
    metadata: { user_id: String(userId) },
    subscription_data: {
      metadata: { user_id: String(userId) },
    },
    allow_promotion_codes: true,
  })

  if (!session.url) throw new Error('Stripe did not return a checkout URL')
  return session.url
}

/** Activate subscription immediately after Stripe redirect (do not wait for webhook). */
export async function confirmCheckoutSession(
  userId: number,
  sessionId: string,
): Promise<boolean> {
  const stripe = getStripe()
  const session = await stripe.checkout.sessions.retrieve(sessionId)

  const ownerId = Number(session.metadata?.user_id || session.client_reference_id)
  if (!ownerId || ownerId !== userId) {
    throw new Error('Invalid checkout session')
  }

  const paid =
    session.payment_status === 'paid'
    || session.payment_status === 'no_payment_required'
    || session.status === 'complete'

  if (!paid || !session.subscription) return false

  const subscription = await stripe.subscriptions.retrieve(String(session.subscription))
  const customerId = typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id

  await syncSubscriptionFromStripe(userId, subscription, customerId)
  return mapStripeStatus(subscription.status) === 'active'
}

export async function createBillingPortalSession(
  userId: number,
  returnUrl: string,
): Promise<string> {
  const customerId = await ensureStripeCustomer(userId)
  const session = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  })
  return session.url
}

export interface BillingInvoiceRow {
  id: string
  type: string
  amount: number
  currency: string
  status: string
  description: string
  invoice_url: string | null
  created_at: string
}

export async function listBillingInvoices(userId: number): Promise<BillingInvoiceRow[]> {
  const row = await getUserBillingRow(userId)
  if (!row?.stripe_customer_id) return []

  const invoices = await getStripe().invoices.list({
    customer: row.stripe_customer_id,
    limit: 24,
  })

  return invoices.data.map((inv) => ({
    id: inv.id,
    type: 'subscription',
    amount: (inv.amount_paid ?? inv.total ?? 0) / 100,
    currency: (inv.currency || 'usd').toLowerCase(),
    status: inv.status || 'paid',
    description: inv.lines.data[0]?.description || 'Ewentcast Pro',
    invoice_url: inv.hosted_invoice_url || inv.invoice_pdf || null,
    created_at: new Date((inv.created || 0) * 1000).toISOString(),
  }))
}

export async function handleStripeWebhook(
  rawBody: string,
  signature: string | null,
): Promise<void> {
  if (!config.stripe.webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured')
  }
  if (!signature) {
    throw new Error('Missing stripe-signature header')
  }

  const stripe = getStripe()
  const event = stripe.webhooks.constructEvent(
    rawBody,
    signature,
    config.stripe.webhookSecret,
  )

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = Number(session.metadata?.user_id || session.client_reference_id)
      if (!userId || !session.subscription) break

      const subscription = await stripe.subscriptions.retrieve(
        String(session.subscription),
      )
      await syncSubscriptionFromStripe(
        userId,
        subscription,
        typeof session.customer === 'string' ? session.customer : session.customer?.id,
      )
      break
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer.id
      const userId =
        Number(subscription.metadata?.user_id)
        || (await findUserIdByStripeCustomer(customerId))
      if (!userId) break

      if (event.type === 'customer.subscription.deleted') {
        await getPool().query(
          `UPDATE subscriptions
           SET status = 'canceled', stripe_subscription_id = NULL, updated_at = ?
           WHERE user_id = ?`,
          [new Date(), userId],
        )
      } else {
        await syncSubscriptionFromStripe(userId, subscription, customerId)
      }
      break
    }
    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = typeof invoice.customer === 'string'
        ? invoice.customer
        : invoice.customer?.id
      if (!customerId || !invoice.subscription) break

      const userId = await findUserIdByStripeCustomer(customerId)
      if (!userId) break

      const subscription = await stripe.subscriptions.retrieve(
        String(invoice.subscription),
      )
      await syncSubscriptionFromStripe(userId, subscription, customerId)
      break
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = typeof invoice.customer === 'string'
        ? invoice.customer
        : invoice.customer?.id
      if (!customerId) break

      const userId = await findUserIdByStripeCustomer(customerId)
      if (!userId) break

      await getPool().query(
        'UPDATE subscriptions SET status = ?, updated_at = ? WHERE user_id = ?',
        ['past_due', new Date(), userId],
      )
      break
    }
    default:
      break
  }
}
