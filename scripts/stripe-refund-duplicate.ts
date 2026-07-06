/**
 * Cancel duplicate Stripe subscriptions and refund the newer duplicate charge.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_... npx tsx scripts/stripe-refund-duplicate.ts muazmuneer151m@gmail.com
 *
 * Keeps the oldest active subscription; cancels newer duplicates and refunds their latest paid invoice.
 */
import '../backend/src/config'
import Stripe from 'stripe'

const email = process.argv[2]?.trim().toLowerCase()
if (!email) {
  console.error('Usage: npx tsx scripts/stripe-refund-duplicate.ts <customer-email>')
  process.exit(1)
}

const secretKey = process.env.STRIPE_SECRET_KEY
if (!secretKey) {
  console.error('Set STRIPE_SECRET_KEY in the environment.')
  process.exit(1)
}

const stripe = new Stripe(secretKey)

async function main() {
  const customers = await stripe.customers.list({ email, limit: 5 })
  if (customers.data.length === 0) {
    console.error(`No Stripe customer found for ${email}`)
    process.exit(1)
  }

  const customer = customers.data[0]
  console.log(`Customer: ${customer.id} (${email})`)

  const subs = await stripe.subscriptions.list({
    customer: customer.id,
    status: 'active',
    limit: 20,
  })

  if (subs.data.length <= 1) {
    console.log(`Active subscriptions: ${subs.data.length} — nothing to dedupe.`)
    return
  }

  const sorted = [...subs.data].sort((a, b) => a.created - b.created)
  const keep = sorted[0]
  const duplicates = sorted.slice(1)

  console.log(`Keeping subscription ${keep.id} (created ${new Date(keep.created * 1000).toISOString()})`)

  for (const sub of duplicates) {
    console.log(`\nDuplicate: ${sub.id}`)

    const invoices = await stripe.invoices.list({
      subscription: sub.id,
      limit: 5,
    })
    const paidInvoice = invoices.data.find((inv) => inv.status === 'paid' && inv.payment_intent)

    if (paidInvoice?.payment_intent) {
      const paymentIntentId = typeof paidInvoice.payment_intent === 'string'
        ? paidInvoice.payment_intent
        : paidInvoice.payment_intent.id

      const refund = await stripe.refunds.create({ payment_intent: paymentIntentId })
      console.log(`  Refund: ${refund.id} — ${(refund.amount || 0) / 100} ${refund.currency}`)
    } else {
      console.log('  No paid invoice found to refund.')
    }

    const canceled = await stripe.subscriptions.cancel(sub.id)
    console.log(`  Canceled subscription: ${canceled.id} (status: ${canceled.status})`)
  }

  console.log('\nDone. Customer should now have one active subscription.')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
