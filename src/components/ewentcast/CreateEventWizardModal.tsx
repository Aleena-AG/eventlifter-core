'use client'

import { useEffect, useState } from 'react'
import type { ChannelKey } from '@/lib/types'
import { EwentcastWizard } from './EwentcastWizard'
import '@/app/create/ewentcast.css'

interface Props {
  open: boolean
  onClose: () => void
  onPublished?: () => void
  mode?: 'create' | 'edit'
  editChannel?: ChannelKey
  editEventId?: string | number
}

export function CreateEventWizardModal({
  open, onClose, onPublished, mode = 'create', editChannel, editEventId,
}: Props) {
  const [mountKey, setMountKey] = useState(0)

  useEffect(() => {
    if (open) setMountKey(k => k + 1)
  }, [open, mode, editChannel, editEventId])

  if (!open) return null

  return (
    <div
      className="ew-modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="ew-modal-panel">
        <button type="button" className="ew-modal-close" onClick={onClose} aria-label="Close">×</button>
        <EwentcastWizard
          key={mountKey}
          modal
          mode={mode}
          editChannel={editChannel}
          editEventId={editEventId}
          onClose={onClose}
          onDone={() => { onPublished?.(); onClose() }}
        />
      </div>
    </div>
  )
}
