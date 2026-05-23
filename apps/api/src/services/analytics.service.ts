import { prisma } from '../config/prisma'
import type { UserRole } from '@prisma/client'

export const analyticsService = {
  async dashboard() {
    const [
      totalUsers,
      usersByRole,
      totalCourses,
      coursesByStatus,
      totalEnrollments,
      activeEnrollments,
      totalAttendance,
      avgAttendanceRate,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.groupBy({ by: ['role'], _count: { role: true } }),
      prisma.course.count(),
      prisma.course.groupBy({ by: ['status'], _count: { status: true } }),
      prisma.enrollment.count(),
      prisma.enrollment.count({ where: { status: 'ACTIVE' } }),
      prisma.attendance.count(),
      prisma.attendance.groupBy({ by: ['status'], _count: { status: true } }),
    ])

    const attendanceMap: Record<string, number> = {}
    for (const r of avgAttendanceRate) attendanceMap[r.status] = r._count.status

    const presentCount = (attendanceMap['PRESENT'] ?? 0) + (attendanceMap['LATE'] ?? 0)
    const attendanceRate = totalAttendance > 0 ? (presentCount / totalAttendance) * 100 : 0

    return {
      users: {
        total: totalUsers,
        byRole: Object.fromEntries(usersByRole.map(r => [r.role, r._count.role])),
      },
      courses: {
        total: totalCourses,
        byStatus: Object.fromEntries(coursesByStatus.map(r => [r.status, r._count.status])),
      },
      enrollments: { total: totalEnrollments, active: activeEnrollments },
      attendance: {
        total: totalAttendance,
        ...attendanceMap,
        rate: Math.round(attendanceRate * 100) / 100,
      },
    }
  },

  async courseStats(courseId: string, actorId: string, actorRole: UserRole) {
    const course = await prisma.course.findUnique({ where: { id: courseId } })
    if (!course) throw Object.assign(new Error('Kurs topilmadi'), { statusCode: 404 })

    if (actorRole === 'TEACHER' && course.teacherId !== actorId) {
      throw Object.assign(new Error("Ruxsat yo'q"), { statusCode: 403 })
    }

    const [enrollmentStats, attendanceStats, gradeStats] = await Promise.all([
      prisma.enrollment.groupBy({
        by: ['status'],
        where: { courseId },
        _count: { status: true },
      }),
      prisma.attendance.groupBy({
        by: ['status'],
        where: { enrollment: { courseId } },
        _count: { status: true },
      }),
      prisma.grade.aggregate({
        where: { enrollment: { courseId } },
        _avg: { score: true },
        _min: { score: true },
        _max: { score: true },
        _count: { score: true },
      }),
    ])

    const enrollMap = Object.fromEntries(enrollmentStats.map(r => [r.status, r._count.status]))
    const attendMap = Object.fromEntries(attendanceStats.map(r => [r.status, r._count.status]))

    const totalAttend = attendanceStats.reduce((s, r) => s + r._count.status, 0)
    const present = (attendMap['PRESENT'] ?? 0) + (attendMap['LATE'] ?? 0)

    return {
      courseId,
      enrollments:   enrollMap,
      attendance: {
        ...attendMap,
        total: totalAttend,
        rate: totalAttend > 0 ? Math.round((present / totalAttend) * 10000) / 100 : 0,
      },
      grades: {
        count: gradeStats._count.score,
        avg:   gradeStats._avg.score  ? Math.round(Number(gradeStats._avg.score)  * 100) / 100 : null,
        min:   gradeStats._min.score  ? Number(gradeStats._min.score)  : null,
        max:   gradeStats._max.score  ? Number(gradeStats._max.score)  : null,
      },
    }
  },

  async studentStats(studentId: string, actorId: string, actorRole: UserRole) {
    if (actorRole === 'STUDENT' && studentId !== actorId) {
      throw Object.assign(new Error("Ruxsat yo'q"), { statusCode: 403 })
    }

    const student = await prisma.user.findUnique({ where: { id: studentId }, select: { id: true, firstName: true, lastName: true, email: true, role: true } })
    if (!student || student.role !== 'STUDENT') {
      throw Object.assign(new Error("Talaba topilmadi"), { statusCode: 404 })
    }

    const enrollments = await prisma.enrollment.findMany({
      where: { studentId },
      include: {
        course: { select: { id: true, title: true, category: true } },
        attendance: { select: { status: true } },
        grades: { select: { score: true, assessment: { select: { maxScore: true, weight: true } } } },
      },
    })

    const perCourse = enrollments.map(en => {
      const attendTotal = en.attendance.length
      const present = en.attendance.filter(a => a.status === 'PRESENT' || a.status === 'LATE').length
      const attendRate = attendTotal > 0 ? Math.round((present / attendTotal) * 10000) / 100 : null

      let weightedScore = 0
      let totalWeight   = 0
      for (const g of en.grades) {
        const pct    = Number(g.score) / Number(g.assessment.maxScore)
        const weight = Number(g.assessment.weight)
        weightedScore += pct * weight
        totalWeight   += weight
      }
      const finalGrade = totalWeight > 0 ? Math.round((weightedScore / totalWeight) * 10000) / 100 : null

      const dropoutRisk = en.dropoutRiskScore ? Number(en.dropoutRiskScore) : null

      return {
        enrollmentId: en.id,
        course:       en.course,
        status:       en.status,
        attendanceRate: attendRate,
        finalGrade,
        dropoutRisk,
      }
    })

    return { student, courses: perCourse }
  },

  async attendanceReport(params: { courseId?: string; from?: string; to?: string }) {
    const where: any = {}
    if (params.courseId) where.enrollment = { courseId: params.courseId }
    if (params.from || params.to) {
      where.lessonDate = {}
      if (params.from) where.lessonDate.gte = new Date(params.from)
      if (params.to)   where.lessonDate.lte = new Date(params.to)
    }

    const byStatus = await prisma.attendance.groupBy({
      by: ['status'],
      where,
      _count: { status: true },
    })

    const byDate = await prisma.attendance.groupBy({
      by: ['lessonDate'],
      where,
      _count: { lessonDate: true },
      orderBy: { lessonDate: 'asc' },
    })

    return {
      summary: Object.fromEntries(byStatus.map(r => [r.status, r._count.status])),
      byDate:  byDate.map(r => ({ date: r.lessonDate, count: r._count.lessonDate })),
    }
  },
}
