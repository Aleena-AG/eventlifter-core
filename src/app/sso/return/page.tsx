'use client'

/**
 * Landing page for the HighTribe SSO popup redirect flow.
 * The HighTribe bridge redirects the popup here with ?ht_token=... (or #ht_token=...).
 * The opener (login/signup page) polls this popup's location to read the token,
 * so this page just needs to be same-origin and hold the token in the URL.
 */
export default function SsoReturnPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
        color: '#8C7F6D',
        background: '#FBF7F0',
      }}
    >
      <p>Signing you in… you can close this window.</p>
    </div>
  )
}
