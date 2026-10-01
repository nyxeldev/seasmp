import { prisma } from '../config/prisma'
import { auditService } from './audit.service'
import { notificationService } from './notification.service'
import type { EnrollmentStatus, UserRole } from '@prisma/client'

export const enrollmentService = {
  async list(params: {
    studentId?: string
    courseId?: string
    status?: EnrollmentStatus
    actorId: string
    actorRole: UserRole
    page: number
    limit: number
  }) {
    const { studentId, courseId, status, actorId, actorRole, page, limit } = params
    const skip = (page - 1) * limit

    const where: any = {}
    if (status) where.status = status

    if (actorRole === 'STUDENT') {
      where.studentId = actorId
    } else if (actorRole === 'TEACHER') {
      where.course = { teacherId: actorId }
      if (courseId) where.courseId = courseId
    } else {
      if (studentId) where.studentId = studentId
      if (courseId)  where.courseId  = courseId
    }

    const [enrollments, total] = await prisma.$transaction([
      prisma.enrollment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { enrolledAt: 'desc' },
        include: {
          student: { select: { id: true, firstName: true, lastName: true, email: true } },
          course:  { select: { id: true, slug: true, title: true, category: true } },
        },
      }),
      prisma.enrollment.count({ where }),
    ])

    return {
      data: enrollments,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    }
  },

  async findById(id: string, actorId: string, actorRole: UserRole) {
    const enrollment = await prisma.enrollment.findUnique({
      where: { id },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, email: true } },
        course:  { select: { id: true, slug: true, title: true, category: true, teacherId: true } },
        grades:  { include: { assessment: true } },
      },
    })
    if (!enrollment) throw Object.assign(new Error("Ro'yxatga olish topilmadi"), { statusCode: 404 })

    if (actorRole === 'STUDENT' && enrollment.studentId !== actorId) {
      throw Object.assign(new Error("Ruxsat yo'q"), { statusCode: 403 })
    }
    if (actorRole === 'TEACHER' && (enrollment.course as any).teacherId !== actorId) {
      throw Object.assign(new Error("Ruxsat yo'q"), { statusCode: 403 })
    }

    return enrollment
  },

  async enroll(studentId: string, courseId: string, actorId: string, actorRole: UserRole, ipAddress: string) {
    // Students can self-enroll; admins can enroll anyone
    if (actorRole === 'STUDENT' && studentId !== actorId) {
      throw Object.assign(new Error("Faqat o'zingizni ro'yxatdan o'tkaza olasiz"), { statusCode: 403 })
    }

    const student = await prisma.user.findUnique({ where: { id: studentId } })
    if (!student || student.role !== 'STUDENT') {
      throw Object.assign(new Error("Talaba topilmadi"), { statusCode: 404 })
    }

    // Tezkor, qulfsiz dastlabki tekshiruv: kurs umuman topilmasa, faol
    // bo'lmasa yoki talaba allaqachon yozilgan bo'lsa, qator qulfini
    // olishning hojati yo'q — bu holatlar tezlik bilan bog'liq emas.
    // Haqiqiy sig'im qarori pastda, qator qulflangan holda qabul qilinadi;
    // takroriy yozilish esa baribir DB'ning @@unique([studentId, courseId])
    // cheklovi bilan himoyalangan (global P2002 ishlovchisi — app.ts).
    const course = await prisma.course.findUnique({ where: { id: courseId } })
    if (!course) throw Object.assign(new Error('Kurs topilmadi'), { statusCode: 404 })
    if (course.status !== 'ACTIVE') throw Object.assign(new Error("Kurs faol emas"), { statusCode: 400 })

    const existing = await prisma.enrollment.findUnique({ where: { studentId_courseId: { studentId, courseId } } })
    if (existing) throw Object.assign(new Error("Talaba bu kursga allaqachon yozilgan"), { statusCode: 409 })

    // Sig'im (maxStudents) tekshiruvi ilgari oddiy "sana-solishtir-yoz" edi:
    // ikkita bir vaqtdagi so'rov ikkalasi ham eski sanoqni ko'rib, ikkalasi
    // ham sig'imdan oshib yozilishi mumkin edi — bu DB darajasida hech qanday
    // cheklov bilan himoyalanmagan (maxStudents uchun UNIQUE/CHECK yo'q,
    // chunki u statik qiymat emas, faol yozilishlar soni bilan solishtiriladi).
    //
    // Yechim: shu KURS qatorini `SELECT ... FOR UPDATE` bilan qulflash.
    // Qulf faqat shu tranzaksiya ichida va faqat shu bitta kurs qatorida —
    // boshqa kursga yozilish yoki shu kursni o'qish/ro'yxatlash bilan hech
    // qanday ziddiyatga kirmaydi. Qulf olingach sig'im YANGIDAN, haqiqiy
    // qatorlar asosida hisoblanadi, shuning uchun navbatdagi so'rov eskirgan
    // sanoqqa emas, qulf bo'shagandan keyingi haqiqiy holatga qaraydi.
    const enrollment = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string; maxStudents: number; status: string }[]>`
        SELECT id, max_students AS "maxStudents", status
        FROM courses
        WHERE id = ${courseId}::uuid
        FOR UPDATE
      `
      const lockedCourse = rows[0]
      if (!lockedCourse) throw Object.assign(new Error('Kurs topilmadi'), { statusCode: 404 })
      if (lockedCourse.status !== 'ACTIVE') throw Object.assign(new Error("Kurs faol emas"), { statusCode: 400 })

      const activeCount = await tx.enrollment.count({ where: { courseId, status: 'ACTIVE' } })
      if (activeCount >= lockedCourse.maxStudents) {
        throw Object.assign(new Error("Kurs to'lgan"), { statusCode: 400 })
      }

      return tx.enrollment.create({ data: { studentId, courseId } })
    })

    await auditService.log({
      userId: actorId, action: 'ENROLL', resource: 'enrollments',
      resourceId: enrollment.id, newData: { studentId, courseId }, ipAddress,
    })

    // Ikki tomonga xabar: talabaga yozilgani, o'qituvchiga yangi talaba.
    // Amalni o'zi bajargan odamga xabar bormaydi — talaba o'zini yozsa,
    // faqat o'qituvchi xabar oladi.
    const courseLink = `/courses/${course.slug ?? course.id}`
    const recipients = []
    if (studentId !== actorId) {
      recipients.push({
        userId: studentId,
        type:   'ENROLLED' as const,
        title:  `Kursga yozildingiz: ${course.title}`,
        link:   courseLink,
        data:   { enrollmentId: enrollment.id, courseId },
      })
    }
    if (course.teacherId !== actorId) {
      recipients.push({
        userId: course.teacherId,
        type:   'ENROLLED' as const,
        title:  `Kursingizga yangi talaba: ${course.title}`,
        body:   `${student.firstName} ${student.lastName}`,
        link:   courseLink,
        data:   { enrollmentId: enrollment.id, studentId, courseId },
      })
    }
    await notificationService.createMany(recipients)

    return enrollment
  },

  async changeStatus(
    id: string,
    status: EnrollmentStatus,
    actorId: string,
    actorRole: UserRole,
    ipAddress: string
  ) {
    const enrollment = await prisma.enrollment.findUnique({
      where: { id },
      include: { course: { select: { teacherId: true } } },
    })
    if (!enrollment) throw Object.assign(new Error("Ro'yxatga olish topilmadi"), { statusCode: 404 })

    if (actorRole === 'STUDENT') {
      if (enrollment.studentId !== actorId) throw Object.assign(new Error("Ruxsat yo'q"), { statusCode: 403 })
      if (status !== 'DROPPED') throw Object.assign(new Error("Talaba faqat kursdan chiqishi mumkin"), { statusCode: 403 })
    }
    if (actorRole === 'TEACHER' && enrollment.course.teacherId !== actorId) {
      throw Object.assign(new Error("Ruxsat yo'q"), { statusCode: 403 })
    }

    const updated = await prisma.enrollment.update({ where: { id }, data: { status } })

    await auditService.log({
      userId: actorId,
      action: status === 'DROPPED' ? 'UNENROLL' : 'UPDATE',
      resource: 'enrollments', resourceId: id,
      oldData: { status: enrollment.status }, newData: { status }, ipAddress,
    })

    return updated
  },
}
