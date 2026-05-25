import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { translations, type Locale, type TranslationKey } from '@/lib/i18n'

interface LocaleStore {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: TranslationKey) => string
}

export const useLocaleStore = create<LocaleStore>()(
  persist(
    (set, get) => ({
      locale: 'uz',
      setLocale: (locale) => set({ locale }),
      t: (key) => (translations[get().locale][key] as string) ?? key,
    }),
    { name: 'seasmp-locale' }
  )
)
