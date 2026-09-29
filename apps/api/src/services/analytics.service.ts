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

  /**
   * Bosh sahifa va Analitika sahifasi uchun umumiy ko'rsatkichlar.
   *
   * Nega alohida metod: bu ikki sahifa ilgari qattiq yozilgan massivlarni
   * chizardi (247 o'quvchi, 94% davomat, "Aliyev Jasur — 87% xavf") — bazada
   * esa bunday ma'lumot yo'q edi. Endi hamma raqam shu yerdan, haqiqiy
   * jadvallardan keladi.
   *
   * Hammasi bitta chaqiruvda qaytariladi: sahifa beshta so'rov yubormasin.
   */
  async overview(params: { days?: number } = {}) {
    const days = Math.min(Math.max(params.days ?? 30, 1), 365)
    const since = new Date()
    since.setDate(since.getDate() - days)
    since.setHours(0, 0, 0, 0)

    const [students, activeCourses, attendanceRows, grades, riskRows] = await Promise.all([
      prisma.user.count({ where: { role: 'STUDENT', isActive: true } }),
      prisma.course.count({ where: { status: 'ACTIVE' } }),
      prisma.attendance.findMany({
        where:  { lessonDate: { gte: since } },
        select: { lessonDate: true, status: true },
        orderBy: { lessonDate: 'asc' },
      }),
      prisma.grade.findMany({
        select: { score: true, assessment: { select: { type: true, maxScore: true } } },
      }),
      prisma.enrollment.findMany({
        where:  { dropoutRiskScore: { not: null }, status: 'ACTIVE' },
        select: {
          id: true,
          dropoutRiskScore: true,
          student: { select: { id: true, firstName: true, lastName: true } },
          course:  { select: { id: true, slug: true, title: true } },
        },
        orderBy: { dropoutRiskScore: 'desc' },
        take: 10,
      }),
    ])

    // ── Kunlik davomat foizi ────────────────────────────────────────────────
    const perDay = new Map<string, { present: number; total: number }>()
    for (const r of attendanceRows) {
      const key = r.lessonDate.toISOString().slice(0, 10)
      const cell = perDay.get(key) ?? { present: 0, total: 0 }
      cell.total += 1
      if (r.status === 'PRESENT' || r.status === 'LATE') cell.present += 1
      perDay.set(key, cell)
    }
    const attendanceTrend = [...perDay.entries()].map(([date, c]) => ({
      date,
      rate:  Math.round((c.present / c.total) * 1000) / 10,
      total: c.total,
    }))

    const rateOf = (rows: { status: string }[]) =>
      rows.length > 0
        ? Math.round(
            (rows.filter(r => r.status === 'PRESENT' || r.status === 'LATE').length / rows.length) * 1000,
          ) / 10
        : null

    const attendanceRate = rateOf(attendanceRows)

    // Oldingi shuncha kunlik oyna — KPI kartasidagi o'zgarish uchun. Boshqa
    // ko'rsatkichlar (talaba soni kabi) uchun tarixiy suratlar saqlanmaydi,
    // shuning uchun ularga o'zgarish ko'rsatilmaydi.
    const prevFrom = new Date(since)
    prevFrom.setDate(prevFrom.getDate() - days)
    const prevRows = await prisma.attendance.findMany({
      where:  { lessonDate: { gte: prevFrom, lt: since } },
      select: { status: true },
    })
    const prevRate = rateOf(prevRows)
    const attendanceDelta = attendanceRate !== null && prevRate !== null
      ? Math.round((attendanceRate - prevRate) * 10) / 10
      : null

    // ── Baholar: foizga keltirib o'rtachalash ───────────────────────────────
    // Turli topshiriqlarning maxScore'i har xil, shuning uchun xom ball emas,
    // foiz o'rtachalanadi.
    const pct = (score: unknown, max: unknown) => (Number(score) / Number(max)) * 100
    const avgGrade = grades.length > 0
      ? Math.round(
          (grades.reduce((s, g) => s + pct(g.score, g.assessment.maxScore), 0) / grades.length) * 10,
        ) / 10
      : null

    const byType = new Map<string, { sum: number; n: number }>()
    for (const g of grades) {
      const cell = byType.get(g.assessment.type) ?? { sum: 0, n: 0 }
      cell.sum += pct(g.score, g.assessment.maxScore)
      cell.n += 1
      byType.set(g.assessment.type, cell)
    }
    const gradesByType = [...byType.entries()].map(([type, c]) => ({
      type, avg: Math.round((c.sum / c.n) * 10) / 10, count: c.n,
    }))

    // ── Qoldirish xavfi ─────────────────────────────────────────────────────
    const HIGH_RISK = 0.7
    const risk = riskRows.map(r => ({
      enrollmentId: r.id,
      score:        Number(r.dropoutRiskScore),
      studentId:    r.student.id,
      studentName:  `${r.student.firstName} ${r.student.lastName}`,
      courseId:     r.course.id,
      courseSlug:   r.course.slug,
      courseTitle:  r.course.title,
    }))
    const [highRisk, riskAgg] = await Promise.all([
      prisma.enrollment.count({
        where: { status: 'ACTIVE', dropoutRiskScore: { gte: HIGH_RISK } },
      }),
      // Barcha ro'yxatga olishlar bo'yicha. `risk` massivi eng yuqori 10 tani
      // saqlaydi — undan o'rtacha olinsa, ko'rsatkich butun guruhniki emas,
      // eng yomonlarniki bo'lib chiqadi (88% kabi).
      prisma.enrollment.aggregate({
        where: { status: 'ACTIVE', dropoutRiskScore: { not: null } },
        _avg:  { dropoutRiskScore: true },
      }),
    ])
    const avgRisk = riskAgg._avg.dropoutRiskScore !== null
      ? Math.round(Number(riskAgg._avg.dropoutRiskScore) * 1000) / 10
      : null

    return {
      windowDays: days,
      students,
      activeCourses,
      attendanceRate,
      attendanceDelta,
      attendanceTrend,
      avgGrade,
      gradesByType,
      highRisk,
      avgRisk,
      topRisk: risk.slice(0, 5),
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
        course: { select: { id: true, slug: true, title: true, category: true } },
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
