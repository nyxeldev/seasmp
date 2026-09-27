import type { FastifyInstance } from 'fastify'
import { buildApp } from './app'
import { env } from './config/env'
import { logger } from './config/logger'
import { prisma } from './config/prisma'
import { redis } from './config/redis'
import { startProfileRefresh } from './jobs/profileRefresh'
import { initRealtime, closeRealtime } from './realtime/gateway'
import { initErrorReporter, installProcessHandlers } from './config/errorReporter'

let app: FastifyInstance
let stopProfileRefresh: (() => void) | undefined

async function bootstrap() {
  // Monitoring birinchi ishga tushadi — qurish bosqichidagi xato ham
  // ushlanishi uchun.
  initErrorReporter()
  installProcessHandlers()

  app = await buildApp()

  // ─── Real vaqt ───────────────────────────────────────────────────────────────
  // Xonalar tekshirilgan tokendan olinadi — batafsili realtime/gateway.ts da.
  const io = initRealtime(app.server)
  app.decorate('io', io)

  await app.listen({ port: env.API_PORT, host: env.API_HOST })
  logger.info(`🚀 SEASMP API ishga tushdi: http://${env.API_HOST}:${env.API_PORT}`)

  // 2-qatlam uchun xatti-harakat profillarini davriy qurish.
  // Aniqlash o'chirilgan bo'lsa profil ham kerak emas — bazani bekorga
  // skanerlab yurmaydi.
  if (env.DETECTION_ENABLED !== 'false') {
    stopProfileRefresh = startProfileRefresh()
  }
}

const shutdown = async (signal: string) => {
  logger.info(`${signal} — server to'xtatilmoqda...`)
  stopProfileRefresh?.()
  closeRealtime()
  if (app) await app.close()
  await prisma.$disconnect()
  redis.disconnect()
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))

bootstrap().catch((err) => {
  logger.error(err)
  process.exit(1)
})
