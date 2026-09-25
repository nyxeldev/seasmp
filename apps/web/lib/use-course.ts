'use client'

/**
 * Manzildagi parametrni (slug yoki UUID) haqiqiy kursga aylantiradi.
 *
 * Nega kerak: manzil qatorida endi slug turadi (`/courses/web-dasturlash-asoslari`),
 * lekin API ning boshqa endpointlari — ro'yxatga olishlar, topshiriqlar, davomat —
 * kursning UUID sini kutadi. Agar sahifa URL parametrini to'g'ridan-to'g'ri
 * `courseId` sifatida uzatsa, ular jimgina bo'sh ro'yxat qaytaradi.
 *
 * Shuning uchun avval kurs olinadi, keyin uning `id` si bilan qolgani yuklanadi.
 * Breadcrumb sarlavhasi ham shu yerda o'rnatiladi — har sahifada takrorlanmasin.
 */
import { useEffect, useState } from 'react'
import { coursesApi, type Course } from '@/lib/api'
import { useBreadcrumbTitle } from '@/lib/breadcrumb'

export function useCourse(idOrSlug: string) {
  const [course, setCourse]   = useState<Course | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    coursesApi.getById(idOrSlug)
      .then(res => { if (!cancelled) setCourse(res.data) })
      .catch(() => { if (!cancelled) setCourse(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [idOrSlug])

  useBreadcrumbTitle(course?.title)

  // courseId — boshqa so'rovlar uchun. Kurs yuklanmaguncha null, shuning uchun
  // chaqiruvchi effekt uni kutishi kerak.
  return { course, setCourse, courseId: course?.id ?? null, loading }
}
