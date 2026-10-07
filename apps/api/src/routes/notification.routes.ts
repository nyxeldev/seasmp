import type { FastifyInstance } from 'fastify'
import { notificationService } from '../services/notification.service'
import { PG_BIGINT_MAX } from '../lib/prismaErrors'

/**
 * Bildirishnomalar — har bir foydalanuvchi FAQAT o'zinikini ko'radi.
 *
 * Bu yerda rol tekshiruvi yo'q va bo'lmasligi ham kerak: egalik `request.user
 * .sub` orqali aniqlanadi, ya'ni boshqa birovning bildirishnomasini so'rash
 * imkoni umuman yo'q. Marshrutga `:userId` qo'yilmagani ataylab.
 */
export default async function notificationRoutes(app: FastifyInstance) {

  app.get('/', { onRequest: [app.authenticate] }, async (request, reply) => {
    const q = request.query as { limit?: string; unread?: string }
    const rows = await notificationService.list(request.user.sub, {
      limit:      q.limit ? parseInt(q.limit, 10) : undefined,
      unreadOnly: q.unread === 'true',
    })
    return reply.send({ success: true, data: rows })
  })

  app.get('/unread-count', { onRequest: [app.authenticate] }, async (request, reply) => {
    const count = await notificationService.unreadCount(request.user.sub)
    return reply.send({ success: true, data: { count } })
  })

  app.patch('/:id/read', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    let parsed: bigint
    try { parsed = BigInt(id) } catch {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: "Identifikator noto'g'ri" },
      })
    }
    if (parsed > PG_BIGINT_MAX) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: "Identifikator noto'g'ri" },
      })
    }
    const ok = await notificationService.markRead(parsed, request.user.sub)
    if (!ok) {
      // Begona yoki allaqachon o'qilgan — ikkalasi uchun ham 404. Boshqa
      // foydalanuvchining bildirishnomasi BOR ekanini bilib olish imkoni
      // qolmasligi uchun farq qilinmaydi.
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Bildirishnoma topilmadi' },
      })
    }
    return reply.send({ success: true, data: { id } })
  })

  app.patch('/read-all', { onRequest: [app.authenticate] }, async (request, reply) => {
    const count = await notificationService.markAllRead(request.user.sub)
    return reply.send({ success: true, data: { count } })
  })
}
