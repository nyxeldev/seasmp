import { NextResponse, type NextRequest } from 'next/server'

// Haqiqiy avtorizatsiya chegarasi — API'dagi JWT + RBAC (apps/api/src/middlewares/auth.middleware.ts).
// Bu proxy uni TAKRORLAMAYDI: faqat "sessiya belgisi" (seasmp-session
// cookie, lib/api/client.ts da qo'yiladi) bor-yo'qligini tekshiradi. Maqsad —
// ruxsatsiz foydalanuvchiga himoyalangan sahifaning HTML/JS qobig'i bir lahza
// ko'rinib, keyin client tomonda qayta yo'naltirilishining oldini olish
// (himoya qatlamlaridan biri, ma'lumot API darajasida baribir tekshiriladi).
//
// Next.js 16 bu fayl konvensiyasini `middleware.ts` dan `proxy.ts` ga
// o'zgartirdi (eskisi hamon ishlaydi, lekin build vaqtida ogohlantirish
// chiqaradi) — shu loyiha aynan shu versiyaga qotirilgani uchun yangi nom
// ishlatiladi.
const SESSION_COOKIE = 'seasmp-session'

// Autentifikatsiyasiz kirish mumkin bo'lgan yo'llar. `/attendance/scan` o'z
// ichida login'ga yo'naltirishni allaqachon boshqaradi (talaba QR'ni
// skanerlab, keyin tizimga kirishi mumkin) — shu yerda qayta qo'riqlanmaydi.
const PUBLIC_PATHS = ['/login', '/attendance/scan']

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`))
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (isPublicPath(pathname)) return NextResponse.next()

  const hasSession = request.cookies.has(SESSION_COOKIE)
  if (!hasSession) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  return NextResponse.next()
}

export const config = {
  // Statik fayllar (kengaytmali yo'llar) va Next.js ichki yo'llar bundan
  // tashqarida — ularni tekshirishning hojati yo'q.
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.).*)'],
}
