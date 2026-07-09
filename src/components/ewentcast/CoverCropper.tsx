'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

const ASPECT = 1 // fixed 1:1 (square) crop

const MAX_ZOOM = 4
const MAX_OUTPUT_WIDTH = 1600

interface Props {
  file: File
  onCancel: () => void
  onCropped: (file: File, previewUrl: string) => void
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function CoverCropper({ file, onCancel, onCropped }: Props) {
  const stageRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null)

  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [stageW, setStageW] = useState(0)
  const [maxH, setMaxH] = useState(420)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [exporting, setExporting] = useState(false)

  const aspect = ASPECT
  // Size the viewport explicitly so the crop math always matches the rendered box.
  const viewW = stageW > 0 ? Math.min(stageW, maxH * aspect) : 0
  const viewH = viewW / aspect

  // Load the selected file into an Image element.
  useEffect(() => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => setImg(image)
    image.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  // Measure the available stage width + cap height to the viewport.
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const update = () => {
      setStageW(el.clientWidth)
      setMaxH(Math.max(220, Math.round(window.innerHeight * 0.55)))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('resize', update)
    return () => { ro.disconnect(); window.removeEventListener('resize', update) }
  }, [])

  const baseScale = img && viewW > 0 && viewH > 0
    ? Math.max(viewW / img.naturalWidth, viewH / img.naturalHeight)
    : 1
  const scale = baseScale * zoom
  const dispW = img ? img.naturalWidth * scale : 0
  const dispH = img ? img.naturalHeight * scale : 0

  const clampOffset = useCallback(
    (x: number, y: number, w: number, h: number) => ({
      x: clamp(x, viewW - w, 0),
      y: clamp(y, viewH - h, 0),
    }),
    [viewW, viewH],
  )

  // Re-center whenever the image or viewport changes.
  useEffect(() => {
    if (!img || viewW <= 0 || viewH <= 0) return
    setZoom(1)
    const w = img.naturalWidth * baseScale
    const h = img.naturalHeight * baseScale
    setOffset({ x: (viewW - w) / 2, y: (viewH - h) / 2 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, viewW, viewH])

  const applyZoom = (nextZoom: number) => {
    const z = clamp(nextZoom, 1, MAX_ZOOM)
    const oldScale = baseScale * zoom
    const newScale = baseScale * z
    const cx = viewW / 2
    const cy = viewH / 2
    const nx = cx - (cx - offset.x) * (newScale / oldScale)
    const ny = cy - (cy - offset.y) * (newScale / oldScale)
    if (!img) return
    setZoom(z)
    setOffset(clampOffset(nx, ny, img.naturalWidth * newScale, img.naturalHeight * newScale))
  }

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const nx = d.ox + (e.clientX - d.px)
    const ny = d.oy + (e.clientY - d.py)
    setOffset(clampOffset(nx, ny, dispW, dispH))
  }
  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* noop */ }
  }
  const onWheel = (e: React.WheelEvent) => {
    if (!img) return
    applyZoom(zoom - e.deltaY * 0.0015)
  }

  const handleApply = () => {
    if (!img || viewW <= 0 || viewH <= 0) return
    setExporting(true)
    const sx = -offset.x / scale
    const sy = -offset.y / scale
    const sW = viewW / scale
    const sH = viewH / scale
    const outW = Math.min(MAX_OUTPUT_WIDTH, Math.round(sW))
    const outH = Math.round(outW * (viewH / viewW))

    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d')
    if (!ctx) { setExporting(false); return }
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, sx, sy, sW, sH, 0, 0, outW, outH)

    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
    const ext = type === 'image/png' ? 'png' : 'jpg'
    canvas.toBlob(
      blob => {
        setExporting(false)
        if (!blob) return
        const cropped = new File([blob], `cover.${ext}`, { type })
        onCropped(cropped, URL.createObjectURL(blob))
      },
      type,
      0.92,
    )
  }

  return (
    <div className="ew-crop-overlay" role="dialog" aria-modal="true" aria-label="Crop cover photo">
      <div className="ew-crop-panel">
        <div className="ew-crop-head">
          <div>
            <span className="ew-eyebrow">Cover photo</span>
            <h3 className="ew-crop-title">Crop &amp; position · 1:1</h3>
          </div>
          <button type="button" className="ew-modal-close ew-crop-close" onClick={onCancel} aria-label="Cancel">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div ref={stageRef} className="ew-crop-stage">
          <div
            className="ew-crop-viewport"
            style={{ width: viewW || undefined, height: viewH || undefined }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
          >
            {img && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={img.src}
                alt=""
                className="ew-crop-img"
                draggable={false}
                style={{
                  width: dispW,
                  height: dispH,
                  transform: `translate(${offset.x}px, ${offset.y}px)`,
                }}
              />
            )}
            <div className="ew-crop-grid" aria-hidden="true" />
          </div>
        </div>

        <div className="ew-crop-zoom">
          <span aria-hidden="true">−</span>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={e => applyZoom(Number(e.target.value))}
            aria-label="Zoom"
          />
          <span aria-hidden="true">+</span>
        </div>

        <div className="ew-crop-foot">
          <span className="ew-crop-hint">Drag to reposition · scroll or slider to zoom</span>
          <div className="ew-crop-actions">
            <button type="button" className="ew-btn ghost" onClick={onCancel} disabled={exporting}>
              Cancel
            </button>
            <button type="button" className="ew-btn primary" onClick={handleApply} disabled={!img || exporting}>
              {exporting ? 'Applying…' : 'Apply crop'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
