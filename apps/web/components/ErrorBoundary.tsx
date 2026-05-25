'use client'

import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { hasError: boolean; error?: Error }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div style={{
          padding: '48px', textAlign: 'center',
          background: 'var(--color-card)', borderRadius: '12px',
          border: '1px solid var(--color-border)',
          margin: '24px',
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
          <p style={{ color: 'var(--color-text1)', fontWeight: 500, margin: '0 0 8px', fontSize: 16 }}>
            Xatolik yuz berdi
          </p>
          <p style={{ color: 'var(--color-text3)', fontSize: 13, margin: '0 0 24px', maxWidth: 400, marginLeft: 'auto', marginRight: 'auto' }}>
            {this.state.error?.message ?? 'Kutilmagan xatolik'}
          </p>
          <button
            onClick={() => { this.setState({ hasError: false }); window.location.reload() }}
            style={{
              padding: '8px 20px', background: '#3b82f6', color: 'white',
              border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14,
            }}
          >
            Qayta yuklash
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
