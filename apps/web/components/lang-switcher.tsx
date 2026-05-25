'use client'
import { useState, useRef, useEffect } from 'react'
import { useLocaleStore } from '@/store/locale'
import type { Locale } from '@/lib/i18n'

const LANGS: { code: Locale; label: string; short: string; flag: string }[] = [
  { code: 'uz', label: "O'zbekcha", short: 'UZ', flag: '🇺🇿' },
  { code: 'ru', label: 'Русский',   short: 'RU', flag: '🇷🇺' },
  { code: 'en', label: 'English',   short: 'EN', flag: '🇬🇧' },
]

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocaleStore()
  const [open, setOpen]       = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const active = LANGS.find(l => l.code === locale) ?? LANGS[0]

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display:     'flex',
          alignItems:  'center',
          gap:         '6px',
          padding:     '6px 10px',
          borderRadius: '8px',
          border:      '1px solid var(--color-border)',
          background:  'transparent',
          cursor:      'pointer',
          fontSize:    '13px',
          fontWeight:  500,
          color:       'var(--color-text2)',
        }}
      >
        <span style={{ fontSize: '16px', lineHeight: 1 }}>{active.flag}</span>
        <span style={{ color: 'var(--color-text1)' }}>{active.short}</span>
        <span style={{ fontSize: '10px', opacity: 0.5 }}>▾</span>
      </button>

      {open && (
        <div style={{
          position:     'absolute',
          right:        0,
          top:          'calc(100% + 8px)',
          minWidth:     '160px',
          borderRadius: '12px',
          border:       '1px solid var(--color-border)',
          background:   'var(--dropdown-bg, var(--color-card))',
          boxShadow:    '0 8px 24px rgba(0,0,0,0.12)',
          overflow:     'hidden',
          zIndex:       9999,
        }}>
          {LANGS.map(lang => (
            <button
              key={lang.code}
              onClick={() => { setLocale(lang.code); setOpen(false) }}
              style={{
                width:       '100%',
                display:     'flex',
                alignItems:  'center',
                gap:         '10px',
                padding:     '10px 16px',
                border:      'none',
                background:  locale === lang.code ? 'rgba(59,130,246,0.08)' : 'transparent',
                cursor:      'pointer',
                fontSize:    '13px',
                textAlign:   'left',
                color:       locale === lang.code ? '#3b82f6' : 'var(--color-text1)',
                fontWeight:  locale === lang.code ? 500 : 400,
              }}
            >
              <span style={{ fontSize: '18px', lineHeight: 1 }}>{lang.flag}</span>
              <span>{lang.label}</span>
              {locale === lang.code && (
                <span style={{ marginLeft: 'auto', color: '#3b82f6' }}>✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
