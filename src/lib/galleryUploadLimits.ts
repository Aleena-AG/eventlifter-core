export const GALLERY_MIN_FILE_BYTES = 100 * 1024
export const GALLERY_MAX_FILE_BYTES = 8 * 1024 * 1024

export const COVER_ACCEPTED_TYPES = ['image/jpeg', 'image/png'] as const
export const COVER_ACCEPTED_EXTENSIONS = '.jpg,.jpeg,.png'

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function validateCoverFile(file: File): string | null {
  if (!COVER_ACCEPTED_TYPES.includes(file.type as (typeof COVER_ACCEPTED_TYPES)[number])) {
    return 'Please upload a JPEG or PNG image'
  }
  if (file.size < GALLERY_MIN_FILE_BYTES) {
    return `Image is too small (min ${formatFileSize(GALLERY_MIN_FILE_BYTES)})`
  }
  if (file.size > GALLERY_MAX_FILE_BYTES) {
    return `Image is too large (max ${formatFileSize(GALLERY_MAX_FILE_BYTES)})`
  }
  return null
}
