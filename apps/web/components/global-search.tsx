'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, LayoutDashboard, BookOpen, Users,
  CalendarCheck, TrendingUp, ShieldCheck, Settings,
} from 'lucide-react'
import { useLocaleStore } from '@/store/locale'
import type { TranslationKey } from '@/lib/i18n'

const NAV = [
  { href: '/dashboard',  key: 'nav.dashboard'  as TranslationKey, icon: LayoutDashboard },
  { href: '/courses',    key: 'nav.courses'    as TranslationKey, icon: BookOpen },
  { href: '/users',      key: 'nav.students'   as TranslationKey, icon: Users },
  { href: '/attendance', key: 'nav.attendance' as TranslationKey, icon: CalendarCheck },
  { href: '/analytics',  key: 'nav.analytics'  as TranslationKey, icon: TrendingUp },
  { href: '/security',   key: 'nav.security'   as TranslationKey, icon: ShieldCheck },
  { href: '/settings',   key: 'nav.settings'   as TranslationKey, icon: Settings },
]

export function GlobalSearch() {
  const { t } = useLocaleStore()
  const [open, setOpen]       = useState(false)
  const [query, setQuery]     = useState('')
  const [selected, setSelected] = useState(0)
  const router  = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setOpen(v => !v) }
      if (e.key === 'Escape') setOpen(false)
    }
    const onCustom = () => setOpen(true)
    document.addEventListener('keydown', onKey)
    window.addEventListener('open-global-search', onCustom)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('open-global-search', onCustom)
    }
  }, [])

  useEffect(() => {
    if (open) { setQuery(''); setSelected(0); setTimeout(() => inputRef.current?.focus(), 60) }
  }, [open])

  const results = NAV.filter(item =>
    t(item.key).toLowerCase().includes(query.toLowerCase()) ||
    item.href.includes(query.toLowerCase())
  )

  const go = (href: string) => { router.push(href); setOpen(false) }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(v => Math.min(v + 1, results.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(v => Math.max(v - 1, 0)) }
    if (e.key === 'Enter' && results[selected]) go(results[selected].href)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9998] flex items-start justify-center pt-[18vh]"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -12 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
            style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Input */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b"
              style={{ borderColor: 'var(--color-border)' }}>
              <Search className="size-4 shrink-0" style={{ color: 'var(--color-text3)' }} />
              <input
                ref={inputRef}
                value={query}
                onChange={e => { setQuery(e.target.value); setSelected(0) }}
                onKeyDown={onKeyDown}
                placeholder={t('search.placeholder')}
                className="flex-1 bg-transparent outline-none text-sm"
                style={{ color: 'var(--color-text1)' }}
              />
              <kbd style={{
                fontSize: '11px', padding: '2px 6px', borderRadius: '5px',
                border: '1px solid var(--color-border)', color: 'var(--color-text3)',
              }}>ESC</kbd>
            </div>

            {/* Results */}
            <div className="py-1.5 max-h-72 overflow-y-auto">
              {results.length === 0 ? (
                <p className="text-center py-8 text-sm" style={{ color: 'var(--color-text3)' }}>
                  {t('search.noResults')}
                </p>
              ) : results.map((item, i) => {
                const Icon = item.icon
                const active = i === selected
                return (
                  <button key={item.href}
                    onClick={() => go(item.href)}
                    onMouseEnter={() => setSelected(i)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors"
                    style={{
                      background: active ? 'rgba(59,130,246,0.08)' : 'transparent',
                      color: active ? '#3b82f6' : 'var(--color-text1)',
                    }}
                  >
                    <Icon className="size-4 shrink-0" style={{ color: active ? '#3b82f6' : 'var(--color-text3)' }} />
                    <span className="flex-1">{t(item.key)}</span>
                    {active && (
                      <kbd style={{
                        fontSize: '10px', padding: '2px 5px', borderRadius: '4px',
                        border: '1px solid var(--color-border)', color: 'var(--color-text3)',
                      }}>↵</kbd>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Footer */}
            <div className="px-4 py-2.5 border-t flex items-center gap-4"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
              {[
                { keys: ['↑↓'], label: 'Tanlash' },
                { keys: ['↵'],  label: 'Ochish' },
                { keys: ['ESC'], label: 'Yopish' },
              ].map(({ keys, label }) => (
                <span key={label} className="flex items-center gap-1.5 text-[11px]"
                  style={{ color: 'var(--color-text3)' }}>
                  {keys.map(k => (
                    <kbd key={k} style={{
                      padding: '1px 5px', borderRadius: '4px', fontSize: '10px',
                      border: '1px solid var(--color-border)',
                    }}>{k}</kbd>
                  ))}
                  {label}
                </span>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
