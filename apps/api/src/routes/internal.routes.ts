import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { env } from '../config/env'
import { auditService } from '../services/audit.service'

export default async function internalRoutes(app: FastifyInstance) {

  // Internal routes are protected by X-Internal-Key, not JWT
  app.addHook('onRequest', async (request, reply) => {
    const key = request.headers['x-internal-key']
    if (key !== env.ANALYTICS_INTERNAL_KEY) {
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
