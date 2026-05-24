'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { NextIntlClientProvider } from 'next-intl'

type Locale = 'uz' | 'ru' | 'en'

interface LocaleContextValue {
  locale: Locale
  setLocale: (l: Locale) => void
}

const LocaleContext = createContext<LocaleContextValue>({ locale: 'uz', setLocale: () => {} })

export const useLocale = () => useContext(LocaleContext)

const cache: Record<string, Record<string, unknown>> = {}

async function loadMessages(locale: Locale) {
  if (cache[locale]) return cache[locale]
  const mod = await import(`../messages/${locale}.json`)
  cache[locale] = mod.default
  return cache[locale]
}

// Sync import so provider can be used without async
import uzMessages from '../messages/uz.json'
import ruMessages from '../messages/ru.json'
import enMessages from '../messages/en.json'

const MESSAGES: Record<Locale, Record<string, unknown>> = {
  uz: uzMessages,
  ru: ruMessages,
  en: enMessages,
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === 'undefined') return 'uz'
    return (localStorage.getItem('locale') as Locale) ?? 'uz'
  })

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    if (typeof window !== 'undefined') localStorage.setItem('locale', l)
  }, [])

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  )
}
