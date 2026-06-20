'use client'

type LoaderSize = 'sm' | 'md' | 'lg'

const SIZE_PX: Record<LoaderSize, number> = { sm: 16, md: 28, lg: 44 }

/** Round spinner — inline styles only so Tailwind/preflight cannot flatten it to a square */
export function Spinner({
  size = 24,
  color = '#388bfd',
}: {
  size?: number
  color?: string
}) {
  const border = Math.max(2, Math.round(size / 8))
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        borderRadius: '50%',
        borderStyle: 'solid',
        borderWidth: border,
        borderColor: '#30363d',
        borderTopColor: color,
        boxSizing: 'border-box',
        flexShrink: 0,
        animation: 'el-spinner-rotate 0.75s linear infinite',
      }}
    />
  )
}

export function Loader({
  size = 'md',
  label,
  inline = false,
}: {
  size?: LoaderSize
  label?: string
  inline?: boolean
}) {
  const px = SIZE_PX[size]
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label || 'Loading'}
      style={{
        display: 'flex',
        flexDirection: inline ? 'row' : 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: inline ? 10 : 12,
      }}
    >
      <Spinner size={px} />
      {label && (
        <span style={{ fontSize: size === 'sm' ? 12 : 14, color: '#8b949e' }}>{label}</span>
      )}
    </div>
  )
}

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 180,
        padding: '40px 24px',
      }}
    >
      <Loader size="lg" label={label} />
    </div>
  )
}

export function InlineLoader({ label }: { label?: string }) {
  if (label) {
    return <Loader size="sm" label={label} inline />
  }
  return <Spinner size={16} />
}

export function StatLoader() {
  return <Spinner size={18} />
}
