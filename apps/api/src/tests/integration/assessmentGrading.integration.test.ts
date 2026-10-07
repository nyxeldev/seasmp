/**
 * M1 — submitGrade must reject an enrollment/assessment pair that belong to
 * different courses.
 *
 * Before the fix, `assessmentService.submitGrade` checked that the acting
 * TEACHER owned the assessment's course, and that the enrollment existed —
 * but never checked that the enrollment and the assessment were for the
 * SAME course. A caller could combine a legitimate assessmentId (Course A)
 * with an enrollmentId from an unrelated Course B, creating a nonsensical
 * cross-course `grade` row.
 */
import { startApp, seedAdmin, seedTeacher, cleanup, makeToken, prisma } from './setup'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let adminId: string
let teacherAId: string
let teacherBId: string
let studentAId: string
let studentBId: string
let courseAId: string
let courseBId: string
let enrollmentAId: string
let enrollmentBId: string
let assessmentAId: string

async function seedUniqueUser(role: 'TEACHER' | 'STUDENT', tag: string) {
  const bcrypt = await import('bcryptjs')
  const suffix = `${Date.now()}_${tag}_${Math.random().toString(36).slice(2, 8)}`
  return prisma.user.create({
    data: {
      email: `gradeCrossCourse_${role.toLowerCase()}_${suffix}@test.com`,
      passwordHash: await bcrypt.default.hash('Test@1234', 10),
      firstName: 'Grade', lastName: role === 'TEACHER' ? 'Teacher' : 'Student', role,
    },
  })
}

beforeAll(async () => {
  app = await startApp()
  const admin = await seedAdmin()
  adminId = admin.id

  const [teacherA, teacherB, studentA, studentB] = await Promise.all([
    seedUniqueUser('TEACHER', 'a'),
    seedUniqueUser('TEACHER', 'b'),
    seedUniqueUser('STUDENT', 'a'),
    seedUniqueUser('STUDENT', 'b'),
  ])
  teacherAId = teacherA.id
  teacherBId = teacherB.id
  studentAId = studentA.id
  studentBId = studentB.id

  const [courseA, courseB] = await Promise.all([
    prisma.course.create({
      data: {
        title: `Grade cross-course A ${Date.now()}`,
        slug: `grade-cross-course-a-${Date.now()}`,
        teacherId: teacherAId, category: 'IT', durationWeeks: 4, status: 'ACTIVE',
      },
    }),
    prisma.course.create({
      data: {
        title: `Grade cross-course B ${Date.now()}`,
        slug: `grade-cross-course-b-${Date.now()}`,
        teacherId: teacherBId, category: 'IT', durationWeeks: 4, status: 'ACTIVE',
      },
    }),
  ])
  courseAId = courseA.id
  courseBId = courseB.id

  const [enrollmentA, enrollmentB] = await Promise.all([
    prisma.enrollment.create({ data: { studentId: studentAId, courseId: courseAId } }),
    prisma.enrollment.create({ data: { studentId: studentBId, courseId: courseBId } }),
  ])
  enrollmentAId = enrollmentA.id
  enrollmentBId = enrollmentB.id

  const assessmentA = await prisma.assessment.create({
    data: { courseId: courseAId, title: 'Midterm A', type: 'MIDTERM', maxScore: 100, weight: 0.3 },
  })
  assessmentAId = assessmentA.id
})

afterAll(async () => {
  await prisma.grade.deleteMany({ where: { assessmentId: assessmentAId } })
  await prisma.assessment.deleteMany({ where: { id: assessmentAId } })
  await prisma.enrollment.deleteMany({ where: { id: { in: [enrollmentAId, enrollmentBId] } } })
  await prisma.course.deleteMany({ where: { id: { in: [courseAId, courseBId] } } })
  await cleanup(adminId, teacherAId, teacherBId, studentAId, studentBId)
  await app.close()
})

describe('M1 — grade submission requires enrollment and assessment to share a course', () => {
  it('teacher + own course assessment + matching-course enrollment → succeeds', async () => {
    const token = makeToken(teacherAId, 'TEACHER')
    const res = await app.inject({
      method: 'POST',
      url: `/v1/assessments/${assessmentAId}/grades`,
      headers: { authorization: `Bearer ${token}` },
      payload: { enrollmentId: enrollmentAId, score: 85 },
    })
    expect(res.statusCode).toBe(201)
    expect(Number(res.json().data.score)).toBe(85) // Decimal(5,2) serializes as a string

    const row = await prisma.grade.findUnique({
      where: { assessmentId_enrollmentId: { assessmentId: assessmentAId, enrollmentId: enrollmentAId } },
    })
    expect(row).not.toBeNull()
  })

  it("teacher cannot submit a grade combining course A's assessment with course B's enrollment", async () => {
    const token = makeToken(teacherAId, 'TEACHER')
    const res = await app.inject({
      method: 'POST',
      url: `/v1/assessments/${assessmentAId}/grades`,
      headers: { authorization: `Bearer ${token}` },
      payload: { enrollmentId: enrollmentBId, score: 90 },
    })
    expect(res.statusCode).toBe(400)

    // No cross-course grade row must exist.
    const row = await prisma.grade.findUnique({
      where: { assessmentId_enrollmentId: { assessmentId: assessmentAId, enrollmentId: enrollmentBId } },
    })
    expect(row).toBeNull()
  })

  it('a resubmission attempt with the mismatched pair does not alter the legitimate existing grade', async () => {
    // Guards against a sloppy fix that silently clamps/redirects instead of rejecting.
    const before = await prisma.grade.findUnique({
      where: { assessmentId_enrollmentId: { assessmentId: assessmentAId, enrollmentId: enrollmentAId } },
    })
    const token = makeToken(teacherAId, 'TEACHER')
    await app.inject({
      method: 'POST',
      url: `/v1/assessments/${assessmentAId}/grades`,
      headers: { authorization: `Bearer ${token}` },
      payload: { enrollmentId: enrollmentBId, score: 1 },
    })
    const after = await prisma.grade.findUnique({
      where: { assessmentId_enrollmentId: { assessmentId: assessmentAId, enrollmentId: enrollmentAId } },
    })
    expect(after?.score).toEqual(before?.score)
  })

  it('ADMIN is also rejected for a cross-course enrollment/assessment pair (integrity, not just authorization)', async () => {
    const token = makeToken(adminId, 'ADMIN')
    const res = await app.inject({
      method: 'POST',
      url: `/v1/assessments/${assessmentAId}/grades`,
      headers: { authorization: `Bearer ${token}` },
      payload: { enrollmentId: enrollmentBId, score: 70 },
    })
    expect(res.statusCode).toBe(400)
  })

  it('ADMIN can submit a grade for a correctly matching course pair', async () => {
    const token = makeToken(adminId, 'ADMIN')
    const res = await app.inject({
      method: 'POST',
      url: `/v1/assessments/${assessmentAId}/grades`,
      headers: { authorization: `Bearer ${token}` },
      payload: { enrollmentId: enrollmentAId, score: 92 },
    })
    expect(res.statusCode).toBe(201)
  })

  it('a teacher who does not own the course is still rejected before the integrity check runs (403)', async () => {
    const token = makeToken(teacherBId, 'TEACHER')
    const res = await app.inject({
      method: 'POST',
      url: `/v1/assessments/${assessmentAId}/grades`,
      headers: { authorization: `Bearer ${token}` },
      payload: { enrollmentId: enrollmentAId, score: 50 },
    })
    expect(res.statusCode).toBe(403)
  })
})
