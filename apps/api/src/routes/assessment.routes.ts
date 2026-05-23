import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { assessmentService } from '../services/assessment.service'

const createAssessmentSchema = z.object({
  courseId:  z.string().uuid(),
  title:     z.string().min(1).max(255),
  type:      z.enum(['QUIZ', 'MIDTERM', 'FINAL', 'HOMEWORK']),
  maxScore:  z.number().positive().optional(),
  weight:    z.number().min(0).max(1).optional(),
  dueDate:   z.string().datetime().optional(),
})

const updateAssessmentSchema = z.object({
  title:    z.string().min(1).max(255).optional(),
  maxScore: z.number().positive().optional(),
  weight:   z.number().min(0).max(1).optional(),
  dueDate:  z.string().datetime().nullable().optional(),
})

const gradeSchema = z.object({
  enrollmentId: z.string().uuid(),
  score:        z.number().min(0),
  feedback:     z.string().optional(),
})

function validationError(reply: any, message: string) {
  return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message } })
}

export default async function assessmentRoutes(app: FastifyInstance) {

  // GET /v1/assessments/course/:courseId
  app.get('/course/:courseId', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { courseId } = request.params as { courseId: string }
    const assessments = await assessmentService.listByCourse(courseId, request.user.sub, request.user.role)
    return reply.send({ success: true, data: assessments })
  })

  // POST /v1/assessments  (teacher + admin)
  app.post('/', { onRequest: [app.authenticate, app.requireRoles('ADMIN', 'SUPER_ADMIN', 'TEACHER')] }, async (request, reply) => {
    const body = createAssessmentSchema.safeParse(request.body)
    if (!body.success) return validationError(reply, body.error.errors[0].message)

    const assessment = await assessmentService.create(body.data, request.user.sub, request.user.role, request.ip)
    return reply.status(201).send({ success: true, data: assessment })
  })

  // PATCH /v1/assessments/:id  (teacher + admin)
  app.patch('/:id', { onRequest: [app.authenticate, app.requireRoles('ADMIN', 'SUPER_ADMIN', 'TEACHER')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = updateAssessmentSchema.safeParse(request.body)
    if (!body.success) return validationError(reply, body.error.errors[0].message)

    const assessment = await assessmentService.update(id, body.data, request.user.sub, request.user.role, request.ip)
    return reply.send({ success: true, data: assessment })
  })

  // DELETE /v1/assessments/:id  (teacher + admin)
  app.delete('/:id', { onRequest: [app.authenticate, app.requireRoles('ADMIN', 'SUPER_ADMIN', 'TEACHER')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await assessmentService.delete(id, request.user.sub, request.user.role, request.ip)
    return reply.send({ success: true, data: { message: "Baholash o'chirildi" } })
  })

  // GET /v1/assessments/:id/grades
  app.get('/:id/grades', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const grades = await assessmentService.listGrades(id, request.user.sub, request.user.role)
    return reply.send({ success: true, data: grades })
  })

  // GET /v1/assessments/enrollment/:enrollmentId/grades  (enrollment-centric view)
  app.get('/enrollment/:enrollmentId/grades', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { enrollmentId } = request.params as { enrollmentId: string }
    const grades = await assessmentService.gradesByEnrollment(enrollmentId, request.user.sub, request.user.role)
    return reply.send({ success: true, data: grades })
  })

  // POST /v1/assessments/:id/grades  (teacher + admin)
  app.post('/:id/grades', { onRequest: [app.authenticate, app.requireRoles('ADMIN', 'SUPER_ADMIN', 'TEACHER')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = gradeSchema.safeParse(request.body)
    if (!body.success) return validationError(reply, body.error.errors[0].message)

    const grade = await assessmentService.submitGrade(
      { assessmentId: id, ...body.data },
      request.user.sub, request.user.role, request.ip
    )
    return reply.status(201).send({ success: true, data: grade })
  })
}
