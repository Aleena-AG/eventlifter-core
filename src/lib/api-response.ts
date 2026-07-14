/**
 * Remote API responses may be wrapped:
 *   { success: true, data: { ... } }
 *   { success: true, data: [ ... ] }
 * or flat:
 *   { id, ... } / { bookings: [...] }
 */

export function unwrapApiData<T = Record<string, unknown>>(raw: unknown): T {
  if (!raw || typeof raw !== 'object') {
    return (Array.isArray(raw) ? [] : {}) as T
  }
  const root = raw as Record<string, unknown>
  if ('data' in root) {
    const inner = root.data
    if (inner != null && (typeof inner === 'object' || Array.isArray(inner))) {
      return inner as T
    }
  }
  return raw as T
}

/** Master event id from create / get / link registry responses. */
export function extractRegistryMasterId(raw: unknown): string {
  const data = unwrapApiData<Record<string, unknown>>(raw)
  const nested = data.master
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const mid = String((nested as { id?: unknown }).id || '').trim()
    if (mid) return mid
  }
  return String(data.id || '').trim()
}
