import type { Area } from 'react-easy-crop'

const JPEG_QUALITY = 0.93

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', reject)
    image.crossOrigin = 'anonymous'
    image.src = url
  })
}

function getRadianAngle(degree: number) {
  return (degree * Math.PI) / 180
}

function rotateSize(width: number, height: number, rotation: number) {
  const rotRad = getRadianAngle(rotation)
  return {
    width: Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height: Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  }
}

async function getCroppedCanvas(
  imageSrc: string,
  pixelCrop: Area,
  rotation = 0,
): Promise<HTMLCanvasElement> {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')

  const rotRad = getRadianAngle(rotation)
  const { width: bBoxWidth, height: bBoxHeight } = rotateSize(image.width, image.height, rotation)

  canvas.width = bBoxWidth
  canvas.height = bBoxHeight

  ctx.translate(bBoxWidth / 2, bBoxHeight / 2)
  ctx.rotate(rotRad)
  ctx.translate(-image.width / 2, -image.height / 2)
  ctx.drawImage(image, 0, 0)

  const croppedCanvas = document.createElement('canvas')
  const croppedCtx = croppedCanvas.getContext('2d')
  if (!croppedCtx) throw new Error('Canvas not supported')

  croppedCanvas.width = pixelCrop.width
  croppedCanvas.height = pixelCrop.height

  croppedCtx.drawImage(
    canvas,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height,
  )

  return croppedCanvas
}

async function canvasToJpegFile(canvas: HTMLCanvasElement, fileName: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (!blob) {
          reject(new Error('Failed to export image'))
          return
        }
        resolve(new File([blob], fileName, { type: 'image/jpeg' }))
      },
      'image/jpeg',
      JPEG_QUALITY,
    )
  })
}

export async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
  rotation = 0,
  fileName = 'cover.jpg',
): Promise<File> {
  const canvas = await getCroppedCanvas(imageSrc, pixelCrop, rotation)
  return canvasToJpegFile(canvas, fileName)
}

export const getCroppedImgWithRotation = getCroppedImg

export async function resizeImageFileMaxWidth(file: File, maxWidth: number): Promise<File> {
  const url = URL.createObjectURL(file)
  try {
    const image = await createImage(url)
    if (image.width <= maxWidth) return file

    const scale = maxWidth / image.width
    const canvas = document.createElement('canvas')
    canvas.width = maxWidth
    canvas.height = Math.round(image.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas not supported')
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvasToJpegFile(canvas, file.name)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Wide 3:1 crop aligned to the same center as the square selection. */
export async function generateWideCoverAlignedToSquareCrop(
  imageSrc: string,
  squareCrop: Area,
  rotation = 0,
  fileName = 'cover-wide.jpg',
): Promise<File> {
  const squareSize = squareCrop.width
  const wideWidth = squareSize * 3
  const wideHeight = squareSize
  const centerX = squareCrop.x + squareSize / 2
  const centerY = squareCrop.y + squareSize / 2

  const wideCrop: Area = {
    x: centerX - wideWidth / 2,
    y: centerY - wideHeight / 2,
    width: wideWidth,
    height: wideHeight,
  }

  const image = await createImage(imageSrc)
  const rotRad = getRadianAngle(rotation)
  const { width: bBoxWidth, height: bBoxHeight } = rotateSize(image.width, image.height, rotation)

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')

  canvas.width = bBoxWidth
  canvas.height = bBoxHeight
  ctx.translate(bBoxWidth / 2, bBoxHeight / 2)
  ctx.rotate(rotRad)
  ctx.translate(-image.width / 2, -image.height / 2)
  ctx.drawImage(image, 0, 0)

  const outCanvas = document.createElement('canvas')
  outCanvas.width = wideWidth
  outCanvas.height = wideHeight
  const outCtx = outCanvas.getContext('2d')
  if (!outCtx) throw new Error('Canvas not supported')

  outCtx.fillStyle = '#ffffff'
  outCtx.fillRect(0, 0, wideWidth, wideHeight)

  const srcX = Math.max(0, wideCrop.x)
  const srcY = Math.max(0, wideCrop.y)
  const srcRight = Math.min(bBoxWidth, wideCrop.x + wideWidth)
  const srcBottom = Math.min(bBoxHeight, wideCrop.y + wideHeight)
  const srcW = srcRight - srcX
  const srcH = srcBottom - srcY

  if (srcW > 0 && srcH > 0) {
    const destX = srcX - wideCrop.x
    const destY = srcY - wideCrop.y
    outCtx.drawImage(canvas, srcX, srcY, srcW, srcH, destX, destY, srcW, srcH)
  }

  return canvasToJpegFile(outCanvas, fileName)
}
