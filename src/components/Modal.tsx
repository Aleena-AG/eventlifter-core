'use client'

import { useEffect } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  width?: number
}

export function Modal({ open, onClose, title, children, width = 600 }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '48px 16px',
        overflowY: 'auto',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(2px)',
        }}
      />
      {/* Modal panel */}
      <div
        style={{
          position: 'relative',
          background: '#FFFFFF',
          border: '1px solid #E8DFD0',
          borderRadius: '10px',
          width: '100%',
          maxWidth: `${width}px`,
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px',
            borderBottom: '1px solid #E8DFD0',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#211B16' }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#8C7F6D',
              cursor: 'pointer',
              fontSize: '20px',
              padding: '0 4px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        {/* Body */}
        <div style={{ padding: '24px' }}>{children}</div>
      </div>
    </div>
  )
}
