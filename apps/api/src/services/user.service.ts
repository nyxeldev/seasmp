import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { prisma } from '../config/prisma'
import { auditService } from './audit.service'
import type { User, UserRole } from '@prisma/client'
import type { SafeUser } from './auth.service'

function safeUser(user: User): SafeUser {
  const { passwordHash, twoFactorSecret, ...safe } = user
  return safe
}

export const userService = {
  async list(params: { role?: UserRole; page: number; limit: number; search?: string }) {
    const { role, page, limit, search } = params
    const skip = (page - 1) * limit

    const where: any = {}
    if (role) where.role = role
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName:  { contains: search, mode: 'insensitive' } },
        { email:     { contains: search, mode: 'insensitive' } },
      ]
    }

    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.user.count({ where }),
    ])

    return {
      data: users.map(safeUser),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    }
  },

  async findById(id: string): Promise<SafeUser> {
    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) throw Object.assign(new Error('Foydalanuvchi topilmadi'), { statusCode: 404 })
    return safeUser(user)
  },

  async create(
    data: { email: string; password: string; firstName: string; lastName: string; role: UserRole },
    actorId: string,
    ipAddress: string
  ): Promise<SafeUser> {
    const existing = await prisma.user.findUnique({ where: { email: data.email } })
    if (existing) throw Object.assign(new Error("Bu email allaqachon ro'yxatdan o'tgan"), { statusCode: 409 })

    const passwordHash = await bcrypt.hash(data.password, 12)
    const user = await prisma.user.create({
      data: { email: data.email, passwordHash, firstName: data.firstName, lastName: data.lastName, role: data.role },
    })

    await auditService.log({
      userId: actorId, action: 'CREATE', resource: 'users',
      resourceId: user.id, newData: { email: user.email, role: user.role }, ipAddress,
    })

    return safeUser(user)
  },

  async update(
    id: string,
    data: { firstName?: string; lastName?: string; avatarUrl?: string },
    actorId: string,
    ipAddress: string
  ): Promise<SafeUser> {
    const old = await prisma.user.findUnique({ where: { id } })
    if (!old) throw Object.assign(new Error('Foydalanuvchi topilmadi'), { statusCode: 404 })

    const user = await prisma.user.update({ where: { id }, data })

    await auditService.log({
      userId: actorId, action: 'UPDATE', resource: 'users', resourceId: id,
      oldData: { firstName: old.firstName, lastName: old.lastName, avatarUrl: old.avatarUrl },
      newData: data, ipAddress,
    })

    return safeUser(user)
  },

  async deleteUser(id: string, actorId: string, ipAddress: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) throw Object.assign(new Error('Foydalanuvchi topilmadi'), { statusCode: 404 })

    // courses.teacher_id / enrollments.student_id / grades.graded_by /
    // attendance.marked_by hammasi ON DELETE RESTRICT — bu ataylab shunday:
    // kurs o'qitgan yoki talaba sifatida tarix qoldirgan hisobni jimgina
    // o'chirib, o'sha tarixni yetim qoldirish xavfsizlik va audit nuqtai
    // nazaridan noto'g'ri. Hard delete faqat HECH QANDAY tarixi yo'q
    // hisoblar uchun ishlaydi; qolganlari uchun to'g'ri yo'l — deaktivatsiya
    // (`toggleStatus` / `isActive=false`), u allaqachon ishlaydi va hisobni
    // tizimga kira olmaydigan holga keltiradi, tarixni yo'qotmaydi.
    try {
      await prisma.user.delete({ where: { id } })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw Object.assign(
          new Error(
            "Bu foydalanuvchini o'chirib bo'lmaydi: unga bog'liq kurslar, ro'yxatga olishlar, baholar yoki " +
            "davomat yozuvlari mavjud. Buning o'rniga hisobni deaktivatsiya qiling " +
            "(PATCH /v1/users/:id/toggle-status) — bu tarixni saqlab, foydalanuvchining tizimga kirishini to'xtatadi."
          ),
          { statusCode: 409 },
        )
      }
      throw err
    }

    await auditService.log({
      userId: actorId, action: 'DELETE', resource: 'users',
      resourceId: id, oldData: { email: user.email, role: user.role }, ipAddress,
    })
  },

  async toggleStatus(id: string, actorId: string, ipAddress: string): Promise<SafeUser> {
    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) throw Object.assign(new Error('Foydalanuvchi topilmadi'), { statusCode: 404 })

    const updated = await prisma.user.update({ where: { id }, data: { isActive: !user.isActive } })

    await auditService.log({
      userId: actorId, action: 'UPDATE', resource: 'users', resourceId: id,
      oldData: { isActive: user.isActive }, newData: { isActive: updated.isActive }, ipAddress,
    })

    return safeUser(updated)
  },

  async changePassword(id: string, oldPassword: string, newPassword: string, ipAddress: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) throw Object.assign(new Error('Foydalanuvchi topilmadi'), { statusCode: 404 })

    const isValid = await bcrypt.compare(oldPassword, user.passwordHash)
    if (!isValid) throw Object.assign(new Error("Eski parol noto'g'ri"), { statusCode: 400 })

    const passwordHash = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({ where: { id }, data: { passwordHash } })

    await auditService.log({ userId: id, action: 'PASSWORD_CHANGE', resource: 'users', resourceId: id, ipAddress })
  },
}
