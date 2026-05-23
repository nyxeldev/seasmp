import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'

import { env } from './config/env'
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

// BigInt serialisation — run once at module load
;(BigInt.prototype as any).toJSON = function () { return this.toString() }

export async function buildApp() {
  const app = Fastify({ logger: false })

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

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: () => ({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: "So'rovlar soni chegarasidan oshdi. Keyinroq urinib ko'ring.",
      },
    }),
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

  // ─── Bulk Delete Guard ────────────────────────────────────────────────────────
  app.addHook('preHandler', async (request) => {
    if (request.method === 'DELETE' && request.user?.sub) {
      if (!request.url.includes('/security/active-sessions/')) {
        await checkBulkDelete(request.user.sub, request.ip)
      }
    }
  })

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
