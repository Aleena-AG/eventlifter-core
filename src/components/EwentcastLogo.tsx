'use client'

import { EWENTCAST_LOGO } from '@/lib/brand'

/** Source asset is 2170×725; wordmark ends around 72% from the top */
const LOGO_WIDTH = 2170
const LOGO_HEIGHT = 725
const WORDMARK_HEIGHT = 520

type EwentcastLogoProps = {
  height?: number
  /** Scale to container width; shows the full logo including tagline */
  responsive?: boolean
  /** Hide the tagline strip at the bottom of the logo image */
  wordmarkOnly?: boolean
  /** Dark band behind logo so cream wordmark stays readable on light pages */
  onLight?: boolean
  style?: React.CSSProperties
  className?: string
}

export function EwentcastLogo({
  height = 40,
  responsive = false,
  wordmarkOnly = false,
  onLight = false,
  style,
  className,
}: EwentcastLogoProps) {
  const logo = responsive && !wordmarkOnly ? (
    <img
      src={EWENTCAST_LOGO}
      alt="Ewentcast"
      className={onLight ? undefined : className}
      style={{
        width: '100%',
        height: 'auto',
        maxWidth: '100%',
        display: 'block',
        objectFit: 'contain',
        ...(onLight ? undefined : style),
      }}
    />
  ) : !wordmarkOnly ? (
    <img
      src={EWENTCAST_LOGO}
      alt="Ewentcast"
      height={height}
      className={onLight ? undefined : className}
      style={{
        height,
        width: 'auto',
        maxWidth: '100%',
        display: 'block',
        objectFit: 'contain',
        ...(onLight ? undefined : style),
      }}
    />
  ) : (
    <div
      className={onLight ? undefined : className}
      style={{
        width: '100%',
        maxWidth: height * (LOGO_WIDTH / WORDMARK_HEIGHT),
        aspectRatio: `${LOGO_WIDTH} / ${WORDMARK_HEIGHT}`,
        overflow: 'hidden',
        lineHeight: 0,
        ...(onLight ? undefined : style),
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

  if (!onLight) return logo

  return (
    <div
      className={['ewentcast-logo-band', className].filter(Boolean).join(' ')}
      style={style}
    >
      {logo}
    </div>
  )
}
