'use client'

import { EWENTCAST_LOGO } from '@/lib/brand'

type EwentcastLogoProps = {
  height?: number
  /** Hide the tagline strip at the bottom of the logo image */
  wordmarkOnly?: boolean
  style?: React.CSSProperties
  className?: string
}

export function EwentcastLogo({
  height = 40,
  wordmarkOnly = false,
  style,
  className,
}: EwentcastLogoProps) {
  if (!wordmarkOnly) {
    return (
      <img
        src={EWENTCAST_LOGO}
        alt="Ewentcast"
        height={height}
        className={className}
        style={{
          height,
          width: 'auto',
          maxWidth: '100%',
          display: 'block',
          objectFit: 'contain',
          ...style,
        }}
      />
    )
  }

  return (
    <div
      className={className}
      style={{
        height,
        width: '100%',
        overflow: 'hidden',
        lineHeight: 0,
        ...style,
      }}
    >
      <img
        src={EWENTCAST_LOGO}
        alt="Ewentcast"
        style={{
          width: '100%',
          height: 'auto',
          display: 'block',
        }}
      />
    </div>
  )
}
