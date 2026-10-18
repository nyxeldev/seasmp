import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as crypto from 'node:crypto'
import { env } from '../config/env'
import { auditService } from '../services/audit.service'

/**
 * Doimiy-vaqtli taqqoslash — oddiy `!==` kalit uzunligi/belgilarga qarab
 * javob vaqtini biroz o'zgartiradi, bu nazariy jihatdan sirni bosqichma-
 * bosqich taxmin qilish imkonini beradi. `timingSafeEqual` uzunliklar mos
 * kelmasa tashlaydi, shuning uchun bu holat alohida — lekin baribir bir xil
 * uzunlikdagi doimiy-vaqtli taqqoslash bilan — ishlanadi, erta `return`dan
 * qochiladi.
 */
function safeKeyEqual(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided, 'utf8')
  const expectedBuf = Buffer.from(expected, 'utf8')
  if (providedBuf.length !== expectedBuf.length) {
    crypto.timingSafeEqual(expectedBuf, expectedBuf)
    return false
  }
  return crypto.timingSafeEqual(providedBuf, expectedBuf)
}

export default async function internalRoutes(app: FastifyInstance) {

  // Internal routes are protected by X-Internal-Key, not JWT
  app.addHook('onRequest', async (request, reply) => {
    const key = request.headers['x-internal-key']
    // Kalit hech qachon log/xatoga chiqarilmaydi — faqat mavjudligi va
    // mosligi tekshiriladi.
    if (typeof key !== 'string' || !safeKeyEqual(key, env.ANALYTICS_INTERNAL_KEY)) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }
  })

  // POST /v1/internal/notifications
  // Called by analytics service when high-risk students are detected
  app.post('/notifications', async (request, reply) => {
    const body = z.object({
      type: z.string(),
      data: z.array(z.object({
        enrollmentId: z.string(),
        studentId:    z.string(),
        riskScore:    z.number(),
      })),
    }).safeParse(request.body)

    if (!body.success) return reply.status(400).send({ error: 'Invalid payload' })

    const { type, data } = body.data
    app.log.info(`[internal] notification type=${type} count=${data.length}`)

    // Log each high-risk alert to audit log
    for (const item of data) {
      await auditService.log({
        userId: null,
        action: 'CREATE',
        resource: 'security_alerts',
        resourceId: item.enrollmentId,
        newData: { type, riskScore: item.riskScore },
        ipAddress: '127.0.0.1',
      }).catch(() => {})
    }

    return reply.send({ success: true, processed: data.length })
  })
}
