/**
 * Xato xabarchisi.
 *
 * Ikkita bo'shliqni yopadi.
 *
 * Birinchisi va kattarog'i: `app.ts` dagi global ishlovchi 500 xatolarni
 * MIJOZGA umumiy xabar bilan qaytarardi, lekin hech qayerda QAYD ETMASDI.
 * Ya'ni serverdagi kutilmagan xato izsiz yo'qolardi — na stack, na qaysi
 * so'rovda bo'lgani. Nosozlikni topish imkoni yo'q edi.
 *
 * Ikkinchisi: tashqi monitoring umuman yo'q edi.
 *
 * Sentry ATAYLAB majburiy emas. `SENTRY_DSN` berilmasa modul jim ishlaydi va
 * xatolar faqat Winston orqali yoziladi — loyihani ishga tushirish uchun
 * tashqi hisob talab qilinmasligi kerak. DSN berilsa o'sha xatolar ustiga
 * Sentry'ga ham yuboriladi.
 */
import * as Sentry from '@sentry/node'
import { env } from './env'
import { logger } from './logger'

let enabled = false

export function initErrorReporter(): void {
  if (!env.SENTRY_DSN) {
    logger.info({ msg: 'Sentry sozlanmagan — xatolar faqat log faylga yoziladi' })
    return
  }
  try {
    Sentry.init({
      dsn:         env.SENTRY_DSN,
      environment: env.NODE_ENV,
      release:     env.SENTRY_RELEASE,
      // Tracing o'chirilgan: bu yerda maqsad xatolarni ko'rish, ish
      // unumdorligini o'lchash emas. Yoqilsa har so'rov uchun qo'shimcha
      // yuk paydo bo'ladi.
      tracesSampleRate: 0,
    })
    enabled = true
    logger.info({ msg: 'Sentry yoqildi', environment: env.NODE_ENV })
  } catch (err) {
    // Monitoringning o'zi ishga tushishni to'xtatmasligi kerak
    logger.warn({ msg: 'Sentry ishga tushmadi', err: (err as Error).message })
  }
}

export interface ErrorContext {
  /** Qaysi so'rovda yuz berdi */
  method?: string
  path?:   string
  /** Kim yuborgan — shaxsiy ma'lumot emas, faqat identifikator */
  userId?: string | null
  statusCode?: number
  [key: string]: unknown
}

/**
 * Xatoni qayd etadi. HAR DOIM logga yozadi, Sentry esa sozlangan bo'lsa.
 * Hech qachon istisno tashlamaydi.
 */
export function reportError(err: unknown, context: ErrorContext = {}): void {
  const error = err instanceof Error ? err : new Error(String(err))
  try {
    logger.error({
      msg:   'Kutilmagan xato',
      error: error.message,
      stack: error.stack,
      ...context,
    })
    if (enabled) {
      Sentry.withScope((scope) => {
        for (const [k, v] of Object.entries(context)) scope.setExtra(k, v)
        if (context.userId) scope.setUser({ id: context.userId })
        Sentry.captureException(error)
      })
    }
  } catch {
    // Xato haqida xabar berishda xato — jim o'tamiz, aks holda halqa hosil bo'ladi
  }
}

/** Jarayon darajasidagi ushlanmagan xatolar */
export function installProcessHandlers(): void {
  process.on('uncaughtException', (err) => {
    reportError(err, { kind: 'uncaughtException' })
  })
  process.on('unhandledRejection', (reason) => {
    reportError(reason, { kind: 'unhandledRejection' })
  })
}

export function isErrorReportingEnabled(): boolean {
  return enabled
}
