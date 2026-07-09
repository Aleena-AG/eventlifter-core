'use client'

import { useEffect, useState } from 'react'
import type { ChannelKey } from '@/lib/types'
import { EwentcastWizard } from './EwentcastWizard'
import '@/app/create/ewentcast.css'

interface Props {
  open: boolean
  onClose: () => void
  onPublished?: (updatedChannels?: ChannelKey[]) => void
  mode?: 'create' | 'edit'
  editChannel?: ChannelKey
  editEventId?: string | number
  editChannelIds?: Partial<Record<ChannelKey, string | number>>
}

export function CreateEventWizardModal({
  open, onClose, onPublished, mode = 'create', editChannel, editEventId, editChannelIds,
}: Props) {
  const [mountKey, setMountKey] = useState(0)

  useEffect(() => {
    if (open) setMountKey(k => k + 1)
  }, [open, mode, editChannel, editEventId, editChannelIds])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!open) return null

  return (
    <div
      className="ew-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'edit' ? 'Edit event' : 'Create event'}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="ew-modal-panel">
        <button type="button" className="ew-modal-close" onClick={onClose} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <EwentcastWizard
          key={mountKey}
          modal
          mode={mode}
          editChannel={editChannel}
          editEventId={editEventId}
          editChannelIds={editChannelIds}
          onClose={onClose}
          onDone={(updatedChannels) => {
            // Close first so a slow/failing refresh never leaves the modal stuck open.
            onClose()
            void Promise.resolve(onPublished?.(updatedChannels)).catch(() => {})
          }}
        />
      </div>
    </div>
  )
}
