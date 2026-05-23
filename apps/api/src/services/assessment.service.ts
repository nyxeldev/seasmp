import { prisma } from '../config/prisma'
import { auditService } from './audit.service'
import type { AssessmentType, UserRole } from '@prisma/client'

export const assessmentService = {
  // ─── Assessments ─────────────────────────────────────────────────────────────

  async listByCourse(courseId: string, actorId: string, actorRole: UserRole) {
    const course = await prisma.course.findUnique({ where: { id: courseId } })
    if (!course) throw Object.assign(new Error('Kurs topilmadi'), { statusCode: 404 })

    if (actorRole === 'TEACHER' && course.teacherId !== actorId) {
      throw Object.assign(new Error("Ruxsat yo'q"), { statusCode: 403 })
    }
    if (actorRole === 'STUDENT') {
      const enrollment = await prisma.enrollment.findFirst({ where: { courseId, studentId: actorId, status: 'ACTIVE' } })
      if (!enrollment) throw Object.assign(new Error("Bu kursga yozilmagansiz"), { statusCode: 403 })
    }

    return prisma.assessment.findMany({
      where: { courseId },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { grades: true } } },
    })
  },

  async create(
    data: { courseId: string; title: string; type: AssessmentType; maxScore?: number; weight?: number; dueDate?: string },
    actorId: string,
    actorRole: UserRole,
    ipAddress: string
  ) {
    const course = await prisma.course.findUnique({ where: { id: data.courseId } })
    if (!course) throw Object.assign(new Error('Kurs topilmadi'), { statusCode: 404 })

    if (actorRole === 'TEACHER' && course.teacherId !== actorId) {
      throw Object.assign(new Error("Ruxsat yo'q"), { statusCode: 403 })
    }

    const assessment = await prisma.assessment.create({
      data: {
        courseId:  data.courseId,
        title:     data.title,
        type:      data.type,
        maxScore:  data.maxScore ?? 100,
        weight:    data.weight ?? 0.1,
        dueDate:   data.dueDate ? new Date(data.dueDate) : undefined,
      },
    })

    await auditService.log({
      userId: actorId, action: 'CREATE', resource: 'assessments',
      resourceId: assessment.id, newData: { title: assessment.title, courseId: data.courseId }, ipAddress,
    })

    return assessment
  },

  async update(
    id: string,
    data: { title?: string; maxScore?: number; weight?: number; dueDate?: string | null },
    actorId: string,
    actorRole: UserRole,
    ipAddress: string
  ) {
    const assessment = await prisma.assessment.findUnique({ where: { id }, include: { course: true } })
    if (!assessment) throw Object.assign(new Error("Baholash topilmadi"), { statusCode: 404 })

    if (actorRole === 'TEACHER' && assessment.course.teacherId !== actorId) {
      throw Object.assign(new Error("Ruxsat yo'q"), { statusCode: 403 })
    }

    const updated = await prisma.assessment.update({
      where: { id },
      data: {
        title:    data.title,
        maxScore: data.maxScore,
        weight:   data.weight,
        dueDate:  data.dueDate === null ? null : data.dueDate ? new Date(data.dueDate) : undefined,
      },
    })

    await auditService.log({
      userId: actorId, action: 'UPDATE', resource: 'assessments', resourceId: id,
      oldData: { title: assessment.title }, newData: data, ipAddress,
    })

    return updated
  },

  async delete(id: string, actorId: string, actorRole: UserRole, ipAddress: string) {
    const assessment = await prisma.assessment.findUnique({ where: { id }, include: { course: true } })
    if (!assessment) throw Object.assign(new Error("Baholash topilmadi"), { statusCode: 404 })

    if (actorRole === 'TEACHER' && assessment.course.teacherId !== actorId) {
      throw Object.assign(new Error("Ruxsat yo'q"), { statusCode: 403 })
    }

    await prisma.assessment.delete({ where: { id } })

    await auditService.log({
      userId: actorId, action: 'DELETE', resource: 'assessments', resourceId: id,
      oldData: { title: assessment.title }, ipAddress,
    })
  },

  // ─── Grades ──────────────────────────────────────────────────────────────────

  async listGrades(assessmentId: string, actorId: string, actorRole: UserRole) {
    const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId }, include: { course: true } })
    if (!assessment) throw Object.assign(new Error("Baholash topilmadi"), { statusCode: 404 })

    if (actorRole === 'TEACHER' && assessment.course.teacherId !== actorId) {
      throw Object.assign(new Error("Ruxsat yo'q"), { statusCode: 403 })
    }
    if (actorRole === 'STUDENT') {
      // Students see only their own grade
      const enrollment = await prisma.enrollment.findFirst({
        where: { courseId: assessment.courseId, studentId: actorId },
      })
      if (!enrollment) throw Object.assign(new Error("Bu kursga yozilmagansiz"), { statusCode: 403 })

      return prisma.grade.findMany({
        where: { assessmentId, enrollmentId: enrollment.id },
        include: { gradedUser: { select: { id: true, firstName: true, lastName: true } } },
      })
    }

    return prisma.grade.findMany({
      where: { assessmentId },
      include: {
        enrollment: { include: { student: { select: { id: true, firstName: true, lastName: true } } } },
        gradedUser: { select: { id: true, firstName: true, lastName: true } },
      },
    })
  },

  async gradesByEnrollment(enrollmentId: string, actorId: string, actorRole: UserRole) {
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

    return prisma.grade.findMany({
      where: { enrollmentId },
      include: {
        assessment: true,
        gradedUser: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { gradedAt: 'desc' },
    })
  },

  async submitGrade(
    data: { assessmentId: string; enrollmentId: string; score: number; feedback?: string },
    actorId: string,
    actorRole: UserRole,
    ipAddress: string
  ) {
    const assessment = await prisma.assessment.findUnique({ where: { id: data.assessmentId }, include: { course: true } })
    if (!assessment) throw Object.assign(new Error("Baholash topilmadi"), { statusCode: 404 })

    if (actorRole === 'TEACHER' && assessment.course.teacherId !== actorId) {
      throw Object.assign(new Error("Ruxsat yo'q"), { statusCode: 403 })
    }

    if (data.score < 0 || data.score > Number(assessment.maxScore)) {
      throw Object.assign(new Error(`Ball 0 dan ${assessment.maxScore} gacha bo'lishi kerak`), { statusCode: 400 })
    }

    const enrollment = await prisma.enrollment.findUnique({ where: { id: data.enrollmentId } })
    if (!enrollment) throw Object.assign(new Error("Ro'yxatga olish topilmadi"), { statusCode: 404 })

    const grade = await prisma.grade.upsert({
      where: { assessmentId_enrollmentId: { assessmentId: data.assessmentId, enrollmentId: data.enrollmentId } },
      create: { assessmentId: data.assessmentId, enrollmentId: data.enrollmentId, score: data.score, feedback: data.feedback, gradedBy: actorId },
      update: { score: data.score, feedback: data.feedback, gradedBy: actorId },
    })

    await auditService.log({
      userId: actorId, action: 'GRADE_SUBMIT', resource: 'grades',
      resourceId: grade.id, newData: { score: data.score, enrollmentId: data.enrollmentId }, ipAddress,
    })

    return grade
  },
}
