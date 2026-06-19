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

export function buildEbTicketClass(input: {
  name?: string
  free?: boolean
  capacity?: number | string | null
  currency?: string
  price?: number | string | null
}): Record<string, unknown> {
  const qty = ebTicketQuantity(input.capacity)
  const name = (input.name || 'General Admission').trim() || 'General Admission'
  const tc: Record<string, unknown> = {
    name,
    quantity_total: qty,
  }

  const price = input.price != null ? parseFloat(String(input.price)) : 0
  const isFree = input.free !== false && (!Number.isFinite(price) || price <= 0)

  if (isFree) {
    tc.free = true
  } else {
    const currency = (input.currency || 'USD').toUpperCase()
    const cents = Math.round(price * 100)
    tc.cost = `${currency},${cents}`
  }

  return tc
}
