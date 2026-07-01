const DEFAULT_BACKEND = 'http://127.0.0.1:4000'

export function getBackendUrl(): string {
  return (process.env.BACKEND_URL || DEFAULT_BACKEND).replace(/\/$/, '')
}

export async function backendFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = `${getBackendUrl()}${path.startsWith('/') ? path : `/${path}`}`
  return fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
    cache: 'no-store',
  })
}

export async function backendJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await backendFetch(path, init)
  const data = await res.json() as T & { error?: string }
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : `Backend error ${res.status}`)
  }
  return data
}
