/**
 * Bosqich B — egalik munosabatlarini avtomatik chiqarish.
 *
 * Ikki qism ham bazasiz, to'liq sintetik ma'lumot bilan sinaladi:
 *   - discoverCandidatePaths haqiqiy Prisma DMMF ustida ishlaydi (bazaga
 *     ulanish shart emas, sxema statik)
 *   - aggregateCandidateScores sof funksiya — qo'lda tuzilgan hodisa va
 *     qator ro'yxati bilan sinaladi
 */
import { jest } from '@jest/globals'

const mockAuditLogFindMany = jest.fn<() => Promise<any[]>>()
const mockOwnershipRuleFindMany = jest.fn<() => Promise<any[]>>()
const mockCourseFindMany = jest.fn<() => Promise<any[]>>()

jest.mock('../../config/prisma', () => ({
  prisma: {
    auditLog: { findMany: mockAuditLogFindMany },
    ownershipRule: { findMany: mockOwnershipRuleFindMany },
    course: { findMany: mockCourseFindMany },
  },
}))

import { discoverCandidatePaths, scoreResourceType, DEFAULT_LOOKBACK_DAYS, DEFAULT_MAX_EVENTS } from '../../services/ownershipInference'
import { aggregateCandidateScores } from '../../services/ownershipPaths'

describe('discoverCandidatePaths — sxemadan nomzod yo\'llarni topish', () => {
  it('Enrollment: to\'g\'ridan-to\'g\'ri va bitta oraliq orqali User\'ga olib boradigan yo\'llarni topadi', () => {
    const paths = discoverCandidatePaths('Enrollment').map((p) => p.path)
    expect(paths).toContain('studentId')
    expect(paths).toContain('course.teacherId')
  })

  it('studentId — 1 segment, course.teacherId — 2 segment', () => {
    const paths = discoverCandidatePaths('Enrollment')
    expect(paths.find((p) => p.path === 'studentId')?.segments).toBe(1)
    expect(paths.find((p) => p.path === 'course.teacherId')?.segments).toBe(2)
  })

  it('Grade: ikki xil yo\'l orqali ham o\'qituvchiga yetib boradi (enrollment va assessment orqali)', () => {
    const paths = discoverCandidatePaths('Grade').map((p) => p.path)
    expect(paths).toContain('gradedBy')
    expect(paths).toContain('enrollment.studentId')
    expect(paths).toContain('enrollment.course.teacherId')
    expect(paths).toContain('assessment.course.teacherId')
  })

  it('Attendance: markedBy va enrollment orqali ikkita yo\'l', () => {
    const paths = discoverCandidatePaths('Attendance').map((p) => p.path)
    expect(paths).toContain('markedBy')
    expect(paths).toContain('enrollment.studentId')
    expect(paths).toContain('enrollment.course.teacherId')
  })

  it('maxSegments chegarasidan uzun yo\'l qaytarilmaydi', () => {
    const paths = discoverCandidatePaths('Grade', 1)
    // enrollment.studentId 2 segment — 1 segmentli chegarada chiqmasligi kerak
    expect(paths.every((p) => p.segments <= 1)).toBe(true)
    expect(paths.map((p) => p.path)).toContain('gradedBy') // 1 segmentli hali bor
  })

  it('takrorlanuvchi yo\'l yo\'q (bir xil User\'ga ikki xil yo\'ldan yetib borilsa ham, natijada dublikat bo\'lmaydi)', () => {
    const paths = discoverCandidatePaths('Grade').map((p) => p.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('tsiklik bog\'lanishda abadiy aylanib qolmaydi (User orqaga User.enrollments bilan qaytadi)', () => {
    // Agar tsikl himoyasi ishlamasa, bu chaqiruv to'xtamaydi — test vaqt
    // tugashi bilan muvaffaqiyatsiz bo'ladi.
    const paths = discoverCandidatePaths('User')
    expect(Array.isArray(paths)).toBe(true)
  })

  it('mavjud bo\'lmagan model uchun bo\'sh ro\'yxat qaytaradi', () => {
    expect(discoverCandidatePaths('NoSuchModel')).toEqual([])
  })
})

describe('aggregateCandidateScores — sof ishonch hisob-kitobi', () => {
  const candidates = [
    { path: 'studentId', segments: 1 },
    { path: 'course.teacherId', segments: 2 },
  ]

  it('to\'liq mos kelgan yo\'l uchun ishonch = 1.0', () => {
    const rowById = new Map([
      ['r1', { studentId: 'student-A', course: { teacherId: 'teacher-X' } }],
      ['r2', { studentId: 'student-B', course: { teacherId: 'teacher-X' } }],
    ])
    const events = [
      { resourceId: 'r1', userId: 'student-A', role: 'STUDENT' },
      { resourceId: 'r2', userId: 'student-B', role: 'STUDENT' },
    ]
    const scores = aggregateCandidateScores(candidates, events, rowById, 1)
    const studentIdScore = scores.find((s) => s.path === 'studentId')!
    expect(studentIdScore.confidence).toBe(1)
    expect(studentIdScore.matches).toBe(2)
    expect(studentIdScore.total).toBe(2)
  })

  it('hech mos kelmagan yo\'l uchun ishonch = 0', () => {
    const rowById = new Map([
      ['r1', { studentId: 'student-A', course: { teacherId: 'teacher-X' } }],
    ])
    const events = [{ resourceId: 'r1', userId: 'student-A', role: 'STUDENT' }]
    const scores = aggregateCandidateScores(candidates, events, rowById, 1)
    const teacherScore = scores.find((s) => s.path === 'course.teacherId')!
    expect(teacherScore.confidence).toBe(0)
  })

  it('ARALASH ROL MUAMMOSI: umumiy ishonch past bo\'lsa ham, rol bo\'yicha ishonch ochib beradi — ' +
     'aynan "courses -> teacherId" ning haqiqiy trafikda topilgan holati', () => {
    const rowById = new Map([['course-1', { teacherId: 'teacher-X' }]])
    const events = [
      // 9 talaba o'z kursini ko'radi — ularning ID'si hech qachon teacherId bilan mos kelmaydi
      ...Array.from({ length: 9 }, (_, i) => ({ resourceId: 'course-1', userId: `student-${i}`, role: 'STUDENT' })),
      // 1 o'qituvchi o'z kursini ko'radi — mos keladi
      { resourceId: 'course-1', userId: 'teacher-X', role: 'TEACHER' },
    ]
    const scores = aggregateCandidateScores(
      [{ path: 'teacherId', segments: 1 }], events, rowById, 1,
    )
    const score = scores[0]
    // Umumiy ishonch past — aralash trafik tufayli
    expect(score.confidence).toBeCloseTo(0.1, 5)
    // Lekin TEACHER roli bo'yicha ishonch to'liq
    const teacherRole = score.byRole.find((r) => r.role === 'TEACHER')!
    expect(teacherRole.confidence).toBe(1)
    expect(score.bestRole?.role).toBe('TEACHER')
  })

  it('bestRole faqat minRoleSupport dan yuqori tayanchli rolni tanlaydi', () => {
    const rowById = new Map([['r1', { studentId: 'X' }]])
    // Faqat bitta hodisa — agar minRoleSupport=5 bo'lsa, bu yetarli emas
    const events = [{ resourceId: 'r1', userId: 'X', role: 'STUDENT' }]
    const scores = aggregateCandidateScores([{ path: 'studentId', segments: 1 }], events, rowById, 5)
    expect(scores[0].bestRole).toBeNull()
  })

  it('userId yoki role bo\'lmagan hodisa e\'tiborsiz qoldiriladi (yiqilmaydi)', () => {
    const rowById = new Map([['r1', { studentId: 'X' }]])
    const events = [
      { resourceId: 'r1', userId: null, role: 'STUDENT' },
      { resourceId: 'r1', userId: 'X', role: null },
      { resourceId: 'missing', userId: 'X', role: 'STUDENT' }, // qator topilmaydi
    ]
    const scores = aggregateCandidateScores([{ path: 'studentId', segments: 1 }], events, rowById, 1)
    expect(scores[0].total).toBe(0)
  })
})

describe('scoreResourceType — audit_logs so\'rovi chegaralangan (DB fix phase, M3)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuditLogFindMany.mockResolvedValue([])
    mockOwnershipRuleFindMany.mockResolvedValue([])
    mockCourseFindMany.mockResolvedValue([])
  })

  it('standart holatda vaqt oynasi va qator chegarasi qo\'yiladi, eng yangilari birinchi', async () => {
    await scoreResourceType('courses')

    expect(mockAuditLogFindMany).toHaveBeenCalledTimes(1)
    const call = mockAuditLogFindMany.mock.calls[0][0] as any

    expect(call.where.resource).toBe('courses')
    expect(call.where.action).toBe('ACCESS')
    expect(call.where.createdAt.gte).toBeInstanceOf(Date)

    const expectedSince = Date.now() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
    expect(call.where.createdAt.gte.getTime()).toBeGreaterThan(expectedSince - 5000)
    expect(call.where.createdAt.gte.getTime()).toBeLessThan(expectedSince + 5000)

    expect(call.take).toBe(DEFAULT_MAX_EVENTS)
    expect(call.orderBy).toEqual({ id: 'desc' })
  })

  it('lookbackDays/maxEvents qo\'lda berilsa, standart o\'rniga ular ishlatiladi', async () => {
    await scoreResourceType('courses', { lookbackDays: 7, maxEvents: 123 })

    const call = mockAuditLogFindMany.mock.calls[0][0] as any
    const expectedSince = Date.now() - 7 * 24 * 60 * 60 * 1000
    expect(call.where.createdAt.gte.getTime()).toBeGreaterThan(expectedSince - 5000)
    expect(call.where.createdAt.gte.getTime()).toBeLessThan(expectedSince + 5000)
    expect(call.take).toBe(123)
  })
})
