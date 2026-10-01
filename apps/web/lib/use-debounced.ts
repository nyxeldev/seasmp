'use client'

import { useEffect, useState } from 'react'

/**
 * Qiymatni belgilangan vaqt kechikishi bilan "sokinlashtiradi" — har bir
 * tugma bosilganda emas, foydalanuvchi yozishni to'xtatgandan keyin
 * o'zgaradi. Qidiruv/filtr maydonlarida har harf uchun alohida so'rov
 * yuborilmasligi uchun ishlatiladi.
 */
export function useDebounced<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}
