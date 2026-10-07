import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useTranslations } from 'next-intl'
import uzMessages from '../messages/uz.json'

/**
 * Tarjima matnlarining YAGONA manbasi — apps/web/messages/{uz,ru,en}.json
 * (next-intl). Bu fayl endi hech qanday matn saqlamaydi, faqat:
 *   1) tanlangan tilni (persist qilingan Zustand do'kon) va
 *   2) eski chaqiruv konvensiyasini (`const { t } = useLocale()`,
 *      `t('nav.dashboard')`) next-intl ustiga ingichka ko'prik sifatida
 *      ta'minlaydi — shuning uchun 15+ komponent o'zgarishsiz qoladi.
 */
export type Locale = 'uz' | 'ru' | 'en'

// uz.json ning haqiqiy shaklidan "nav.dashboard" kabi nuqtali kalitlar
// birlashmasini (union) chiqaradi — qo'lda yozilgan ro'yxat emas, shuning
// uchun JSON bilan hech qachon sinxronlikdan chiqmaydi.
type DotPaths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${DotPaths<T[K]>}`
}[keyof T & string]

export type TKey = DotPaths<typeof uzMessages>

interface LocaleState {
  locale: Locale
  setLocale: (l: Locale) => void
}

// Faqat til tanlovini saqlaydi (tarjima matnlarini emas) — shu bois
// localStorage'dagi 'seasmp-locale' kaliti ilgarigidek qoladi, foydalanuvchi
// avval tanlagan til shu migratsiyadan keyin ham saqlanib qoladi.
export const useLocaleState = create<LocaleState>()(
  persist(
    (set) => ({ locale: 'uz', setLocale: (locale) => set({ locale }) }),
    { name: 'seasmp-locale' }
  )
)

export function useLocale() {
  const locale = useLocaleState((s) => s.locale)
  const setLocale = useLocaleState((s) => s.setLocale)
  const t = useTranslations()
  return { locale, setLocale, t: (key: TKey) => t(key) }
}

// backward-compat alias — ba'zi komponentlar shu nom bilan import qiladi
export const useLocaleStore = useLocale
