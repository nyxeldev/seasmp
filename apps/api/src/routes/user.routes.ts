import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { userService } from '../services/user.service'
import type { UserRole } from '@prisma/client'

const createSchema = z.object({
  email:     z.string().email("Email format noto'g'ri"),
  password:  z.string().min(8, "Parol kamida 8 ta belgi"),
  firstName: z.string().min(1).max(100),
  lastName:  z.string().min(1).max(100),
  role:      z.enum(['ADMIN', 'TEACHER', 'STUDENT']),
})

const updateSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName:  z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().optional(),
})

const passwordSchema = z.object({
  oldPassword: z.string().min(8),
  newPassword: z.string().min(8),
})

function validationError(reply: any, message: string) {
  return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message } })
}

export default async function userRoutes(app: FastifyInstance) {

  // GET /v1/users/me
  app.get('/me', { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = await userService.findById(request.user.sub)
    return reply.send({ success: true, data: user })
  })

  // PATCH /v1/users/me
  app.patch('/me', { onRequest: [app.authenticate] }, async (request, reply) => {
    const body = updateSchema.safeParse(request.body)
    if (!body.success) return validationError(reply, body.error.errors[0].message)

    const user = await userService.update(request.user.sub, body.data, request.user.sub, request.ip)
    return reply.send({ success: true, data: user })
  })

  // PATCH /v1/users/me/password
  app.patch('/me/password', { onRequest: [app.authenticate] }, async (request, reply) => {
    const body = passwordSchema.safeParse(request.body)
    if (!body.success) return validationError(reply, body.error.errors[0].message)

    await userService.changePassword(request.user.sub, body.data.oldPassword, body.data.newPassword, request.ip)
    return reply.send({ success: true, data: { message: "Parol muvaffaqiyatli o'zgartirildi" } })
  })

  // GET /v1/users  (admin only)
  app.get('/', { onRequest: [app.authenticate, app.requireRoles('ADMIN', 'SUPER_ADMIN')] }, async (request, reply) => {
    const q = request.query as any
    const result = await userService.list({
      role:   q.role as UserRole | undefined,
      page:   Math.max(1, parseInt(q.page  ?? '1')),
      limit:  Math.min(100, parseInt(q.limit ?? '20')),
      search: q.search,
    })
    return reply.send({ success: true, ...result })
  })

  // GET /v1/users/:id  (self or Admin+)
  app.get('/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const isSelf  = request.user.sub === id
    const isAdmin = request.user.role === 'ADMIN' || request.user.role === 'SUPER_ADMIN'
    if (!isSelf && !isAdmin) {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: "Ruxsat yo'q" } })
    }
    const user = await userService.findById(id)
    return reply.send({ success: true, data: user })
  })

  // POST /v1/users  (admin only)
  app.post('/', { onRequest: [app.authenticate, app.requireRoles('ADMIN', 'SUPER_ADMIN')] }, async (request, reply) => {
    const body = createSchema.safeParse(request.body)
    if (!body.success) return validationError(reply, body.error.errors[0].message)

    const user = await userService.create(body.data, request.user.sub, request.ip)
    return reply.status(201).send({ success: true, data: user })
  })

  // PATCH /v1/users/:id  (self or Admin+)
  app.patch('/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const isSelf  = request.user.sub === id
    const isAdmin = request.user.role === 'ADMIN' || request.user.role === 'SUPER_ADMIN'
    if (!isSelf && !isAdmin) {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: "Ruxsat yo'q" } })
    }
    const body = updateSchema.safeParse(request.body)
    if (!body.success) return validationError(reply, body.error.errors[0].message)

    const user = await userService.update(id, body.data, request.user.sub, request.ip)
    return reply.send({ success: true, data: user })
  })

  // DELETE /v1/users/:id  (Super Admin only)
  app.delete('/:id', { onRequest: [app.authenticate, app.requireRoles('SUPER_ADMIN')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await userService.deleteUser(id, request.user.sub, request.ip)
    return reply.send({ success: true, data: { message: "Foydalanuvchi o'chirildi" } })
  })

  // PATCH /v1/users/:id/toggle-status  (admin only)
  app.patch('/:id/toggle-status', { onRequest: [app.authenticate, app.requireRoles('ADMIN', 'SUPER_ADMIN')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const user = await userService.toggleStatus(id, request.user.sub, request.ip)
    return reply.send({ success: true, data: user })
  })
}
