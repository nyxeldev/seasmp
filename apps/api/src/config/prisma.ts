import { PrismaClient, Prisma } from '@prisma/client'
import { logger } from './logger'
import { env } from './env'

type LogClient = PrismaClient<Prisma.PrismaClientOptions, 'error' | 'warn'>
const globalForPrisma = globalThis as unknown as { prisma: LogClient }

/**
 * DATABASE_URL'ga ulanish puli (connection_limit/pool_timeout) va
 * statement_timeout parametrlarini qo'shadi — foydalanuvchi .env'da
 * ularni allaqachon aniq yozgan bo'lsa (masalan boshqa qiymat bilan),
 * ULARGA TEGILMAYDI. Standart qiymatlar — DATABASE_CONNECTION_LIMIT va
 * h.k. (env.ts) — Prisma'ning o'z ichki standartlariga teng, shuning
 * uchun ularni sozlamasdan hech narsa o'zgarmaydi.
 *
 * `options=-c statement_timeout=...` — bu Postgres'ning o'z, standart
 * ulanish parametri (libpq uslubida): postgresql.conf'ni global
 * o'zgartirmasdan, FAQAT shu ulanishga (ya'ni shu ilovaning Prisma puliga)
 * tegishli bo'ladi.
 */
function buildDatabaseUrl(): string {
  const url = new URL(env.DATABASE_URL)
  if (!url.searchParams.has('connection_limit')) {
    url.searchParams.set('connection_limit', String(env.DATABASE_CONNECTION_LIMIT))
  }
  if (!url.searchParams.has('pool_timeout')) {
    url.searchParams.set('pool_timeout', String(env.DATABASE_POOL_TIMEOUT_SECONDS))
  }
  if (!url.searchParams.has('options')) {
    url.searchParams.set('options', `-c statement_timeout=${env.DATABASE_STATEMENT_TIMEOUT_MS}`)
  }
  return url.toString()
}

export const prisma: LogClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: buildDatabaseUrl() } },
    log: [
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  })

if (process.env.NODE_ENV === 'development') {
  globalForPrisma.prisma = prisma
}

prisma.$on('error', (e) => logger.error({ msg: 'Prisma error', message: e.message }))
prisma.$on('warn',  (e) => logger.warn({ msg: 'Prisma warn',  message: e.message }))
