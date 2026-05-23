import { prisma } from '../config/prisma'
import { auditService } from './audit.service'
import type { CourseStatus, UserRole } from '@prisma/client'

export const courseService = {
  async list(params: {
    status?: CourseStatus
    teacherId?: string
    category?: string
    page: number
    limit: number
    search?: string
  }) {
    const { status, teacherId, category, page, limit, search } = params
    const skip = (page - 1) * limit

    const where: any = {}
    if (status)    where.status    = status
    if (teacherId) where.teacherId = teacherId
    if (category)  where.category  = category
    if (search)    where.title     = { contains: search, mode: 'insensitive' }

    const [courses, total] = await prisma.$transaction([
      prisma.course.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          teacher: { select: { id: true, firstName: true, lastName: true, email: true } },
          _count:  { select: { enrollments: true } },
        },
      }),
      prisma.course.count({ where }),
    ])

    return {
      data: courses,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    }
  },

  async findById(id: string) {
    const course = await prisma.course.findUnique({
      where: { id },
      include: {
        teacher:     { select: { id: true, firstName: true, lastName: true, email: true } },
        assessments: true,
        _count:      { select: { enrollments: true } },
      },
    })
    if (!course) throw Object.assign(new Error('Kurs topilmadi'), { statusCode: 404 })
    return course
  },

  async create(
    data: {
      title: string
      description?: string
      teacherId: string
      category: string
      price?: number
      durationWeeks: number
      maxStudents?: number
      schedule?: object
    },
    actorId: string,
    actorRole: UserRole,
    ipAddress: string
  ) {
    // Only ADMIN/SUPER_ADMIN can assign any teacher; TEACHER can only create for themselves
    if (actorRole === 'TEACHER' && data.teacherId !== actorId) {
      throw Object.assign(new Error("O'qituvchi faqat o'z nomiga kurs yarata oladi"), { statusCode: 403 })
    }

    const teacher = await prisma.user.findUnique({ where: { id: data.teacherId } })
    if (!teacher || teacher.role !== 'TEACHER') {
      throw Object.assign(new Error("O'qituvchi topilmadi"), { statusCode: 404 })
    }

    const course = await prisma.course.create({
      data: {
        title:         data.title,
        description:   data.description,
        teacherId:     data.teacherId,
        category:      data.category,
        price:         data.price ?? 0,
        durationWeeks: data.durationWeeks,
        maxStudents:   data.maxStudents ?? 30,
        schedule:      data.schedule as any,
      },
    })

    await auditService.log({
      userId: actorId, action: 'CREATE', resource: 'courses',
      resourceId: course.id, newData: { title: course.title }, ipAddress,
    })

    return course
  },

  async update(
    id: string,
    data: {
      title?: string
      description?: string
      category?: string
      price?: number
      durationWeeks?: number
      maxStudents?: number
      schedule?: object
    },
    actorId: string,
    actorRole: UserRole,
    ipAddress: string
  ) {
    const course = await prisma.course.findUnique({ where: { id } })
    if (!course) throw Object.assign(new Error('Kurs topilmadi'), { statusCode: 404 })

    if (actorRole === 'TEACHER' && course.teacherId !== actorId) {
      throw Object.assign(new Error("Bu kursni tahrirlash uchun ruxsat yo'q"), { statusCode: 403 })
    }

    const updated = await prisma.course.update({ where: { id }, data: data as any })

    await auditService.log({
      userId: actorId, action: 'UPDATE', resource: 'courses',
      resourceId: id, oldData: { title: course.title }, newData: data, ipAddress,
    })

    return updated
  },

  async changeStatus(id: string, status: CourseStatus, actorId: string, actorRole: UserRole, ipAddress: string) {
    const course = await prisma.course.findUnique({ where: { id } })
    if (!course) throw Object.assign(new Error('Kurs topilmadi'), { statusCode: 404 })

    if (actorRole === 'TEACHER' && course.teacherId !== actorId) {
      throw Object.assign(new Error("Bu kursni boshqarish uchun ruxsat yo'q"), { statusCode: 403 })
    }

    const updated = await prisma.course.update({ where: { id }, data: { status } })

    await auditService.log({
      userId: actorId, action: 'UPDATE', resource: 'courses',
      resourceId: id, oldData: { status: course.status }, newData: { status }, ipAddress,
    })

    return updated
  },

  async delete(id: string, actorId: string, ipAddress: string) {
    const course = await prisma.course.findUnique({ where: { id } })
    if (!course) throw Object.assign(new Error('Kurs topilmadi'), { statusCode: 404 })

    await prisma.course.update({ where: { id }, data: { status: 'ARCHIVED' } })

    await auditService.log({
      userId: actorId, action: 'DELETE', resource: 'courses',
      resourceId: id, oldData: { title: course.title }, ipAddress,
    })
  },
}
