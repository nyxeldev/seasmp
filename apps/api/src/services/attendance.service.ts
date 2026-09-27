import * as crypto from 'crypto'
import * as QRCode from 'qrcode'
import { prisma } from '../config/prisma'
import { redis } from '../config/redis'
import { auditService } from './audit.service'
import { emitAttendanceMarked } from '../realtime/gateway'
import type { AttendanceStatus, UserRole } from '@prisma/client'

const QR_TTL_SECONDS = 300 // QR token 5 daqiqa amal qiladi

export const attendanceService = {
  async list(params: {
    enrollmentId?: string
    courseId?: string
    lessonDate?: string
    actorId: string
    actorRole: UserRole
    page: number
    limit: number
  }) {
    const { enrollmentId, courseId, lessonDate, actorId, actorRole, page, limit } = params
    const skip = (page - 1) * limit

    const where: any = {}
    if (enrollmentId) where.enrollmentId = enrollmentId
    if (lessonDate)   where.lessonDate   = new Date(lessonDate)

    if (actorRole === 'STUDENT') {
      where.enrollment = { studentId: actorId }
    } else if (actorRole === 'TEACHER') {
      where.enrollment = { course: { teacherId: actorId } }
      if (courseId) where.enrollment.courseId = courseId
    } else {
      if (courseId) where.enrollment = { courseId }
    }

    const [records, total] = await prisma.$transaction([
      prisma.attendance.findMany({
        where,
        skip,
        take: limit,
        orderBy: { lessonDate: 'desc' },
        include: {
          enrollment: {
            include: {
              student: { select: { id: true, firstName: true, lastName: true } },
              course:  { select: { id: true, title: true } },
            },
          },
        },
      }),
      prisma.attendance.count({ where }),
    ])

    return {
      data: records,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    }
  },

  async mark(
    data: {
      enrollmentId: string
      lessonDate: string
      status: AttendanceStatus
      ipAddress?: string
    },
    actorId: string,
    actorRole: UserRole,
    ipAddress: string
  ) {
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: data.enrollmentId },
      include: { course: { select: { teacherId: true } } },
    })
    if (!enrollment) throw Object.assign(new Error("Ro'yxatga olish topilmadi"), { statusCode: 404 })
    if (enrollment.status !== 'ACTIVE') throw Object.assign(new Error("Talaba bu kursda faol emas"), { statusCode: 400 })

    if (actorRole === 'TEACHER' && enrollment.course.teacherId !== actorId) {
      throw Object.assign(new Error("Bu kurs uchun davomat belgilash ruxsati yo'q"), { statusCode: 403 })
    }

    const existing = await prisma.attendance.findUnique({
      where: { enrollmentId_lessonDate: { enrollmentId: data.enrollmentId, lessonDate: new Date(data.lessonDate) } },
    })
    if (existing) throw Object.assign(new Error("Bu kun uchun davomat allaqachon belgilangan"), { statusCode: 409 })

    const record = await prisma.attendance.create({
      data: {
        enrollmentId: data.enrollmentId,
        lessonDate:   new Date(data.lessonDate),
        status:       data.status,
        markedBy:     actorId,
        ipAddress:    data.ipAddress ?? ipAddress,
      },
    })

    await auditService.log({
      userId: actorId, action: 'ATTENDANCE_MARK', resource: 'attendance',
      resourceId: record.id,
      newData: { enrollmentId: data.enrollmentId, lessonDate: data.lessonDate, status: data.status },
      ipAddress,
    })

    emitAttendanceMarked({
      attendanceId: record.id,
      courseId:     enrollment.courseId,
      enrollmentId: data.enrollmentId,
      studentId:    enrollment.studentId,
      lessonDate:   data.lessonDate,
      status:       data.status,
      markedBy:     actorId,
    })

    return record
  },

  /**
   * Bir kursning bitta darsi uchun butun guruh davomatini bir marta yozadi.
   *
   * Nega kerak: `mark()` bitta talabani belgilaydi va allaqachon belgilangan
   * bo'lsa 409 qaytaradi. Amalda o'qituvchi darsdan keyin butun guruhni bir
   * o'tirishda belgilaydi va xatosini darhol tuzatadi — bittalab yozishda
   * 30 kishilik guruh uchun 30 ta so'rov va tuzatishning iloji yo'q.
   *
   * Shuning uchun bu yerda upsert ishlatiladi: qayta yuborish holatni
   * yangilaydi, xato bermaydi.
   */
  async markBulk(
    data: {
      courseId:   string
      lessonDate: string
      records:    { enrollmentId: string; status: AttendanceStatus }[]
    },
    actorId: string,
    actorRole: UserRole,
    ipAddress: string
  ) {
    const course = await prisma.course.findUnique({
      where: { id: data.courseId },
      select: { id: true, teacherId: true },
    })
    if (!course) throw Object.assign(new Error('Kurs topilmadi'), { statusCode: 404 })
    if (actorRole === 'TEACHER' && course.teacherId !== actorId) {
      throw Object.assign(new Error("Bu kurs uchun davomat belgilash ruxsati yo'q"), { statusCode: 403 })
    }

    // Har bir yozuv HAQIQATAN shu kursga tegishli ekanini tekshiramiz — aks holda
    // o'qituvchi o'z kursi nomi bilan begona guruh davomatini yozib yuborishi mumkin.
    const enrollmentIds = data.records.map((r) => r.enrollmentId)
    const valid = await prisma.enrollment.findMany({
      where: { id: { in: enrollmentIds }, courseId: data.courseId, status: 'ACTIVE' },
      select: { id: true },
    })
    const validIds = new Set(valid.map((e) => e.id))

    const rejected = enrollmentIds.filter((id) => !validIds.has(id))
    if (rejected.length > 0) {
      throw Object.assign(
        new Error(`${rejected.length} ta yozuv bu kursga tegishli emas yoki talaba faol emas`),
        { statusCode: 400 },
      )
    }

    const lessonDate = new Date(data.lessonDate)

    const saved = await prisma.$transaction(
      data.records.map((r) =>
        prisma.attendance.upsert({
          where:  { enrollmentId_lessonDate: { enrollmentId: r.enrollmentId, lessonDate } },
          create: {
            enrollmentId: r.enrollmentId,
            lessonDate,
            status:       r.status,
            markedBy:     actorId,
            ipAddress,
          },
          update: { status: r.status, markedBy: actorId, markedAt: new Date() },
        }),
      ),
    )

    await auditService.log({
      userId: actorId, action: 'ATTENDANCE_MARK', resource: 'attendance',
      resourceId: data.courseId,
      newData: { courseId: data.courseId, lessonDate: data.lessonDate, count: saved.length },
      ipAddress,
    })

    return { saved: saved.length, lessonDate: data.lessonDate }
  },

  async generateQrToken(courseId: string, lessonDate: string, actorId: string, actorRole: string): Promise<{ token: string; qrCodeUrl: string; expiresIn: number }> {
    const course = await prisma.course.findUnique({ where: { id: courseId } })
    if (!course) throw Object.assign(new Error('Kurs topilmadi'), { statusCode: 404 })
    if (actorRole === 'TEACHER' && course.teacherId !== actorId) throw Object.assign(new Error("Ruxsat yo'q"), { statusCode: 403 })

    const token = crypto.randomBytes(32).toString('hex')
    await redis.setex(`qr_attendance:${token}`, QR_TTL_SECONDS, JSON.stringify({ courseId, lessonDate }))

    const qrCodeUrl = await QRCode.toDataURL(token, { errorCorrectionLevel: 'M', width: 300 })

    return { token, qrCodeUrl, expiresIn: QR_TTL_SECONDS }
  },

  async markByQr(token: string, actorId: string, ipAddress: string) {
    const raw = await redis.get(`qr_attendance:${token}`)
    if (!raw) throw Object.assign(new Error("QR token yaroqsiz yoki muddati tugagan"), { statusCode: 400 })

    const { courseId, lessonDate } = JSON.parse(raw) as { courseId: string; lessonDate: string }

    const enrollment = await prisma.enrollment.findFirst({
      where: { courseId, studentId: actorId, status: 'ACTIVE' },
    })
    if (!enrollment) throw Object.assign(new Error("Bu kursga yozilmagansiz"), { statusCode: 403 })

    const existing = await prisma.attendance.findUnique({
      where: { enrollmentId_lessonDate: { enrollmentId: enrollment.id, lessonDate: new Date(lessonDate) } },
    })
    if (existing) throw Object.assign(new Error("Davomat allaqachon belgilangan"), { statusCode: 409 })

    const record = await prisma.attendance.create({
      data: {
        enrollmentId: enrollment.id,
        lessonDate:   new Date(lessonDate),
        status:       'PRESENT',
        markedBy:     actorId,
        qrToken:      token,
        ipAddress,
      },
    })

    await redis.del(`qr_attendance:${token}`)

    emitAttendanceMarked({
      attendanceId: record.id,
      courseId,
      enrollmentId: enrollment.id,
      studentId:    actorId,
      lessonDate,
      status:       'PRESENT',
      markedBy:     actorId,
    })

    return record
  },

  async getStats(enrollmentId: string, actorId: string, actorRole: UserRole) {
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { course: { select: { teacherId: true } } },
    })
    if (!enrollment) throw Object.assign(new Error("Ro'yxatga olish topilmadi"), { statusCode: 404 })

    if (actorRole === 'STUDENT' && enrollment.studentId !== actorId) {
      throw Object.assign(new Error("Ruxsat yo'q"), { statusCode: 403 })
    }
    if (actorRole === 'TEACHER' && enrollment.course.teacherId !== actorId) {
      throw Object.assign(new Error("Ruxsat yo'q"), { statusCode: 403 })
    }

    const records = await prisma.attendance.groupBy({
      by: ['status'],
      where: { enrollmentId },
      _count: { status: true },
    })

    const stats: Record<string, number> = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 }
    for (const r of records) stats[r.status] = r._count.status

    const total = Object.values(stats).reduce((a, b) => a + b, 0)
    const attendanceRate = total > 0 ? ((stats.PRESENT + stats.LATE) / total) * 100 : 0

    return { ...stats, total, attendanceRate: Math.round(attendanceRate * 100) / 100 }
  },
}
