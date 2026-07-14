/**
 * Remote registry responses may be wrapped:
 *   { success: true, data: { id, ... } }
 * or flat:
 *   { id, ... }
 */

export function unwrapApiData<T extends Record<string, unknown> = Record<string, unknown>>(
  raw: unknown,
): T {
  if (!raw || typeof raw !== 'object') return {} as T
  const root = raw as Record<string, unknown>
  if (root.data && typeof root.data === 'object' && !Array.isArray(root.data)) {
    return root.data as T
  }
  return root as T
}

/** Master event id from create / get / link registry responses. */
export function extractRegistryMasterId(raw: unknown): string {
  const data = unwrapApiData(raw)
  const nested = data.master
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const mid = String((nested as { id?: unknown }).id || '').trim()
    if (mid) return mid
  }
  return String(data.id || '').trim()
}
