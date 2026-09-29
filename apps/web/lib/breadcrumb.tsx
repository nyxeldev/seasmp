'use client'

/**
 * Breadcrumb'da obyekt nomini ko'rsatish uchun kichik kontekst.
 *
 * Muammo: breadcrumb URL segmentlaridan quriladi, dinamik yo'llarda esa segment
 * — bu UUID. Natijada foydalanuvchi "Kurslar › 00000000-0000-0000-0000-000000000001"
 * degan yozuvni ko'rardi: sahifa sarlavhasi kursning nomini to'g'ri chizsa ham,
 * breadcrumb xom identifikatorni ko'rsatardi.
 *
 * Layout obyektning nomini bilmaydi — uni faqat sahifaning o'zi biladi. Shuning
 * uchun sahifa `useBreadcrumbTitle(course?.title)` bilan nomni beradi, layout esa
 * uni UUID segmenti o'rniga chizadi.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react'

interface BreadcrumbContextValue {
  title: string | null
  setTitle: (title: string | null) => void
}

const BreadcrumbContext = createContext<BreadcrumbContextValue>({
  title: null,
  setTitle: () => {},
})

export function BreadcrumbTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitleState] = useState<string | null>(null)
  const setTitle = useCallback((next: string | null) => setTitleState(next), [])
  const value = useMemo(() => ({ title, setTitle }), [title, setTitle])

  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>
}

/** Layout o'qiydi */
export function useBreadcrumbTitleValue(): string | null {
  return useContext(BreadcrumbContext).title
}

/**
 * Sahifa yozadi. Ma'lumot hali yuklanmagan bo'lsa `undefined` berilaveradi —
 * kelgach breadcrumb o'zi yangilanadi. Sahifadan chiqilganda tozalanadi, aks
 * holda keyingi sahifada eski nom qolib ketardi.
 */
export function useBreadcrumbTitle(title: string | null | undefined): void {
  const { setTitle } = useContext(BreadcrumbContext)

  useEffect(() => {
    setTitle(title ?? null)
    return () => setTitle(null)
  }, [title, setTitle])
}
