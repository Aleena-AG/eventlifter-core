'use client'

const HT_TOKEN_KEY = 'ht_token'
const HT_LINK_TOKEN_KEY = 'ht_link_token'
const EWENTCAST_ACCOUNT_KEY = 'ewentcast_account'

/** Keys HighTribe may use for the auth token in browser storage. */
const HT_TOKEN_KEYS = ['token', 'ht_token', 'access_token', 'auth_token', 'authToken']

/** Public HighTribe app URL that hosts the SSO bridge page. */
export function getHightribeAppUrl(): string {
  return (process.env.NEXT_PUBLIC_HIGHTRIBE_APP_URL || 'https://hightribe.com').replace(/\/$/, '')
}

function getHightribeSsoPath(): string {
  const path = process.env.NEXT_PUBLIC_HIGHTRIBE_SSO_PATH || '/sso/ewentcast-token'
  return path.startsWith('/') ? path : `/${path}`
}

/** Page on HighTribe that reads its localStorage token and postMessages it back. */
export function getHightribeBridgeUrl(appUrl = getHightribeAppUrl()): string {
  return `${appUrl.replace(/\/$/, '')}${getHightribeSsoPath()}`
}

/** hightribe.com and www.hightribe.com use separate localStorage — try both. */
export function getHightribeAppUrlCandidates(): string[] {
  const configured = getHightribeAppUrl()
  const urls = new Set<string>([configured])

  try {
    const u = new URL(configured)
    const host = u.hostname
    if (host.startsWith('www.')) {
      urls.add(`${u.protocol}//${host.slice(4)}`)
    } else {
      urls.add(`${u.protocol}//www.${host}`)
    }
  } catch {
    // ignore invalid URL
  }

  return [...urls]
}

/**
 * Read HighTribe token from this origin's storage or an SSO callback query param.
 * Note: this cannot see hightribe.com's storage (different origin) —
 * use requestHightribeTokenViaBridge() for that.
 */
export function readHightribeBrowserToken(): string | null {
  if (typeof window === 'undefined') return null

  const params = new URLSearchParams(window.location.search)
  const fromUrl = params.get('ht_token')
  if (fromUrl) return fromUrl

  if (localStorage.getItem(EWENTCAST_ACCOUNT_KEY)) {
    return localStorage.getItem(HT_LINK_TOKEN_KEY)
  }

  for (const key of HT_TOKEN_KEYS) {
    const value = localStorage.getItem(key)
    if (value) return value
  }

  for (const key of HT_TOKEN_KEYS) {
    const value = sessionStorage.getItem(key)
    if (value) return value
  }

  return null
}

const SSO_DEBUG = process.env.NODE_ENV !== 'production'
function ssoLog(...args: unknown[]): void {
  if (SSO_DEBUG) console.log('[ht-sso]', ...args)
}

export interface HightribePopupBridge {
  close: () => void
  waitForToken: (timeoutMs?: number) => Promise<string | null>
}

/**
 * Open the HighTribe popup synchronously (must run in the same click handler, before any await).
 * Browsers block window.open() after async gaps.
 */
/** Path on Ewentcast the popup lands back on with ?ht_token=... after the bridge redirects. */
function getSsoReturnUrl(): string {
  return `${window.location.origin}/sso/return`
}

export function startHightribePopupBridge(): HightribePopupBridge | null {
  if (typeof window === 'undefined') return null

  const candidates = getHightribeAppUrlCandidates()
  const allowedOrigins = new Set(
    candidates.map((url) => {
      try {
        return new URL(url).origin
      } catch {
        return ''
      }
    }).filter(Boolean),
  )

  const returnUrl = getSsoReturnUrl()
  const buildBridgeUrl = (appUrl: string) => {
    const base = getHightribeBridgeUrl(appUrl)
    const sep = base.includes('?') ? '&' : '?'
    return `${base}${sep}mode=popup&return=${encodeURIComponent(returnUrl)}`
  }

  const firstBridgeUrl = buildBridgeUrl(candidates[0])
  ssoLog('opening popup directly to:', firstBridgeUrl)

  const popup = window.open(
    firstBridgeUrl,
    'hightribe_sso',
    'popup=yes,width=460,height=560,menubar=no,toolbar=no,location=yes,status=no',
  )
  if (!popup) {
    ssoLog('popup blocked — allow popups for this site')
    return null
  }

  let closed = false
  let candidateIndex = 1

  const close = () => {
    if (closed) return
    closed = true
    try {
      popup.close()
    } catch {
      // ignore
    }
  }

  const navigateToCandidate = (): boolean => {
    if (closed || candidateIndex >= candidates.length) return false
    const bridgeUrl = buildBridgeUrl(candidates[candidateIndex])
    candidateIndex += 1
    ssoLog('popup trying next origin:', bridgeUrl)
    try {
      popup.location.href = bridgeUrl
      return true
    } catch (e) {
      ssoLog('popup navigation failed:', e)
      return false
    }
  }

  const pingPopup = () => {
    if (closed || popup.closed) return
    for (const origin of allowedOrigins) {
      try {
        popup.postMessage({ type: 'ht_token_request' }, origin)
      } catch {
        // ignore
      }
    }
  }

  /** Redirect-based path: once popup lands back on our origin, read ?ht_token / #ht_token. */
  const readTokenFromPopupLocation = (): string | null => {
    try {
      // Same-origin access throws while popup is on hightribe.com — that's expected.
      const href = popup.location.href
      if (!href || href === 'about:blank') return null
      const url = new URL(href)
      if (url.origin !== window.location.origin) return null
      const fromQuery = url.searchParams.get('ht_token')
      if (fromQuery) return fromQuery
      const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
      return hash.get('ht_token')
    } catch {
      return null
    }
  }

  const waitForToken = (timeoutMs = 60000): Promise<string | null> =>
    new Promise((resolve) => {
      let done = false
      let gotAnyMessage = false

      const finish = (token: string | null, reason?: string) => {
        if (done) return
        done = true
        window.removeEventListener('message', onMessage)
        clearTimeout(timer)
        clearInterval(pingTimer)
        clearInterval(pollTimer)
        if (reason) ssoLog(reason)
        close()
        resolve(token)
      }

      const onMessage = (event: MessageEvent) => {
        if (!allowedOrigins.has(event.origin) && event.origin !== window.location.origin) {
          return
        }

        const data = event.data as { type?: string; token?: unknown; loggedIn?: unknown }
        if (!data || typeof data !== 'object' || !data.type) return

        gotAnyMessage = true
        ssoLog('popup message from', event.origin, ':', data.type)

        if (data.type === 'ht_token') {
          const token = typeof data.token === 'string' && data.token ? data.token : null
          if (token) finish(token)
        } else if (data.type === 'ht_token_none' || data.loggedIn === false) {
          if (!navigateToCandidate()) {
            finish(null, 'popup: no token on any HighTribe origin (check localStorage key "token")')
          } else {
            setTimeout(pingPopup, 500)
          }
        }
      }

      window.addEventListener('message', onMessage)

      // Poll for redirect-based return (bridge sends popup back to /sso/return?ht_token=...)
      const pollTimer = setInterval(() => {
        if (closed) return
        if (popup.closed) {
          finish(null, 'popup: window was closed before token arrived')
          return
        }
        const token = readTokenFromPopupLocation()
        if (token) finish(token)
      }, 400)

      const timer = setTimeout(() => {
        if (popup.closed) {
          finish(null, 'popup: window was closed before token arrived')
          return
        }
        if (!gotAnyMessage) {
          finish(
            null,
            'popup: no response from bridge — HighTribe bridge must either postMessage to window.opener OR redirect back to the ?return= URL with ?ht_token=',
          )
          return
        }
        finish(null, 'popup: timed out waiting for token')
      }, timeoutMs)

      const pingTimer = setInterval(pingPopup, 1500)
      setTimeout(pingPopup, 800)
    })

  return { close, waitForToken }
}

function requestTokenFromBridgeOrigin(
  appUrl: string,
  timeoutMs: number,
): Promise<string | null> {
  return new Promise((resolve) => {
    let expectedOrigin: string
    try {
      expectedOrigin = new URL(appUrl).origin
    } catch {
      resolve(null)
      return
    }

    const bridgeUrl = `${getHightribeBridgeUrl(appUrl)}?mode=iframe`
    ssoLog('trying bridge (iframe):', bridgeUrl)

    const iframe = document.createElement('iframe')
    iframe.style.display = 'none'
    iframe.setAttribute('aria-hidden', 'true')

    let done = false
    let sawToken = false

    const cleanup = () => {
      window.removeEventListener('message', onMessage)
      clearTimeout(timer)
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
    }

    const finish = (token: string | null) => {
      if (done) return
      done = true
      cleanup()
      resolve(token)
    }

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== expectedOrigin) return

      const data = event.data as { type?: string; token?: unknown; loggedIn?: unknown }
      if (!data || typeof data !== 'object' || !data.type) return

      ssoLog('message from', event.origin, ':', data.type)

      if (data.type === 'ht_token') {
        const token = typeof data.token === 'string' && data.token ? data.token : null
        if (token) {
          sawToken = true
          finish(token)
        }
      } else if (data.type === 'ht_token_none' || data.loggedIn === false) {
        ssoLog('no token on', expectedOrigin)
      }
    }

    window.addEventListener('message', onMessage)
    const timer = setTimeout(() => {
      if (!sawToken) finish(null)
    }, timeoutMs)

    iframe.onload = () => {
      try {
        iframe.contentWindow?.postMessage({ type: 'ht_token_request' }, expectedOrigin)
      } catch (e) {
        ssoLog('postMessage failed:', e)
      }
    }

    iframe.src = bridgeUrl
    document.body.appendChild(iframe)
  })
}

/**
 * Silently ask HighTribe for the logged-in token via hidden iframe + postMessage.
 * Tries configured URL and www/non-www variant (separate browser storage).
 */
export async function requestHightribeTokenViaBridge(timeoutMs = 5000): Promise<string | null> {
  if (typeof window === 'undefined') return null

  const candidates = getHightribeAppUrlCandidates()
  ssoLog('bridge candidates:', candidates)

  for (const appUrl of candidates) {
    const token = await requestTokenFromBridgeOrigin(appUrl, timeoutMs)
    if (token) {
      ssoLog('token found via iframe', appUrl)
      return token
    }
  }

  ssoLog('iframe found no token (often due to browser storage partitioning)')
  return null
}

/**
 * Wait on pre-opened popup first (works cross-origin), iframe only as fallback.
 */
export async function resolveHightribeTokenWithBridge(
  popupBridge: HightribePopupBridge | null,
  options?: { iframeTimeoutMs?: number; popupTimeoutMs?: number },
): Promise<{ token: string | null; popupBlocked: boolean }> {
  if (!popupBridge) {
    const iframeToken = await requestHightribeTokenViaBridge(options?.iframeTimeoutMs ?? 3000)
    return { token: iframeToken, popupBlocked: true }
  }

  const popupToken = await popupBridge.waitForToken(options?.popupTimeoutMs ?? 20000)
  if (popupToken) {
    return { token: popupToken, popupBlocked: false }
  }

  ssoLog('popup failed, trying iframe fallback')
  const iframeToken = await requestHightribeTokenViaBridge(options?.iframeTimeoutMs ?? 3000)
  return { token: iframeToken, popupBlocked: false }
}

export function clearHightribeSsoParams(): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (!url.searchParams.has('ht_sso') && !url.searchParams.has('ht_token')) return
  url.searchParams.delete('ht_sso')
  url.searchParams.delete('ht_token')
  const next = url.pathname + (url.search || '') + url.hash
  window.history.replaceState({}, '', next)
}
