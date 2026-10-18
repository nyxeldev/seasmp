'use client'

import type { ReactNode } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import { useLocaleState } from '@/store/locale'

import uzMessages from '../messages/uz.json'
import ruMessages from '../messages/ru.json'
import enMessages from '../messages/en.json'

const MESSAGES = { uz: uzMessages, ru: ruMessages, en: enMessages }

/**
 * next-intl'ning haqiqiy manbasi — barcha tarjima matnlari shu uchta JSON
 * fayldan (messages/*.json) keladi. Tanlangan til store/locale.ts dagi
 * kichik, persist qilingan Zustand do'konida saqlanadi (useLocaleState);
 * bu yerda faqat o'sha tanlovga mos xabarlar bilan provayder o'raladi.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useLocaleState((s) => s.locale)

  return (
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
      {children}
    </NextIntlClientProvider>
  )
}
