import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { userService } from '../services/user.service'
import { saveAvatar, InvalidAvatarError, deleteAvatarIfLocal } from '../services/avatarStorage.service'
import type { UserRole } from '@prisma/client'

const createSchema = z.object({
  email:     z.string().email("Email format noto'g'ri"),
  password:  z.string().min(8, "Parol kamida 8 ta belgi"),
  firstName: z.string().min(1).max(100),
  lastName:  z.string().min(1).max(100),
  role:      z.enum(['ADMIN', 'TEACHER', 'STUDENT']),
})

// M2: `avatarUrl` ataylab YO'Q. Yagona ishonchli avatar yo'li — quyidagi
// `POST /me/avatar` (bayt-imzosi tekshiruvi, serverda generatsiya qilingan
// fayl nomi). Bu sxema shu YANGI tasdiqlangan avatarni DB'ga yozish uchun
// ishlatilmaydi — u `userService.update()`ni to'g'ridan-to'g'ri, shu sxemani
// chetlab o'tib chaqiradi (quyida, `saved.relativeUrl` bilan). Agar
// `avatarUrl` shu umumiy profil sxemasiga qo'shilsa, mijoz istalgan tashqi
// URL'ni avatar sifatida yozib qo'ya olardi — xavfsiz yuklash arxitekturasi
// butunlay chetlab o'tilardi.
const updateSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName:  z.string().min(1).max(100).optional(),
})

/**
 * Mijoz `avatarUrl`ni umumiy profil PATCH'iga qo'shib yuborishga urinsa —
 * jim qoldirib olib tashlash (Zod standart "strip" xulq-atvori) o'rniga,
 * aniq rad etiladi. Shunda API iste'molchisi so'rovi e'tiborsiz
 * qolganini bilmay qolmaydi.
 */
function rejectsClientAvatarUrl(reply: any, body: unknown): boolean {
  if (body && typeof body === 'object' && 'avatarUrl' in (body as Record<string, unknown>)) {
    reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: "avatarUrl bu yerda o'zgartirilmaydi — avatar yuklash uchun POST /v1/users/me/avatar dan foydalaning",
      },
    })
    return true
  }
  return false
}

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
    if (rejectsClientAvatarUrl(reply, request.body)) return

    const body = updateSchema.safeParse(request.body)
    if (!body.success) return validationError(reply, body.error.errors[0].message)

    const user = await userService.update(request.user.sub, body.data, request.user.sub, request.ip)
    return reply.send({ success: true, data: user })
  })

  // POST /v1/users/me/avatar
  //
  // Mijoz Next.js'ning o'z Route Handler'i (hech qanday auth'siz) orqali
  // emas, shu yerda — autentifikatsiya, hajm chegarasi va haqiqiy bayt
  // imzosi (magic bytes) tekshiruvi bilan yuklaydi. Fayl nomi/kengaytma/
  // MIME mijozdan OLINMAYDI — hammasi serverda aniqlanadi va generatsiya
  // qilinadi (batafsili: avatarStorage.service.ts).
  app.post('/me/avatar', { onRequest: [app.authenticate] }, async (request, reply) => {
    // L2: eski faylni o'chirish uchun uning yo'li kerak — DB yangilanishidan
    // OLDIN olinadi (keyin ustidan yoziladi). O'chirish esa pastda, faqat
    // YANGI fayl muvaffaqiyatli yozilib, DB muvaffaqiyatli yangilangandan
    // KEYIN bajariladi — aks holda yuklash yoki DB yozish muvaffaqiyatsiz
    // bo'lsa, foydalanuvchi avatarsiz qolib ketardi.
    const existing = await userService.findById(request.user.sub)
    const previousAvatarUrl = existing.avatarUrl

    let data
    try {
      data = await request.file()
    } catch {
      return reply.status(413).send({
        success: false,
        error: { code: 'FILE_TOO_LARGE', message: 'Fayl 2MB dan katta' },
      })
    }

    if (!data) return validationError(reply, 'Fayl topilmadi')

    let buffer: Buffer
    try {
      buffer = await data.toBuffer()
    } catch {
      return reply.status(413).send({
        success: false,
        error: { code: 'FILE_TOO_LARGE', message: 'Fayl 2MB dan katta' },
      })
    }

    let saved
    try {
      saved = await saveAvatar(buffer)
    } catch (err) {
      if (err instanceof InvalidAvatarError) {
        return reply.status(err.statusCode).send({
          success: false,
          error: { code: 'INVALID_FILE', message: err.message },
        })
      }
      throw err
    }

    const user = await userService.update(
      request.user.sub,
      { avatarUrl: saved.relativeUrl },
      request.user.sub,
      request.ip,
    )

    // Yangi fayl diskda, DB yangilandi — endi, faqat endi, eski fayl
    // o'chiriladi. `deleteAvatarIfLocal` o'zi hech qachon tashlamaydi
    // (ENOENT jim o'tkaziladi, boshqa xato faqat qayd etiladi) — shuning
    // uchun bu amal muvaffaqiyatli javobni xavf ostiga qo'ymaydi.
    if (previousAvatarUrl && previousAvatarUrl !== saved.relativeUrl) {
      await deleteAvatarIfLocal(previousAvatarUrl)
    }

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
    if (rejectsClientAvatarUrl(reply, request.body)) return

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
