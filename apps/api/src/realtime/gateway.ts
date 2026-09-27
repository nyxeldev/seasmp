/**
 * Real vaqt shlyuzi — autentifikatsiyalangan Socket.io.
 *
 * Ilgari ulanish umuman tekshirilmasdi va xonaga qo'shilish MIJOZ bergan
 * identifikator bo'yicha bo'lardi:
 *
 *   socket.on('join:dashboard', (userId) => socket.join(`user:${userId}`))
 *   socket.on('join:course',    (courseId) => socket.join(`course:${courseId}`))
 *
 * Ya'ni istalgan odam istalgan foydalanuvchining yoki kursning xonasiga
 * kirib olardi. Hech narsa uzatilmagani uchun bu zarar keltirmagan, lekin
 * ustiga xavfsizlik ogohlantirishini uzatish — ogohlantirishlarni hammaga
 * ochish degani bo'lardi.
 *
 * Endi xonalar FAQAT tekshirilgan tokendan olinadi:
 *   user:<sub>      — har doim, tokendagi sub bo'yicha
 *   role:<ROLE>     — tokendagi rol bo'yicha
 *   course:<id>     — faqat server tomonda haqli ekani tasdiqlangandan keyin
 */
import { Server, type Socket } from 'socket.io'
import type { Server as HttpServer } from 'node:http'
import * as jwt from 'jsonwebtoken'
import type { UserRole } from '@prisma/client'
import { env } from '../config/env'
import { logger } from '../config/logger'
import { prisma } from '../config/prisma'

interface TokenPayload { sub: string; role: UserRole }

/** Ulangan soketga biriktiriladigan, TEKSHIRILGAN ma'lumot */
interface SocketUser { id: string; role: UserRole }

declare module 'socket.io' {
  interface Socket { seasmpUser?: SocketUser }
}

let io: Server | null = null

const PRIVILEGED: UserRole[] = ['ADMIN', 'SUPER_ADMIN']

export const ROOM = {
  user:   (id: string) => `user:${id}`,
  role:   (r: string)  => `role:${r}`,
  course: (id: string) => `course:${id}`,
} as const

/** Handshake dagi tokenni o'qiydi: auth.token yoki Authorization sarlavhasi */
function tokenFrom(socket: Socket): string | null {
  const fromAuth = (socket.handshake.auth as { token?: unknown } | undefined)?.token
  if (typeof fromAuth === 'string' && fromAuth.length > 0) return fromAuth
  const header = socket.handshake.headers.authorization
  if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7)
  return null
}

/**
 * Aktor shu kursning xonasiga qo'shila oladimi.
 * Admin — hamma kursga, o'qituvchi — o'zinikiga, talaba — yozilgan kursiga.
 */
async function mayJoinCourse(user: SocketUser, courseId: string): Promise<boolean> {
  if (PRIVILEGED.includes(user.role)) return true
  try {
    if (user.role === 'TEACHER') {
      const c = await prisma.course.findFirst({
        where: { id: courseId, teacherId: user.id }, select: { id: true },
      })
      return c !== null
    }
    const e = await prisma.enrollment.findFirst({
      where: { courseId, studentId: user.id }, select: { id: true },
    })
    return e !== null
  } catch (err) {
    logger.warn({ msg: 'Kurs xonasini tekshirishda xato', err: (err as Error).message })
    return false
  }
}

export function initRealtime(server: HttpServer): Server {
  io = new Server(server, {
    cors: { origin: env.CORS_ORIGIN, credentials: true },
    path: '/ws',
  })

  // Autentifikatsiya ULANISHDAN OLDIN. Token yaroqsiz bo'lsa soket
  // umuman ochilmaydi — keyinroq tekshirish ishonchsiz bo'lardi.
  io.use((socket, next) => {
    const raw = tokenFrom(socket)
    if (!raw) return next(new Error('UNAUTHORIZED'))
    try {
      const payload = jwt.verify(raw, env.JWT_ACCESS_SECRET) as TokenPayload
      socket.seasmpUser = { id: payload.sub, role: payload.role }
      next()
    } catch {
      next(new Error('UNAUTHORIZED'))
    }
  })

  io.on('connection', (socket) => {
    const user = socket.seasmpUser
    if (!user) { socket.disconnect(true); return }

    socket.join(ROOM.user(user.id))
    socket.join(ROOM.role(user.role))
    logger.info({ msg: 'WebSocket ulandi', socketId: socket.id, role: user.role })

    socket.on('join:course', async (courseId: unknown, ack?: (ok: boolean) => void) => {
      if (typeof courseId !== 'string' || courseId.length === 0) { ack?.(false); return }
      const allowed = await mayJoinCourse(user, courseId)
      if (allowed) socket.join(ROOM.course(courseId))
      else logger.warn({ msg: 'Kurs xonasiga ruxsatsiz urinish', userId: user.id, courseId })
      ack?.(allowed)
    })

    socket.on('leave:course', (courseId: unknown) => {
      if (typeof courseId === 'string') socket.leave(ROOM.course(courseId))
    })

    socket.on('disconnect', () => logger.info({ msg: 'WebSocket uzildi', socketId: socket.id }))
  })

  return io
}

export function closeRealtime(): void {
  io?.close()
  io = null
}

/**
 * Emit hech qachon istisno tashlamasligi kerak: real vaqt qulaylik, biznes
 * amali emas. Shlyuz ishga tushmagan bo'lsa (masalan testlarda) jim turadi.
 */
function emit(room: string, event: string, payload: unknown): void {
  try {
    io?.to(room).emit(event, payload)
  } catch (err) {
    logger.warn({ msg: 'Realtime emit xatosi', event, err: (err as Error).message })
  }
}

export interface AttendanceMarkedEvent {
  attendanceId: string
  courseId:     string
  enrollmentId: string
  studentId:    string
  lessonDate:   string
  status:       string
  markedBy:     string
}

/** Davomat belgilandi — kurs xonasiga va o'sha talabaga */
export function emitAttendanceMarked(e: AttendanceMarkedEvent): void {
  emit(ROOM.course(e.courseId), 'attendance:marked', e)
  emit(ROOM.user(e.studentId),  'attendance:marked', e)
}

export interface SecurityAlertEvent {
  id:        string
  type:      string
  severity:  string
  layer:     string | null
  score:     number | null
  userId:    string | null
  createdAt: string
}

/**
 * Yangi xavfsizlik ogohlantirishi — FAQAT imtiyozli rollarga.
 * Ogohlantirish tegishli bo'lgan foydalanuvchiga yuborilmaydi: aniqlash
 * haqidagi xabar aynan kuzatilayotgan odamga borishi mantiqsiz.
 */
export function emitSecurityAlert(e: SecurityAlertEvent): void {
  for (const role of PRIVILEGED) emit(ROOM.role(role), 'security:alert', e)
}
