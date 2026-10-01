'use client'
import { useState, useRef, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useLocale, type TKey } from '@/store/locale'

type Mode = 'light' | 'dark' | 'system'

const MODES: { value: Mode; icon: typeof Sun; labelKey: TKey }[] = [
  { value: 'light',  icon: Sun,     labelKey: 'theme.light' },
  { value: 'dark',   icon: Moon,    labelKey: 'theme.dark' },
  { value: 'system', icon: Monitor, labelKey: 'theme.system' },
]

/**
 * Navbardagi 3 holatli mavzu almashtirgichi (yorug', tungi, tizim).
 * Ilgari sidebar pastida faqat yorug'/tungi oddiy o'tkazgich bo'lgan —
 * foydalanuvchi ismi joy egallagani uchun shu yerga ko'chirildi.
 */
export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()
  const { t } = useLocale()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  if (!mounted) return null

  const active = MODES.find(m => m.value === theme) ?? MODES[2]
  const ActiveIcon = active.icon

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-label={t(active.labelKey)}
        title={t(active.labelKey)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer',
          border: 'none',
          background: open ? 'var(--s-hover)' : 'transparent',
          color: 'var(--s-muted)',
        }}
      >
        <ActiveIcon size={16} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 6px)',
          minWidth: '150px', borderRadius: '12px',
          border: '1px solid var(--color-border)',
          background: 'var(--color-card)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
          overflow: 'hidden', zIndex: 9999,
        }}>
          {MODES.map(mode => {
            const Icon = mode.icon
            const isActive = theme === mode.value
            return (
              <button
                key={mode.value}
                onClick={() => { setTheme(mode.value); setOpen(false) }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center',
                  gap: '10px', padding: '9px 14px', border: 'none',
                  background: isActive ? 'rgba(59,130,246,0.08)' : 'transparent',
                  cursor: 'pointer', fontSize: '13px', textAlign: 'left',
                  color: isActive ? '#3b82f6' : 'var(--color-text1)',
                  fontWeight: isActive ? 500 : 400,
                }}
              >
                <Icon size={15} />
                <span>{t(mode.labelKey)}</span>
                {isActive && <span style={{ marginLeft: 'auto', color: '#3b82f6' }}>✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
