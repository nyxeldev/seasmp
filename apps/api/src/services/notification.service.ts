/**
 * Foydalanuvchi bildirishnomalari.
 *
 * Nega alohida jadval: qo'ng'iroq ilgari audit jurnalidan yasalardi va shuning
 * uchun faqat adminlar uchun ishlardi. Audit jurnali harakatni KIM qilganini
 * yozadi — talabaga "bahoyingiz qo'yildi" deyish uchun esa xabar KIMGA
 * tegishli ekani kerak. Bu ikki xil savol, bitta jadval ikkalasiga javob
 * bera olmaydi.
 *
 * Yaratish har doim "jim": bildirishnoma qo'shimcha qulaylik, asosiy amal
 * emas. Baho qo'yish bildirishnoma yozilmagani uchun yiqilmasligi kerak.
 */
import type { NotificationType, Prisma } from '@prisma/client'
import { prisma } from '../config/prisma'
import { logger } from '../config/logger'
import { emitNotification } from '../realtime/gateway'

export interface NewNotification {
  userId: string
  type:   NotificationType
  title:  string
  body?:  string
  link?:  string
  data?:  Prisma.InputJsonValue
}

/** Ro'yxatda bir sahifada nechta ko'rsatiladi */
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

export const notificationService = {
  /**
   * Bittasini yaratadi va egasiga jonli yuboradi.
   * Hech qachon istisno tashlamaydi.
   */
  async create(n: NewNotification): Promise<void> {
    try {
      const row = await prisma.notification.create({
        data: {
          userId: n.userId,
          type:   n.type,
          title:  n.title,
          body:   n.body ?? null,
          link:   n.link ?? null,
          data:   n.data ?? {},
        },
      })
      emitNotification(n.userId, {
        id:        row.id.toString(),
        type:      row.type,
        title:     row.title,
        body:      row.body,
        link:      row.link,
        createdAt: row.createdAt.toISOString(),
      })
    } catch (err) {
      logger.warn({ msg: 'Bildirishnoma yaratishda xato', err: (err as Error).message })
    }
  },

  /**
   * Bir nechtasini yaratadi — masalan bitta xavfsizlik ogohlantirishi
   * barcha adminlarga. `createMany` bitta so'rovda yozadi, keyin jonli
   * yuborish uchun qatorlar qayta o'qiladi.
   */
  async createMany(list: NewNotification[]): Promise<void> {
    if (list.length === 0) return
    try {
      await prisma.notification.createMany({
        data: list.map((n) => ({
          userId: n.userId,
          type:   n.type,
          title:  n.title,
          body:   n.body ?? null,
          link:   n.link ?? null,
          data:   n.data ?? {},
        })),
      })
      // createMany yaratilgan qatorlarni qaytarmaydi (PostgreSQL da ham),
      // shuning uchun jonli xabar uchun eng so'nggilari o'qiladi.
      const userIds = [...new Set(list.map((n) => n.userId))]
      const rows = await prisma.notification.findMany({
        where: { userId: { in: userIds } },
        orderBy: { id: 'desc' },
        take: list.length,
      })
      for (const row of rows) {
        emitNotification(row.userId, {
          id:        row.id.toString(),
          type:      row.type,
          title:     row.title,
          body:      row.body,
          link:      row.link,
          createdAt: row.createdAt.toISOString(),
        })
      }
    } catch (err) {
      logger.warn({ msg: 'Bildirishnomalarni yaratishda xato', err: (err as Error).message })
    }
  },

  async list(userId: string, opts: { limit?: number; unreadOnly?: boolean } = {}) {
    const take = Math.min(MAX_LIMIT, Math.max(1, opts.limit ?? DEFAULT_LIMIT))
    const rows = await prisma.notification.findMany({
      where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take,
    })
    return rows.map((r) => ({ ...r, id: r.id.toString() }))
  },

  async unreadCount(userId: string): Promise<number> {
    return prisma.notification.count({ where: { userId, readAt: null } })
  },

  /** Faqat O'Z bildirishnomasini belgilay oladi — shart `userId` bilan birga */
  async markRead(id: bigint, userId: string): Promise<boolean> {
    const res = await prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data:  { readAt: new Date() },
    })
    return res.count > 0
  },

  async markAllRead(userId: string): Promise<number> {
    const res = await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data:  { readAt: new Date() },
    })
    return res.count
  },
}

/**
 * Barcha faol imtiyozli foydalanuvchilarga bitta xabar.
 *
 * Xavfsizlik ogohlantirishlari uchun: ular kimgadir emas, ROLGA tegishli.
 * Ro'yxat har safar o'qiladi — adminlar soni kichik, keshlash murakkablikka
 * arzimaydi, eskirgan kesh esa yangi adminni xabarsiz qoldirardi.
 */
export async function notifyAdmins(
  n: Omit<NewNotification, 'userId'>,
): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where: { isActive: true, role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
      select: { id: true },
    })
    await notificationService.createMany(admins.map((a) => ({ ...n, userId: a.id })))
  } catch (err) {
    logger.warn({ msg: 'Adminlarga xabar berishda xato', err: (err as Error).message })
  }
}
