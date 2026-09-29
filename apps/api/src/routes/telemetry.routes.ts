import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { reportError } from '../config/errorReporter'

/**
 * Brauzerdagi xatolarni qabul qiladi.
 *
 * Nega kerak: ErrorBoundary ishga tushganda foydalanuvchi "Xatolik yuz berdi"
 * ni ko'rardi, lekin bu haqda hech kim bilmasdi — xato faqat o'sha odamning
 * konsolida qolardi. Endi u serverdagi bir xil yo'ldan o'tadi va Sentry
 * sozlangan bo'lsa u yerga ham boradi.
 *
 * Autentifikatsiya talab qilinadi: bu endpoint ochiq bo'lsa, uni istalgan
 * odam soxta xato bilan to'ldirishi mumkin edi.
 */
export default async function telemetryRoutes(app: FastifyInstance) {

  const bodySchema = z.object({
    message: z.string().min(1).max(2000),
    // Stack brauzerda juda uzun bo'lishi mumkin — kesib yuboriladi
    stack:   z.string().max(20_000).optional(),
    /** Xato yuz bergan sahifa */
    path:    z.string().max(500).optional(),
    componentStack: z.string().max(20_000).optional(),
  })

  app.post('/client-error', { onRequest: [app.authenticate] }, async (request, reply) => {
    const body = bodySchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: body.error.errors[0].message },
      })
    }

    const err = new Error(body.data.message)
    err.stack = body.data.stack ?? err.stack
    reportError(err, {
      kind:   'clientError',
      path:   body.data.path,
      userId: request.user.sub,
      userAgent: request.headers['user-agent'],
      componentStack: body.data.componentStack,
    })

    return reply.status(202).send({ success: true, data: { received: true } })
  })
}
