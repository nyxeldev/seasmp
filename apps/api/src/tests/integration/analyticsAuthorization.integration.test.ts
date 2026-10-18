/**
 * Analytics authorization boundary — H2 (student enrollment IDOR) and
 * H3 (teacher dropout-risk cross-course exposure) fixes.
 *
 * These endpoints proxy to the Python analytics service, which trusts the
 * Node layer completely (it only checks the shared X-Internal-Key). So the
 * authorization decision MUST be made here, before any proxy call — these
 * tests assert exactly that boundary:
 *
 *   - "denied" cases must be rejected with 403/404 BEFORE reaching Python,
 *     so they are deterministic regardless of whether the Python service
 *     is reachable or what data it holds.
 *   - "allowed" cases must NOT be rejected by the Node-side check (i.e. the
 *     response must not be 403/404) — the exact downstream status (200 if
 *     the Python service is up, 503 if not) is not what's under test here.
 */
import { startApp, seedAdmin, seedTeacher, seedStudent, cleanup, makeToken, prisma } from './setup'
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

async function seedUniqueUser(role: 'TEACHER' | 'STUDENT') {
  const bcrypt = await import('bcryptjs')
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  return prisma.user.create({
    data: {
      email: `analyticsAuth_${role.toLowerCase()}_${suffix}@test.com`,
      passwordHash: await bcrypt.default.hash('Test@1234', 10),
      firstName: 'Analytics',
      lastName: role === 'TEACHER' ? 'TeacherFixture' : 'StudentFixture',
      role,
    },
  })
}

beforeAll(async () => {
  app = await startApp()

  const admin = await seedAdmin()
  adminId = admin.id

  const [teacherA, teacherB, studentA, studentB] = await Promise.all([
    seedUniqueUser('TEACHER'),
    seedUniqueUser('TEACHER'),
    seedUniqueUser('STUDENT'),
    seedUniqueUser('STUDENT'),
  ])
  teacherAId = teacherA.id
  teacherBId = teacherB.id
  studentAId = studentA.id
  studentBId = studentB.id

  const [courseA, courseB] = await Promise.all([
    prisma.course.create({
      data: {
        title: `Analytics auth course A ${Date.now()}`,
        slug: `analytics-auth-course-a-${Date.now()}`,
        teacherId: teacherAId, category: 'IT', durationWeeks: 4, status: 'ACTIVE',
      },
    }),
    prisma.course.create({
      data: {
        title: `Analytics auth course B ${Date.now()}`,
        slug: `analytics-auth-course-b-${Date.now()}`,
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
})

afterAll(async () => {
  await prisma.enrollment.deleteMany({ where: { id: { in: [enrollmentAId, enrollmentBId] } } })
  await prisma.course.deleteMany({ where: { id: { in: [courseAId, courseBId] } } })
  await cleanup(adminId, teacherAId, teacherBId, studentAId, studentBId)
  await app.close()
})

// ─── H2 — GET /v1/analytics/students/:studentId/enrollment/:enrollmentId ──────

describe('H2 — student enrollment analytics IDOR', () => {
  it('student + own enrollment → allowed (not blocked by authorization)', async () => {
    const token = makeToken(studentAId, 'STUDENT')
    const res = await app.inject({
      method: 'GET',
      url: `/v1/analytics/students/${studentAId}/enrollment/${enrollmentAId}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).not.toBe(403)
    expect(res.statusCode).not.toBe(404)
  })

  it("student + another student's enrollment → denied (404, existence not revealed)", async () => {
    const token = makeToken(studentAId, 'STUDENT')
    const res = await app.inject({
      method: 'GET',
      url: `/v1/analytics/students/${studentAId}/enrollment/${enrollmentBId}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('invalid/nonexistent enrollment → 404', async () => {
    const token = makeToken(studentAId, 'STUDENT')
    const res = await app.inject({
      method: 'GET',
      url: `/v1/analytics/students/${studentAId}/enrollment/00000000-0000-0000-0000-000000000000`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('student cannot pass someone else\'s studentId with their own enrollment either', async () => {
    // sub !== :studentId path check — the earliest guard, unrelated to enrollment ownership.
    const token = makeToken(studentAId, 'STUDENT')
    const res = await app.inject({
      method: 'GET',
      url: `/v1/analytics/students/${studentBId}/enrollment/${enrollmentAId}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('ADMIN can access any student enrollment', async () => {
    const token = makeToken(adminId, 'ADMIN')
    const res = await app.inject({
      method: 'GET',
      url: `/v1/analytics/students/${studentAId}/enrollment/${enrollmentAId}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).not.toBe(403)
    expect(res.statusCode).not.toBe(404)
  })

  it("TEACHER who owns the course can access that student's enrollment", async () => {
    const token = makeToken(teacherAId, 'TEACHER')
    const res = await app.inject({
      method: 'GET',
      url: `/v1/analytics/students/${studentAId}/enrollment/${enrollmentAId}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).not.toBe(403)
    expect(res.statusCode).not.toBe(404)
  })

  it("TEACHER who does NOT own the course is denied (404)", async () => {
    const token = makeToken(teacherBId, 'TEACHER')
    const res = await app.inject({
      method: 'GET',
      url: `/v1/analytics/students/${studentAId}/enrollment/${enrollmentAId}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(404)
  })
})

// ─── H3 — GET /v1/analytics/dropout-risk ───────────────────────────────────────

describe('H3 — teacher dropout-risk cross-course exposure', () => {
  it('teacher + own course_id → allowed (not blocked by authorization)', async () => {
    const token = makeToken(teacherAId, 'TEACHER')
    const res = await app.inject({
      method: 'GET',
      url: `/v1/analytics/dropout-risk?course_id=${courseAId}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).not.toBe(403)
    expect(res.statusCode).not.toBe(400)
  })

  it("teacher + another teacher's course_id → denied (403)", async () => {
    const token = makeToken(teacherAId, 'TEACHER')
    const res = await app.inject({
      method: 'GET',
      url: `/v1/analytics/dropout-risk?course_id=${courseBId}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('teacher + missing course_id → denied (400) — must not fall back to system-wide data', async () => {
    const token = makeToken(teacherAId, 'TEACHER')
    const res = await app.inject({
      method: 'GET',
      url: '/v1/analytics/dropout-risk',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(400)
  })

  it('teacher + nonexistent course_id → denied (404)', async () => {
    const token = makeToken(teacherAId, 'TEACHER')
    const res = await app.inject({
      method: 'GET',
      url: '/v1/analytics/dropout-risk?course_id=00000000-0000-0000-0000-000000000000',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('ADMIN without course_id still gets system-wide access (unchanged behavior)', async () => {
    const token = makeToken(adminId, 'ADMIN')
    const res = await app.inject({
      method: 'GET',
      url: '/v1/analytics/dropout-risk',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).not.toBe(400)
    expect(res.statusCode).not.toBe(403)
  })
})
