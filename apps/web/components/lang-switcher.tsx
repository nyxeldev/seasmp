'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLocale } from '@/lib/locale-context'

const LANGS = [
  { code: 'uz', label: "O'zbek", flag: '🇺🇿' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
] as const

type Locale = 'uz' | 'ru' | 'en'

export function LangSwitcher() {
  const { locale, setLocale } = useLocale()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const current = LANGS.find(l => l.code === locale) ?? LANGS[0]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-700/50 transition-colors outline-none select-none"
      >
        <span className="text-base leading-none">{current.flag}</span>
        <span className="hidden sm:block font-medium text-xs">{current.code.toUpperCase()}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' as const }}
            className="absolute right-0 top-full mt-1.5 w-36 rounded-lg border overflow-hidden z-50"
            style={{ background: '#1E293B', borderColor: 'rgba(255,255,255,0.1)' }}
          >
            {LANGS.map(lang => (
              <button
                key={lang.code}
                onClick={() => { setLocale(lang.code as Locale); setOpen(false) }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-700/50 transition-colors text-left"
                style={locale === lang.code ? { color: '#fff', background: 'rgba(59,130,246,0.15)' } : {}}
              >
                <span className="text-base">{lang.flag}</span>
                <span>{lang.label}</span>
                {locale === lang.code && (
                  <span className="ml-auto size-1.5 rounded-full bg-blue-400 shrink-0" />
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
