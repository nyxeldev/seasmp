'use client'
import { useState, useRef, useEffect } from 'react'
import { useLocale, type Locale } from '@/store/locale'

function UZFlag() {
  return (
    <svg width="20" height="14" viewBox="0 0 20 14" style={{ borderRadius: '2px', display: 'block' }}>
      <rect width="20" height="4.67" fill="#1EB2E8"/>
      <rect y="4.67" width="20" height="4.67" fill="#FFFFFF"/>
      <rect y="9.33" width="20" height="4.67" fill="#3BB06B"/>
      <rect y="4.17" width="20" height="0.5" fill="#E8112D"/>
      <rect y="9.17" width="20" height="0.5" fill="#E8112D"/>
      <circle cx="4" cy="2.3" r="1.5" fill="white"/>
      <circle cx="5" cy="2.3" r="1.5" fill="#1EB2E8"/>
    </svg>
  )
}

function RUFlag() {
  return (
    <svg width="20" height="14" viewBox="0 0 20 14" style={{ borderRadius: '2px', display: 'block' }}>
      <rect width="20" height="4.67" fill="#FFFFFF"/>
      <rect y="4.67" width="20" height="4.67" fill="#0039A6"/>
      <rect y="9.33" width="20" height="4.67" fill="#D52B1E"/>
    </svg>
  )
}

function GBFlag() {
  return (
    <svg width="20" height="14" viewBox="0 0 20 14" style={{ borderRadius: '2px', display: 'block' }}>
      <rect width="20" height="14" fill="#012169"/>
      <path d="M0 0 L20 14 M20 0 L0 14" stroke="white" strokeWidth="2.8"/>
      <path d="M0 0 L20 14 M20 0 L0 14" stroke="#C8102E" strokeWidth="1.6"/>
      <path d="M10 0 V14 M0 7 H20" stroke="white" strokeWidth="4.2"/>
      <path d="M10 0 V14 M0 7 H20" stroke="#C8102E" strokeWidth="2.5"/>
    </svg>
  )
}

const FLAGS: Record<Locale, React.ComponentType> = { uz: UZFlag, ru: RUFlag, en: GBFlag }

const LANGS: { code: Locale; label: string; short: string }[] = [
  { code: 'uz', label: "O'zbekcha", short: 'UZ' },
  { code: 'ru', label: 'Русский',   short: 'RU' },
  { code: 'en', label: 'English',   short: 'EN' },
]

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const active = LANGS.find(l => l.code === locale)!
  const Flag = FLAGS[locale]

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '5px 10px', borderRadius: '8px', cursor: 'pointer',
          border: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
          color: 'var(--color-text1)',
          fontSize: '13px', fontWeight: 500,
        }}
      >
        <Flag />
        <span>{active.short}</span>
        <span style={{ fontSize: '9px', opacity: 0.5, marginLeft: '2px' }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 6px)',
          minWidth: '160px', borderRadius: '12px',
          border: '1px solid var(--color-border)',
          background: 'var(--color-card)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
          overflow: 'hidden', zIndex: 9999,
        }}>
          {LANGS.map(lang => {
            const LangFlag = FLAGS[lang.code]
            return (
              <button
                key={lang.code}
                onClick={() => { setLocale(lang.code); setOpen(false) }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center',
                  gap: '10px', padding: '10px 16px', border: 'none',
                  background: locale === lang.code ? 'rgba(59,130,246,0.08)' : 'transparent',
                  cursor: 'pointer', fontSize: '13px', textAlign: 'left',
                  color: locale === lang.code ? '#3b82f6' : 'var(--color-text1)',
                  fontWeight: locale === lang.code ? 500 : 400,
                }}
              >
                <LangFlag />
                <span>{lang.label}</span>
                {locale === lang.code && <span style={{ marginLeft: 'auto', color: '#3b82f6' }}>✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
