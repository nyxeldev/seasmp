import Fastify from 'fastify'
import { Prisma } from '@prisma/client'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'

import { env } from './config/env'
import { logger } from './config/logger'
import { reportError } from './config/errorReporter'
import { registerAuthMiddleware } from './middlewares/auth.middleware'
import { AVATAR_MAX_BYTES, avatarStaticRoot, ensureAvatarDir } from './services/avatarStorage.service'
import { isForeignKeyRestrictError } from './lib/prismaErrors'

import authRoutes       from './routes/auth.routes'
import userRoutes       from './routes/user.routes'
import courseRoutes     from './routes/course.routes'
import enrollmentRoutes from './routes/enrollment.routes'
import attendanceRoutes from './routes/attendance.routes'
import assessmentRoutes from './routes/assessment.routes'
import analyticsRoutes  from './routes/analytics.routes'
import securityRoutes   from './routes/security.routes'
import internalRoutes   from './routes/internal.routes'
import notificationRoutes from './routes/notification.routes'
import telemetryRoutes    from './routes/telemetry.routes'
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

  // Avatar yuklash — hajm chegarasi shu yerda ham qo'yiladi (himoya
  // qatlamlaridan biri; haqiqiy tur tekshiruvi avatarStorage.service'da
  // bayt imzosi bo'yicha amalga oshiriladi, kengaytma/MIME'ga ishonilmaydi).
  await app.register(multipart, {
    limits: { fileSize: AVATAR_MAX_BYTES, files: 1 },
  })

  // Yuklangan avatarlarni xizmat qiladi. Fayl nomlari faqat serverda
  // crypto.randomUUID() bilan generatsiya qilinadi — mijoz kiritgan yo'l
  // hech qachon fayl tizimi yo'liga aralashmaydi, shuning uchun path
  // traversal xavfi yo'q. Bu papka ichida faqat tekshirilgan rasm baytlari
  // saqlanadi — bajariluvchi/skript kontent hech qachon yozilmaydi.
  await ensureAvatarDir()
  await app.register(fastifyStatic, {
    root: avatarStaticRoot(),
    prefix: '/v1/uploads/avatars/',
    index: false,
    list: false,
    setHeaders: (reply) => {
      reply.header('Cache-Control', 'public, max-age=31536000, immutable')
      reply.header('X-Content-Type-Options', 'nosniff')
      // Helmet standart bo'yicha Cross-Origin-Resource-Policy: same-origin
      // qo'yadi — dev'da frontend (3000) va API (4000) turli origin bo'lgani
      // uchun brauzer <img src> yuklashni bloklaydi. Avatarlar ochiq
      // ko'rsatiladigan rasm bo'lgani uchun shu yerda ataylab bo'shatiladi.
      reply.header('Cross-Origin-Resource-Policy', 'cross-origin')
    },
  })

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

  // ─── Global Error Handler ─────────────────────────────────────────────────────
  //
  // MARSHRUTLARDAN OLDIN o'rnatilishi SHART. Fastify har bir `register`
  // chaqiruvida alohida kontekst yaratadi va bola kontekst xato ishlovchisini
  // RO'YXATDAN O'TISH PAYTIDAGI holatidan oladi. Ilgari bu blok fayl oxirida,
  // barcha marshrutlardan keyin turardi — natijada u /v1/ marshrutlarining
  // BIRORTASIGA ham qo'llanmasdi.
  //
  // Oqibati ikkita edi. Birinchisi: 500 xatolar Fastify ning standart
  // ko'rinishida qaytardi va ichki xabarni oshkor qilardi, masalan
  // "Cannot convert notanumber to a BigInt". Ikkinchisi: shu blokdagi
  // qayd etish hech qachon ishlamasdi.
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

    // Prisma xatolari — bu yergacha yetib kelsa, degani servis qatlamida
    // ushlanmagan (ko'pchilik joyda check-then-insert DB'ning real UNIQUE/FK
    // cheklovi bilan himoyalangan, lekin natijaviy xato tarjima qilinmagan
    // edi: mijoz 409 o'rniga umumiy 500 olardi). Bu yerda faqat ikkita eng
    // keng tarqalgan holat tarjima qilinadi — Prisma/Postgres ichki xabari
    // hech qachon mijozga chiqmaydi.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = error.meta?.target
      const fields = Array.isArray(target) ? target.join(', ') : typeof target === 'string' ? target : null
      return reply.status(409).send({
        success: false,
        error: {
          code: 'UNIQUE_CONSTRAINT_VIOLATION',
          message: fields
            ? `Bu qiymat allaqachon band: ${fields}`
            : "Bu yozuv allaqachon mavjud",
        },
      })
    }

    // FK RESTRICT/NO ACTION cheklovi buzilishi — P2003 (Prisma o'z xaritasi)
    // VA aniq `ON DELETE RESTRICT` kalit so'zi bilan yaratilgan cheklovlar
    // uchun keladigan `PrismaClientUnknownRequestError` (SQLSTATE 23001)
    // ikkalasini ham qamraydi — tafsilot: lib/prismaErrors.ts. Boshqa har
    // qanday Prisma/DB xatosi bu shartdan o'tmaydi va pastdagi umumiy
    // statusCode/500 yo'liga tushadi.
    if (isForeignKeyRestrictError(error)) {
      return reply.status(409).send({
        success: false,
        error: {
          code: 'FOREIGN_KEY_CONSTRAINT',
          message: "Bu amalni bajarib bo'lmaydi: ushbu obyektga bog'liq boshqa yozuvlar mavjud",
        },
      })
    }

    const statusCode = error.statusCode ?? 500

    // 500 — bu bizning nosozligimiz, shuning uchun QAYD ETILADI. Ilgari
    // bunday xato mijozga "Tizimda xatolik yuz berdi" deb qaytarilar,
    // lekin hech qayerda saqlanmasdi: na stack, na qaysi so'rov edi.
    // 4xx lar qayd etilmaydi — ular kutilgan holat (noto'g'ri so'rov,
    // ruxsat yo'q) va ularni yozish shovqin bo'lardi.
    if (statusCode >= 500) {
      reportError(error, {
        method: request.method,
        path:   (request.url ?? '').split('?')[0],
        userId: request.user?.sub ?? null,
        statusCode,
      })
    }

    return reply.status(statusCode).send({
      success: false,
      error: {
        code: statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR',
        message: statusCode === 500 ? 'Tizimda xatolik yuz berdi' : error.message,
      },
    })
  })

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
  await app.register(notificationRoutes, { prefix: '/v1/notifications' })
  await app.register(telemetryRoutes,    { prefix: '/v1/telemetry' })

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


  return app
}
