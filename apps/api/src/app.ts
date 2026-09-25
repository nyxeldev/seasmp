import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'

import { env } from './config/env'
import { logger } from './config/logger'
import { registerAuthMiddleware } from './middlewares/auth.middleware'

import authRoutes       from './routes/auth.routes'
import userRoutes       from './routes/user.routes'
import courseRoutes     from './routes/course.routes'
import enrollmentRoutes from './routes/enrollment.routes'
import attendanceRoutes from './routes/attendance.routes'
import assessmentRoutes from './routes/assessment.routes'
import analyticsRoutes  from './routes/analytics.routes'
import securityRoutes   from './routes/security.routes'
import internalRoutes   from './routes/internal.routes'
import { checkBulkDelete } from './services/securityMonitor'
import { recordRequest } from './services/requestAudit'

// BigInt serialisation — run once at module load
;(BigInt.prototype as any).toJSON = function () { return this.toString() }

export async function buildApp() {
  // trustProxy — `request.ip` haqiqiy mijoz IP si bo'lishi uchun. Usiz proksi
  // ortida ishlaganda chegara, audit va IP bo'yicha aniqlash Nginx IP siga
  // qarab ishlaydi. Qiymat CIDR ham bo'lishi mumkin ('10.0.0.0/8').
  const trustProxy =
    env.TRUST_PROXY === 'true'  ? true  :
    env.TRUST_PROXY === 'false' ? false :
    env.TRUST_PROXY

  const app = Fastify({ logger: false, trustProxy })

  // ─── Content-Type wildcard (bodyless POST/PATCH routes) ──────────────────────
  app.addContentTypeParser('*', { parseAs: 'string' }, (_req, body, done) => {
    if (!body) return done(null, {})
    try { done(null, JSON.parse(body as string)) } catch { done(null, {}) }
  })

  // ─── Plugins ─────────────────────────────────────────────────────────────────
  await app.register(helmet, { contentSecurityPolicy: false })

  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })

  await app.register(cookie, { secret: env.JWT_REFRESH_SECRET })

  await registerAuthMiddleware(app)

  // global: false — plagin o'z hookini har bir route'ning MAVJUD onRequest
  // ro'yxati oxiriga qo'shadi. `onRequest: [app.authenticate]` bo'lgan yo'llarda
  // bu avval auth ishlashini, 401 qaytarib so'rovni to'xtatishini va chegara
  // umuman tekshirilmasligini bildirardi: tokensiz trafik cheklanmay qolardi.
  // Buning o'rniga chegarani quyida instance darajasidagi hook sifatida
  // qo'shamiz — u route hooklaridan OLDIN ishlaydi.
  await app.register(rateLimit, {
    global: false,
    max: env.RATE_LIMIT_MAX,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip,
    // statusCode shart: usiz plagin xatosi global error handlerga statusCode'siz
    // yetib borardi va mijoz 429 o'rniga 500 olardi — ya'ni chegaradan oshgan
    // so'rov server nosozligidek ko'rinardi va qayta urinish mantiqi ishlamasdi.
    errorResponseBuilder: () => ({
      statusCode: 429,
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: "So'rovlar soni chegarasidan oshdi. Keyinroq urinib ko'ring.",
      },
    }),
  })

  // Chegara har bir so'rovda, autentifikatsiyadan OLDIN tekshiriladi.
  // Instance darajasidagi onRequest hooklari route darajasidagilaridan oldin
  // ishlaydi, shuning uchun 401 bilan rad etiladigan so'rov ham hisobga olinadi.
  app.addHook('onRequest', app.rateLimit())

  // ─── Routes ──────────────────────────────────────────────────────────────────
  await app.register(authRoutes,       { prefix: '/v1/auth' })
  await app.register(userRoutes,       { prefix: '/v1/users' })
  await app.register(courseRoutes,     { prefix: '/v1/courses' })
  await app.register(enrollmentRoutes, { prefix: '/v1/enrollments' })
  await app.register(attendanceRoutes, { prefix: '/v1/attendance' })
  await app.register(assessmentRoutes, { prefix: '/v1/assessments' })
  await app.register(analyticsRoutes,  { prefix: '/v1/analytics' })
  await app.register(securityRoutes,   { prefix: '/v1/security' })
  await app.register(internalRoutes,   { prefix: '/v1/internal' })

  // ─── Bulk Delete Guard ────────────────────────────────────────────────────────
  app.addHook('preHandler', async (request) => {
    if (request.method === 'DELETE' && request.user?.sub) {
      if (!request.url.includes('/security/active-sessions/')) {
        await checkBulkDelete(request.user.sub, request.ip)
      }
    }
  })

  // ─── To'liq hodisa qamrovi ────────────────────────────────────────────────────
  // Javob yuborilgandan keyin ishlaydi — foydalanuvchi ko'radigan kechikishga
  // ta'sir qilmaydi. Har bir /v1/ so'rovi audit logga yoziladi, 401/403 esa
  // ACCESS_DENIED sifatida qayd etiladi.
  //
  // DETECTION_ENABLED=false bo'lsa hook umuman ro'yxatdan o'tmaydi — shart
  // har so'rovda tekshirilmaydi va qatlamlarning narxi noldan iborat bo'ladi.
  if (env.DETECTION_ENABLED !== 'false') {
    app.addHook('onResponse', async (request, reply) => {
      await recordRequest(request, reply)
    })
  } else {
    logger.warn({ msg: 'Aniqlash qatlamlari O\'CHIRILGAN (DETECTION_ENABLED=false) — audit yozuvi ham yo\'q' })
  }

  // ─── Health Check ─────────────────────────────────────────────────────────────
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'seasmp-api',
  }))

  // ─── Global Error Handler ─────────────────────────────────────────────────────
  app.setErrorHandler((err, request, reply) => {
    const error = err as any

    if (error.statusCode === 429) {
      return reply.status(429).send({
        success: false,
        error: { code: 'RATE_LIMIT_EXCEEDED', message: error.message },
      })
    }
    if (error.validation) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: "Ma'lumotlar noto'g'ri formatda", details: error.validation },
      })
    }

    const statusCode = error.statusCode ?? 500
    return reply.status(statusCode).send({
      success: false,
      error: {
        code: statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR',
        message: statusCode === 500 ? 'Tizimda xatolik yuz berdi' : error.message,
      },
    })
  })

  return app
}
