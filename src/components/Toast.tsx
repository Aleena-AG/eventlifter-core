'use client'

import { useState, useEffect, useCallback } from 'react'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastItem {
  id: string
  message: string
  type: ToastType
}

interface ToastProps {
  toasts: ToastItem[]
  onRemove: (id: string) => void
}

export function Toast({ toasts, onRemove }: ToastProps) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onRemove }: { toast: ToastItem; onRemove: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onRemove(toast.id), 4000)
    return () => clearTimeout(timer)
  }, [toast.id, onRemove])

  const colors: Record<ToastType, { bg: string; border: string; accent: string; icon: string }> = {
    success: { bg: '#F0F6EE', border: '#4E7A4B', accent: '#4E7A4B', icon: '✓' },
    error: { bg: '#FBF0EB', border: '#C2502E', accent: '#C2502E', icon: '✕' },
    info: { bg: '#F6E9D4', border: '#D98A2B', accent: '#B66F1C', icon: 'ℹ' },
  }

  const c = colors[toast.type]

  return (
    <div
      style={{
        pointerEvents: 'auto',
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: '11px',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        minWidth: '280px',
        maxWidth: '380px',
        boxShadow: '0 8px 24px rgba(33, 27, 22, 0.08)',
        animation: 'slideIn 0.2s ease-out',
        cursor: 'pointer',
      }}
      onClick={() => onRemove(toast.id)}
    >
      <span style={{ color: c.accent, fontWeight: 'bold', fontSize: '14px' }}>{c.icon}</span>
      <span style={{ color: '#211B16', fontSize: '14px', flex: 1 }}>{toast.message}</span>
    </div>
  )
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { id, message, type }])
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = {
    success: (msg: string) => addToast(msg, 'success'),
    error: (msg: string) => addToast(msg, 'error'),
    info: (msg: string) => addToast(msg, 'info'),
  }

  return { toasts, toast, removeToast }
}
