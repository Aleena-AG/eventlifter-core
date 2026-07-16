/** Eventbrite requires quantity_total on every non-donation ticket class. */
export function ebTicketQuantity(capacity?: number | string | null): number {
  if (typeof capacity === 'number' && Number.isFinite(capacity) && capacity > 0) {
    return Math.floor(capacity)
  }
  if (capacity != null && String(capacity).trim()) {
    const n = parseInt(String(capacity), 10)
    if (Number.isFinite(n) && n > 0) return n
  }
  return 100
}

/**
 * Build an Eventbrite ticket_class body.
 *
 * EB rule: free tickets must NOT include `cost` — only `free: true`.
 * Paid tickets use cost as `"USD,1500"` (currency + minor units).
 * Never send `"USD,0"` — that 400s.
 */
export function buildEbTicketClass(input: {
  name?: string
  free?: boolean
  capacity?: number | string | null
  currency?: string
  price?: number | string | null
  salesStart?: string | null
  salesEnd?: string | null
}): Record<string, unknown> {
  const qty = ebTicketQuantity(input.capacity)
  const name = (input.name || 'General Admission').trim() || 'General Admission'
  const tc: Record<string, unknown> = {
    name,
    quantity_total: qty,
  }

  const price = input.price != null && String(input.price).trim() !== ''
    ? parseFloat(String(input.price))
    : NaN
  const cents = Number.isFinite(price) ? Math.round(price * 100) : 0
  // Explicit free, or zero/missing price → free. Never attach cost on free.
  const isFree = input.free === true || !(cents > 0)

  if (isFree) {
    tc.free = true
    // Intentionally omit `cost` — Eventbrite rejects free tickets that include it.
  } else {
    const currency = (input.currency || 'USD').toUpperCase().replace(/[^A-Z]/g, '') || 'USD'
    tc.cost = `${currency},${cents}`
    tc.free = false
  }

  if (input.salesStart) tc.sales_start = input.salesStart
  if (input.salesEnd) tc.sales_end = input.salesEnd

  return tc
}
