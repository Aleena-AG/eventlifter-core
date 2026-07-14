'use client'

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div
      style={{
        minHeight: '50vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 24,
        textAlign: 'center',
      }}
    >
      <h1 style={{ margin: 0, fontSize: 22 }}>Dashboard couldn&apos;t load</h1>
      <p style={{ margin: 0, opacity: 0.7, maxWidth: 360 }}>
        Something went wrong while rendering overview data. Try again.
      </p>
      <button
        type="button"
        onClick={reset}
        style={{
          marginTop: 8,
          padding: '10px 16px',
          borderRadius: 8,
          border: 'none',
          background: '#ff4b2b',
          color: '#fff',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Reload dashboard
      </button>
    </div>
  )
}
