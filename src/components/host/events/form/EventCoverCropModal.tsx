'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Cropper, { type Area, type Point } from 'react-easy-crop'
import Slider from 'rc-slider'
import 'rc-slider/assets/index.css'
import {
  COVER_ACCEPTED_EXTENSIONS,
  validateCoverFile,
} from '@/lib/galleryUploadLimits'
import {
  generateWideCoverAlignedToSquareCrop,
  getCroppedImgWithRotation,
  resizeImageFileMaxWidth,
} from '@/utils/cropImage'

export type CroppedCoverPair = { square1x1: File; wide3x1: File }

type EventCoverCropModalProps = {
  open: boolean
  onClose: () => void
  title?: string
  aspectRatio?: number
  aspectRatioLabel?: string
  nativeCropUI?: boolean
  nativeCropTheme?: 'light' | 'dark'
  initialImageSrc?: string | null
  onCroppedFile?: (file: File) => void
  onCroppedCoverPair?: (pair: CroppedCoverPair) => void
  onError?: (message: string) => void
}

const ACCENT = '#E74294'

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function NativeCropScreen({
  imageSrc,
  aspectRatio,
  aspectRatioLabel,
  theme,
  title,
  onCancel,
  onApply,
  processing,
  crop,
  setCrop,
  zoom,
  setZoom,
  rotation,
  setRotation,
  setCroppedAreaPixels,
}: {
  imageSrc: string
  aspectRatio: number
  aspectRatioLabel: string
  theme: 'light' | 'dark'
  title: string
  onCancel: () => void
  onApply: () => void
  processing: boolean
  crop: Point
  setCrop: (c: Point) => void
  zoom: number
  setZoom: (z: number) => void
  rotation: number
  setRotation: (r: number) => void
  setCroppedAreaPixels: (a: Area | null) => void
}) {
  const isLight = theme === 'light'
  const bg = isLight ? '#ffffff' : '#000000'
  const text = isLight ? '#1c1816' : '#ffffff'
  const muted = isLight ? '#7a7268' : '#aaaaaa'
  const toolbarBg = isLight ? '#ffffff' : '#111111'
  const border = isLight ? '#e5e0d8' : '#333333'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: bg,
        display: 'flex',
        flexDirection: 'column',
        color: text,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: `1px solid ${border}`,
          background: toolbarBg,
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel"
          style={{
            background: 'none',
            border: 'none',
            fontSize: 22,
            cursor: 'pointer',
            color: text,
            padding: '4px 8px',
            lineHeight: 1,
          }}
        >
          ✕
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
          <div style={{ fontSize: 12, color: muted }}>{aspectRatioLabel} locked</div>
        </div>
        <button
          type="button"
          onClick={onApply}
          disabled={processing}
          aria-label="Apply crop"
          style={{
            background: 'none',
            border: 'none',
            fontSize: 22,
            cursor: processing ? 'wait' : 'pointer',
            color: ACCENT,
            padding: '4px 8px',
            lineHeight: 1,
            opacity: processing ? 0.5 : 1,
          }}
        >
          ✓
        </button>
      </div>

      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={aspectRatio}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onRotationChange={setRotation}
          onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
          showGrid
          style={{
            containerStyle: { background: bg },
            cropAreaStyle: { border: `2px solid ${ACCENT}` },
          }}
        />
      </div>

      <div
        style={{
          padding: '16px 20px 24px',
          borderTop: `1px solid ${border}`,
          background: toolbarBg,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <span style={{ fontSize: 12, color: muted, width: 36 }}>Zoom</span>
          <div style={{ flex: 1 }}>
            <Slider
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={v => setZoom(Array.isArray(v) ? v[0] : v)}
              styles={{
                track: { background: ACCENT },
                handle: { borderColor: ACCENT, background: ACCENT, opacity: 1 },
                rail: { background: isLight ? '#e5e0d8' : '#444' },
              }}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => setRotation((rotation + 90) % 360)}
          style={{
            background: isLight ? '#f7f5f2' : '#222',
            border: `1px solid ${border}`,
            borderRadius: 8,
            color: text,
            padding: '8px 16px',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Rotate +90°
        </button>
      </div>
    </div>
  )
}

export function EventCoverCropModal({
  open,
  onClose,
  title = 'Crop Cover',
  aspectRatio = 1,
  aspectRatioLabel = '1:1',
  nativeCropUI = false,
  nativeCropTheme = 'dark',
  initialImageSrc,
  onCroppedFile,
  onCroppedCoverPair,
  onError,
}: EventCoverCropModalProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [processing, setProcessing] = useState(false)
  const [mounted, setMounted] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setMounted(true) }, [])

  const resetCropState = useCallback(() => {
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setRotation(0)
    setCroppedAreaPixels(null)
  }, [])

  useEffect(() => {
    if (!open) {
      setImageSrc(null)
      resetCropState()
      return
    }
    if (initialImageSrc) {
      setImageSrc(initialImageSrc)
      resetCropState()
    }
  }, [open, initialImageSrc, resetCropState])

  const reportError = useCallback((msg: string) => {
    onError?.(msg)
  }, [onError])

  const handleFilePick = async (file: File) => {
    const err = validateCoverFile(file)
    if (err) {
      reportError(err)
      return
    }
    try {
      const dataUrl = await readFileAsDataUrl(file)
      setImageSrc(dataUrl)
      resetCropState()
    } catch {
      reportError('Could not read image file')
    }
  }

  const handleApply = async () => {
    if (!imageSrc || !croppedAreaPixels) {
      reportError('Please adjust the crop area')
      return
    }

    setProcessing(true)
    try {
      const square = await getCroppedImgWithRotation(
        imageSrc,
        croppedAreaPixels,
        rotation,
        'cover-square.jpg',
      )
      const squareResized = await resizeImageFileMaxWidth(square, 1080)

      if (onCroppedCoverPair) {
        const wide = await generateWideCoverAlignedToSquareCrop(
          imageSrc,
          croppedAreaPixels,
          rotation,
          'cover-wide.jpg',
        )
        const wideResized = await resizeImageFileMaxWidth(wide, 2160)
        onCroppedCoverPair({ square1x1: squareResized, wide3x1: wideResized })
      } else if (onCroppedFile) {
        onCroppedFile(squareResized)
      }

      onClose()
    } catch {
      reportError('Failed to crop image')
    } finally {
      setProcessing(false)
    }
  }

  const handleCropChange = (c: Point) => setCrop(c)
  const handleZoomChange = (z: number) => setZoom(z)
  const handleRotationChange = (r: number) => setRotation(r)

  if (!open || !mounted) return null

  const showPicker = !imageSrc && !initialImageSrc

  const cropScreen = imageSrc && nativeCropUI ? (
    <NativeCropScreen
      imageSrc={imageSrc}
      aspectRatio={aspectRatio}
      aspectRatioLabel={aspectRatioLabel}
      theme={nativeCropTheme}
      title={title}
      onCancel={onClose}
      onApply={handleApply}
      processing={processing}
      crop={crop}
      setCrop={handleCropChange}
      zoom={zoom}
      setZoom={handleZoomChange}
      rotation={rotation}
      setRotation={handleRotationChange}
      setCroppedAreaPixels={setCroppedAreaPixels}
    />
  ) : null

  const legacyModal = imageSrc && !nativeCropUI ? (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 12, padding: 20, maxWidth: 480, width: '100%' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ position: 'relative', height: 300, marginBottom: 16 }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={aspectRatio}
            onCropChange={handleCropChange}
            onZoomChange={handleZoomChange}
            onRotationChange={handleRotationChange}
            onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
            showGrid
          />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" onClick={handleApply} disabled={processing}>
            {processing ? 'Processing…' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  ) : null

  const pickerOverlay = showPicker ? (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: '24px 28px',
          maxWidth: 400,
          width: '100%',
          textAlign: 'center',
        }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 8px', fontSize: 17 }}>{title}</h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: '#7a7268' }}>
          JPEG or PNG · {aspectRatioLabel} crop
        </p>
        <label
          style={{
            display: 'inline-block',
            background: ACCENT,
            color: '#fff',
            padding: '10px 24px',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Choose image
          <input
            ref={fileInputRef}
            type="file"
            accept={COVER_ACCEPTED_EXTENSIONS}
            hidden
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) void handleFilePick(file)
              e.target.value = ''
            }}
          />
        </label>
        <button
          type="button"
          onClick={onClose}
          style={{
            display: 'block',
            margin: '16px auto 0',
            background: 'none',
            border: 'none',
            color: '#7a7268',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  ) : null

  return createPortal(
    <>
      {pickerOverlay}
      {cropScreen}
      {legacyModal}
    </>,
    document.body,
  )
}
