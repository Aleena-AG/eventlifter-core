'use client'

import { EWENTCAST_LOGO } from '@/lib/brand'

type EwentcastLogoProps = {
  height?: number
  style?: React.CSSProperties
  className?: string
}

export function EwentcastLogo({ height = 40, style, className }: EwentcastLogoProps) {
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
