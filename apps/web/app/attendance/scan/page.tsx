'use client'

/**
 * QR skanerlash qo'nish sahifasi.
 *
 * Ilgari QR kod xom tokenni o'zini kodlagan edi — telefon kamerasi bilan
 * skanerlansa, faqat uzun tasodifiy matn ko'rsatardi: hech qayerga olib
 * bormasdi, hech narsa qilmasdi. `POST /v1/attendance/qr/mark` backendda
 * ANCHA oldin tayyor edi, lekin uni chaqiradigan frontend sahifasi umuman
 * yo'q edi.
 *
 * Endi QR havola kodlaydi (`/attendance/scan?token=...`), bu sahifa esa:
 * talaba tizimga kirgan bo'lsa — darhol davomatni belgilaydi; kirmagan
 * bo'lsa — tokenni saqlab, login sahifasiga yo'naltiradi, kirgandan
 * keyin shu yerga qaytib, avtomatik davom etadi.
 *
 * Standalone (dashboard) guruhi tashqarisida ataylab: davomatni QR bilan
 * belgilaydigan talaba boshqa qurilmada (odatda telefon) ochishi mumkin,
 * sidebar/navbar kerak emas — faqat natija.
 */

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth, PENDING_QR_TOKEN_KEY } from '@/lib/auth-context'
import { attendanceApi, ApiError } from '@/lib/api'
import { CheckCircle2, XCircle, Loader2, ShieldAlert } from 'lucide-react'

type Status = 'checking' | 'marking' | 'success' | 'error' | 'no-token'

/**
 * `useSearchParams()` CSR bailout talab qiladi — aks holda production build
 * (`next build`) "/attendance/scan"ni prerender qilishga urinib, Suspense
 * chegarasi yo'qligi uchun yiqiladi. Shuning uchun asosiy mantiq ichki
 * komponentga ko'chirilgan, tashqarisi esa uni Suspense bilan o'raydi.
 */
export default function ScanAttendancePage() {
  return (
    <Suspense fallback={null}>
      <ScanAttendanceInner />
    </Suspense>
  )
}

function ScanAttendanceInner() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [status, setStatus]   = useState<Status>('checking')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (authLoading) return

    if (!token) {
      setStatus('no-token')
      return
    }

    if (!user) {
      // Tizimga kirmagan — tokenni saqlab, login'ga yuboramiz. Login
      // muvaffaqiyatli bo'lgach, auth-context shu kalitni tekshirib,
      // foydalanuvchini to'g'ridan-to'g'ri shu sahifaga qaytaradi.
      try { sessionStorage.setItem(PENDING_QR_TOKEN_KEY, token) } catch { /* xavfsiz e'tiborsiz qoldiriladi */ }
      router.replace('/login')
      return
    }

    let cancelled = false
    setStatus('marking')
    attendanceApi.markByQr(token)
      .then(() => {
        if (cancelled) return
        try { sessionStorage.removeItem(PENDING_QR_TOKEN_KEY) } catch { /* jim */ }
        setStatus('success')
      })
      .catch((err) => {
        if (cancelled) return
        setMessage(err instanceof ApiError ? err.message : "Xatolik yuz berdi")
        setStatus('error')
      })
    return () => { cancelled = true }
  }, [token, user, authLoading, router])

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--s-bg)' }}>
      <div className="w-full max-w-sm rounded-2xl border p-8 text-center glass-surface">
        {(status === 'checking' || status === 'marking') && (
          <>
            <Loader2 className="size-10 mx-auto mb-4 animate-spin text-blue-500" />
            <p className="font-medium" style={{ color: 'var(--s-text)' }}>
              {status === 'marking' ? 'Davomat belgilanmoqda...' : 'Tekshirilmoqda...'}
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="size-12 mx-auto mb-4 text-green-500" />
            <h1 className="text-lg font-semibold mb-1.5" style={{ color: 'var(--s-text)' }}>
              Davomat belgilandi
            </h1>
            <p className="text-sm mb-6" style={{ color: 'var(--s-muted)' }}>
              Siz shu darsga "keldi" deb qayd etildingiz.
            </p>
            <Link href="/dashboard" className="text-sm font-medium text-blue-500 hover:underline">
              Bosh sahifaga o'tish →
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="size-12 mx-auto mb-4 text-red-500" />
            <h1 className="text-lg font-semibold mb-1.5" style={{ color: 'var(--s-text)' }}>
              Davomat belgilanmadi
            </h1>
            <p className="text-sm mb-6" style={{ color: 'var(--s-muted)' }}>{message}</p>
            <Link href="/dashboard" className="text-sm font-medium text-blue-500 hover:underline">
              Bosh sahifaga o'tish →
            </Link>
          </>
        )}

        {status === 'no-token' && (
          <>
            <ShieldAlert className="size-12 mx-auto mb-4 text-amber-500" />
            <h1 className="text-lg font-semibold mb-1.5" style={{ color: 'var(--s-text)' }}>
              Noto'g'ri havola
            </h1>
            <p className="text-sm mb-6" style={{ color: 'var(--s-muted)' }}>
              Bu havolada davomat tokeni yo'q. QR kodni qaytadan skanerlang.
            </p>
            <Link href="/dashboard" className="text-sm font-medium text-blue-500 hover:underline">
              Bosh sahifaga o'tish →
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
