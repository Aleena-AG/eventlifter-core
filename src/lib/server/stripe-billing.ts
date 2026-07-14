/**
 * Stripe billing is owned by the remote API.
 * These stubs keep imports compiling; routes proxy to BACKEND_URL.
 */

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY || process.env.BACKEND_URL)
}

export async function createCheckoutSession(
  _userId: number,
  _successUrl: string,
  _cancelUrl: string,
): Promise<string> {
  throw new Error('Checkout is handled by the remote API')
}

export async function createBillingPortalSession(
  _userId: number,
  _returnUrl: string,
): Promise<string> {
  throw new Error('Billing portal is handled by the remote API')
}

export async function confirmCheckoutSession(
  _userId: number,
  _sessionId: string,
): Promise<boolean> {
  throw new Error('Checkout confirm is handled by the remote API')
}

export async function listBillingInvoices(_userId: number): Promise<unknown[]> {
  return []
}

export async function getBillingSummary(_userId: number) {
  return { current_period_end: null as string | null, amount_usd: 20, currency: 'usd' }
}

export async function getMoneyBackRefundStatus(_userId: number) {
  return { eligible: false, reason: 'Handled by remote API' }
}

export async function processMoneyBackRefund(_userId: number) {
  throw new Error('Refunds are handled by the remote API')
}

export async function handleStripeWebhook(_rawBody: string, _signature: string | null) {
  throw new Error('Stripe webhooks must be configured on the remote API')
}
