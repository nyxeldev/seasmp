import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { courseService } from '../services/course.service'
import { enrollmentService } from '../services/enrollment.service'
import type { CourseStatus } from '@prisma/client'

const createSchema = z.object({
  title:         z.string().min(1).max(255),
  description:   z.string().optional(),
  teacherId:     z.string().uuid(),
  category:      z.string().min(1).max(100),
  price:         z.number().min(0).optional(),
  durationWeeks: z.number().int().min(1),
  maxStudents:   z.number().int().min(1).max(500).optional(),
  schedule:      z.object({
    days: z.array(z.string()),
    time: z.string(),
    room: z.string(),
  }).optional(),
})

const updateSchema = z.object({
  title:         z.string().min(1).max(255).optional(),
  description:   z.string().optional(),
  category:      z.string().min(1).max(100).optional(),
  price:         z.number().min(0).optional(),
  durationWeeks: z.number().int().min(1).optional(),
  maxStudents:   z.number().int().min(1).max(500).optional(),
  schedule:      z.object({
    days: z.array(z.string()),
    time: z.string(),
    room: z.string(),
  }).optional(),
})

const statusSchema = z.object({
  status: z.enum(['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED']),
})

function validationError(reply: any, message: string) {
  return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message } })
}

export default async function courseRoutes(app: FastifyInstance) {

  // GET /v1/courses
  app.get('/', { onRequest: [app.authenticate] }, async (request, reply) => {
    const q = request.query as any

    // Students and teachers see ACTIVE courses by default unless filtered
    const defaultStatus = (request.user.role === 'ADMIN' || request.user.role === 'SUPER_ADMIN')
      ? undefined
      : 'ACTIVE' as CourseStatus

    const result = await courseService.list({
      status:    (q.status as CourseStatus | undefined) ?? defaultStatus,
      teacherId: request.user.role === 'TEACHER' ? request.user.sub : q.teacherId,
      category:  q.category,
      page:      Math.max(1, parseInt(q.page  ?? '1')),
      limit:     Math.min(100, parseInt(q.limit ?? '20')),
      search:    q.search,
    })
    return reply.send({ success: true, ...result })
  })

  // GET /v1/courses/:id
  app.get('/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const course = await courseService.findById(id)
    return reply.send({ success: true, data: course })
  })

  // POST /v1/courses  (admin + teacher)
  app.post('/', { onRequest: [app.authenticate, app.requireRoles('ADMIN', 'SUPER_ADMIN', 'TEACHER')] }, async (request, reply) => {
    const body = createSchema.safeParse(request.body)
    if (!body.success) return validationError(reply, body.error.errors[0].message)

    const course = await courseService.create(body.data, request.user.sub, request.user.role, request.ip)
    return reply.status(201).send({ success: true, data: course })
  })

  // PATCH /v1/courses/:id  (admin + teacher)
  app.patch('/:id', { onRequest: [app.authenticate, app.requireRoles('ADMIN', 'SUPER_ADMIN', 'TEACHER')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = updateSchema.safeParse(request.body)
    if (!body.success) return validationError(reply, body.error.errors[0].message)

    const course = await courseService.update(id, body.data, request.user.sub, request.user.role, request.ip)
    return reply.send({ success: true, data: course })
  })

  // PATCH /v1/courses/:id/status  (admin + teacher)
  app.patch('/:id/status', { onRequest: [app.authenticate, app.requireRoles('ADMIN', 'SUPER_ADMIN', 'TEACHER')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = statusSchema.safeParse(request.body)
    if (!body.success) return validationError(reply, body.error.errors[0].message)

    const course = await courseService.changeStatus(id, body.data.status, request.user.sub, request.user.role, request.ip)
    return reply.send({ success: true, data: course })
  })

  // DELETE /v1/courses/:id  (admin only — soft delete → ARCHIVED)
  app.delete('/:id', { onRequest: [app.authenticate, app.requireRoles('ADMIN', 'SUPER_ADMIN')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await courseService.delete(id, request.user.sub, request.ip)
    return reply.send({ success: true, data: { message: "Kurs arxivlandi" } })
  })

  // POST /v1/courses/:id/enroll  (Admin — enroll a student)
  app.post('/:id/enroll', { onRequest: [app.authenticate, app.requireRoles('ADMIN', 'SUPER_ADMIN')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({ studentId: z.string().uuid() }).safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: body.error.errors[0].message } })
    }
    const enrollment = await enrollmentService.enroll(body.data.studentId, id, request.user.sub, request.user.role, request.ip)
    return reply.status(201).send({ success: true, data: enrollment })
  })
}
