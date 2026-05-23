import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { attendanceService } from '../services/attendance.service'
import type { AttendanceStatus } from '@prisma/client'

const markSchema = z.object({
  enrollmentId: z.string().uuid(),
  lessonDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Sana YYYY-MM-DD formatida bo'lishi kerak"),
  status:       z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']),
})

const qrGenerateSchema = z.object({
  courseId:   z.string().uuid(),
  lessonDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Sana YYYY-MM-DD formatida bo'lishi kerak"),
})

const qrMarkSchema = z.object({
  token: z.string().min(1),
})

function validationError(reply: any, message: string) {
  return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message } })
}

export default async function attendanceRoutes(app: FastifyInstance) {

  // GET /v1/attendance
  app.get('/', { onRequest: [app.authenticate] }, async (request, reply) => {
    const q = request.query as any
    const result = await attendanceService.list({
      enrollmentId: q.enrollmentId,
      courseId:     q.courseId,
      lessonDate:   q.lessonDate,
      actorId:      request.user.sub,
      actorRole:    request.user.role,
      page:  Math.max(1, parseInt(q.page  ?? '1')),
      limit: Math.min(100, parseInt(q.limit ?? '20')),
    })
    return reply.send({ success: true, ...result })
  })

  // POST /v1/attendance  (teacher + admin)
  app.post('/', { onRequest: [app.authenticate, app.requireRoles('ADMIN', 'SUPER_ADMIN', 'TEACHER')] }, async (request, reply) => {
    const body = markSchema.safeParse(request.body)
    if (!body.success) return validationError(reply, body.error.errors[0].message)

    const record = await attendanceService.mark(body.data, request.user.sub, request.user.role, request.ip)
    return reply.status(201).send({ success: true, data: record })
  })

  // GET /v1/attendance/courses/:courseId  (teacher / admin — full course attendance)
  app.get('/courses/:courseId', { onRequest: [app.authenticate, app.requireRoles('ADMIN', 'SUPER_ADMIN', 'TEACHER')] }, async (request, reply) => {
    const { courseId } = request.params as { courseId: string }
    const q = request.query as any
    const result = await attendanceService.list({
      courseId,
      lessonDate:  q.lessonDate,
      actorId:     request.user.sub,
      actorRole:   request.user.role,
      page:  Math.max(1, parseInt(q.page  ?? '1')),
      limit: Math.min(500, parseInt(q.limit ?? '200')),
    })
    return reply.send({ success: true, ...result })
  })

  // GET /v1/attendance/stats/:enrollmentId
  app.get('/stats/:enrollmentId', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { enrollmentId } = request.params as { enrollmentId: string }
    const stats = await attendanceService.getStats(enrollmentId, request.user.sub, request.user.role)
    return reply.send({ success: true, data: stats })
  })

  // POST /v1/attendance/qr/generate  (teacher only)
  app.post('/qr/generate', { onRequest: [app.authenticate, app.requireRoles('TEACHER', 'ADMIN', 'SUPER_ADMIN')] }, async (request, reply) => {
    const body = qrGenerateSchema.safeParse(request.body)
    if (!body.success) return validationError(reply, body.error.errors[0].message)

    const result = await attendanceService.generateQrToken(body.data.courseId, body.data.lessonDate, request.user.sub, request.user.role)
    return reply.send({ success: true, data: result })
  })

  // POST /v1/attendance/qr/mark  (student only — scan QR)
  app.post('/qr/mark', { onRequest: [app.authenticate, app.requireRoles('STUDENT')] }, async (request, reply) => {
    const body = qrMarkSchema.safeParse(request.body)
    if (!body.success) return validationError(reply, body.error.errors[0].message)

    const record = await attendanceService.markByQr(body.data.token, request.user.sub, request.ip)
    return reply.status(201).send({ success: true, data: record })
  })
}
