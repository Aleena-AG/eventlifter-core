'use client'

import { useState, useEffect, useCallback } from 'react'
import { getHealth } from '@/lib/api'

export function Topbar() {
  const [apiOk, setApiOk] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(false)

  const checkHealth = useCallback(async () => {
    setChecking(true)
    try {
      const data = await getHealth()
      setApiOk(data.ok)
    } catch {
      setApiOk(false)
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    checkHealth()
    const interval = setInterval(checkHealth, 30000)
    return () => clearInterval(interval)
  }, [checkHealth])

  const dotColor =
    apiOk === null ? '#8C7F6D' : apiOk ? '#4E7A4B' : '#C2502E'
  const dotLabel =
    apiOk === null ? 'Checking…' : apiOk ? 'API Online' : 'API Offline'

  return (
    <header
      style={{
        height: '56px',
        background: '#FFFFFF',
        borderBottom: '1px solid #E8DFD0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        padding: '0 24px',
        gap: '12px',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: dotColor,
            display: 'inline-block',
            boxShadow: apiOk ? `0 0 6px ${dotColor}` : 'none',
          }}
        />
        <span style={{ fontSize: '12px', color: '#8C7F6D' }}>{dotLabel}</span>
      </div>
      <button
        onClick={checkHealth}
        disabled={checking}
        style={{
          background: '#F1EADC',
          border: '1px solid #E8DFD0',
          borderRadius: '6px',
          color: '#8C7F6D',
          padding: '5px 12px',
          fontSize: '12px',
          cursor: checking ? 'default' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          opacity: checking ? 0.6 : 1,
        }}
      >
        <span style={{ display: 'inline-block', transform: checking ? 'rotate(360deg)' : 'none', transition: 'transform 0.5s' }}>↻</span>
        Refresh
      </button>
    </header>
  )
}
