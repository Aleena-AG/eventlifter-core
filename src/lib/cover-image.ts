'use client'

import { channelFetch } from '@/lib/channel-fetch'

export type EventCoverFiles = { cover?: File | null }

function isHttpUrl(v: string): boolean {
  return /^https?:\/\//i.test(v.trim())
}

async function fileFromUrl(url: string): Promise<File | undefined> {
  try {
    const res = await channelFetch('/api/cover/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    if (!res.ok) return undefined
    const blob = await res.blob()
    const type = blob.type || 'image/jpeg'
    const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg'
    return new File([blob], `cover.${ext}`, { type })
  } catch {
    return undefined
  }
}

/** Resolve a public cover URL for Luma / Eventbrite (upload file to Luma when needed). */
export async function resolveCoverUrl(
  coverUrl: string,
  coverFile?: File | null,
): Promise<string | undefined> {
  const url = coverUrl.trim()
  if (isHttpUrl(url)) return url
  const file = coverFile || (url ? await fileFromUrl(url) : undefined)
  if (!file) return undefined

  try {
    const metaRes = await channelFetch('/api/luma/images/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content_type: file.type || 'image/jpeg' }),
    })
    const metaRaw = await metaRes.json() as {
      status?: string
      message?: string
      data?: Record<string, unknown>
    }
    if (!metaRes.ok || metaRaw.status === 'error') {
      throw new Error(metaRaw.message || `Upload URL failed (${metaRes.status})`)
    }
    const data = metaRaw.data || {}
    const uploadUrl = String(data.upload_url || data.uploadUrl || '')
    const publicUrl = String(
      data.public_url || data.publicUrl || data.url || data.image_url || data.file_url || '',
    )
    if (!uploadUrl) throw new Error('Luma did not return an upload URL')

    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'image/jpeg' },
      body: file,
    })
    if (!putRes.ok) throw new Error(`Cover upload failed (${putRes.status})`)
    return publicUrl || undefined
  } catch {
    return undefined
  }
}

/** File for Hightribe multipart `cover_image` field. */
export async function resolveCoverFileForHt(
  coverUrl: string,
  coverFile?: File | null,
): Promise<File | undefined> {
  if (coverFile) return coverFile
  const url = coverUrl.trim()
  if (isHttpUrl(url)) return fileFromUrl(url)
  return undefined
}

function appendFormValue(form: FormData, key: string, value: unknown) {
  if (value == null || value === '') return
  if (Array.isArray(value)) {
    value.forEach((item, index) => appendFormValue(form, `${key}[${index}]`, item))
    return
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      appendFormValue(form, `${key}[${k}]`, v)
    }
    return
  }
  form.append(key, String(value))
}

export function buildHtFormData(body: Record<string, unknown>, coverFile?: File): FormData {
  const form = new FormData()
  for (const [key, value] of Object.entries(body)) {
    appendFormValue(form, key, value)
  }
  if (coverFile) form.append('cover_image', coverFile)
  return form
}

export async function postHtEvent(
  url: string,
  body: Record<string, unknown>,
  method: 'POST' | 'PUT',
  coverFile?: File,
): Promise<Response> {
  if (coverFile) {
    return channelFetch(url, {
      method,
      body: buildHtFormData(body, coverFile),
    })
  }
  return channelFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
