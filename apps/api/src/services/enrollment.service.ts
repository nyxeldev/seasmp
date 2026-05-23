import { prisma } from '../config/prisma'
import { auditService } from './audit.service'
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
          course:  { select: { id: true, title: true, category: true } },
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
        course:  { select: { id: true, title: true, category: true, teacherId: true } },
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

    const course = await prisma.course.findUnique({ where: { id: courseId } })
    if (!course) throw Object.assign(new Error('Kurs topilmadi'), { statusCode: 404 })
    if (course.status !== 'ACTIVE') throw Object.assign(new Error("Kurs faol emas"), { statusCode: 400 })

    const enrollmentCount = await prisma.enrollment.count({ where: { courseId, status: 'ACTIVE' } })
    if (enrollmentCount >= course.maxStudents) {
      throw Object.assign(new Error("Kurs to'lgan"), { statusCode: 400 })
    }

    const existing = await prisma.enrollment.findUnique({ where: { studentId_courseId: { studentId, courseId } } })
    if (existing) throw Object.assign(new Error("Talaba bu kursga allaqachon yozilgan"), { statusCode: 409 })

    const enrollment = await prisma.enrollment.create({ data: { studentId, courseId } })

    await auditService.log({
      userId: actorId, action: 'ENROLL', resource: 'enrollments',
      resourceId: enrollment.id, newData: { studentId, courseId }, ipAddress,
    })

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
