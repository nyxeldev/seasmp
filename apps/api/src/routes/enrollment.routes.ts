import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { enrollmentService } from '../services/enrollment.service'
import type { EnrollmentStatus } from '@prisma/client'

const enrollSchema = z.object({
  studentId: z.string().uuid(),
  courseId:  z.string().uuid(),
})

const statusSchema = z.object({
  status: z.enum(['ACTIVE', 'COMPLETED', 'DROPPED']),
})

function validationError(reply: any, message: string) {
  return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message } })
}

export default async function enrollmentRoutes(app: FastifyInstance) {

  // GET /v1/enrollments
  app.get('/', { onRequest: [app.authenticate] }, async (request, reply) => {
    const q = request.query as any
    const result = await enrollmentService.list({
      studentId: q.studentId,
      courseId:  q.courseId,
      status:    q.status as EnrollmentStatus | undefined,
      actorId:   request.user.sub,
      actorRole: request.user.role,
      page:      Math.max(1, parseInt(q.page  ?? '1')),
      limit:     Math.min(100, parseInt(q.limit ?? '20')),
    })
    return reply.send({ success: true, ...result })
  })

  // GET /v1/enrollments/:id
  app.get('/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const enrollment = await enrollmentService.findById(id, request.user.sub, request.user.role)
    return reply.send({ success: true, data: enrollment })
  })

  // POST /v1/enrollments  (admin enrolls anyone; student self-enrolls)
  app.post('/', { onRequest: [app.authenticate, app.requireRoles('ADMIN', 'SUPER_ADMIN', 'STUDENT')] }, async (request, reply) => {
    const body = enrollSchema.safeParse(request.body)
    if (!body.success) return validationError(reply, body.error.errors[0].message)

    const enrollment = await enrollmentService.enroll(
      body.data.studentId, body.data.courseId,
      request.user.sub, request.user.role, request.ip
    )
    return reply.status(201).send({ success: true, data: enrollment })
  })

  // PATCH /v1/enrollments/:id/status
  app.patch('/:id/status', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = statusSchema.safeParse(request.body)
    if (!body.success) return validationError(reply, body.error.errors[0].message)

    const enrollment = await enrollmentService.changeStatus(
      id, body.data.status, request.user.sub, request.user.role, request.ip
    )
    return reply.send({ success: true, data: enrollment })
  })
}
