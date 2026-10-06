/**
 * H4 — QR attendance token must support the whole class, not just the first
 * scanner.
 *
 * Previously `markByQr()` called `redis.del()` on the first successful
 * scan, so a second (different) student scanning the same still-valid QR
 * got "invalid/expired token" even though the countdown UI showed minutes
 * remaining. The fix removes that premature deletion — the token now lives
 * only as long as its own TTL (set via `setex` at generation), and
 * duplicate marking by the SAME student is still prevented by the
 * `enrollmentId_lessonDate` unique constraint.
 */
import { startApp, seedAdmin, seedTeacher, cleanup, makeToken, prisma } from './setup'
import { redis } from '../../config/redis'
import * as crypto from 'node:crypto'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let teacherId: string
let adminId: string
let courseId: string
let studentAId: string
let studentBId: string

async function seedUniqueStudent() {
  const bcrypt = await import('bcryptjs')
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  return prisma.user.create({
    data: {
      email: `qrAttendance_student_${suffix}@test.com`,
      passwordHash: await bcrypt.default.hash('Test@1234', 10),
      firstName: 'QR', lastName: 'Student', role: 'STUDENT',
    },
  })
}

beforeAll(async () => {
  app = await startApp()
  const [teacher, admin] = await Promise.all([seedTeacher(), seedAdmin()])
  teacherId = teacher.id
  adminId = admin.id

  const course = await prisma.course.create({
    data: {
      title: `QR attendance course ${Date.now()}`,
      slug: `qr-attendance-course-${Date.now()}`,
      teacherId, category: 'IT', durationWeeks: 4, status: 'ACTIVE',
    },
  })
  courseId = course.id

  const [studentA, studentB] = await Promise.all([seedUniqueStudent(), seedUniqueStudent()])
  studentAId = studentA.id
  studentBId = studentB.id

  await prisma.enrollment.createMany({
    data: [
      { studentId: studentAId, courseId },
      { studentId: studentBId, courseId },
    ],
  })
})

afterAll(async () => {
  await prisma.attendance.deleteMany({ where: { enrollment: { courseId } } })
  await prisma.enrollment.deleteMany({ where: { courseId } })
  await prisma.course.deleteMany({ where: { id: courseId } })
  await cleanup(teacherId, adminId, studentAId, studentBId)
  await app.close()
})

async function generateQr(lessonDate: string) {
  const teacherToken = makeToken(teacherId, 'TEACHER')
  const res = await app.inject({
    method: 'POST',
    url: '/v1/attendance/qr/generate',
    headers: { authorization: `Bearer ${teacherToken}` },
    payload: { courseId, lessonDate },
  })
  expect(res.statusCode).toBe(200)
  return res.json().data.token as string
}

async function scan(studentId: string, token: string) {
  const studentToken = makeToken(studentId, 'STUDENT')
  return app.inject({
    method: 'POST',
    url: '/v1/attendance/qr/mark',
    headers: { authorization: `Bearer ${studentToken}` },
    payload: { token },
  })
}

describe('H4 — QR attendance: one token, whole class', () => {
  it('first student scan succeeds', async () => {
    const token = await generateQr('2025-01-10')
    const res = await scan(studentAId, token)
    expect(res.statusCode).toBe(201)
    expect(res.json().data.status).toBe('PRESENT')
  })

  it('a second, different student can scan the SAME still-valid token', async () => {
    const token = await generateQr('2025-01-11')

    const first = await scan(studentAId, token)
    expect(first.statusCode).toBe(201)

    // Regression check for H4: before the fix, the token was deleted after
    // the first successful scan, so this second scan by a DIFFERENT student
    // would incorrectly get "invalid/expired token" (400).
    const second = await scan(studentBId, token)
    expect(second.statusCode).toBe(201)
    expect(second.json().data.status).toBe('PRESENT')
  })

  it('the same student scanning again is rejected as a duplicate (409), not token-invalid', async () => {
    const token = await generateQr('2025-01-12')

    const first = await scan(studentAId, token)
    expect(first.statusCode).toBe(201)

    const again = await scan(studentAId, token)
    expect(again.statusCode).toBe(409)
    expect(again.json().error.message.toLowerCase()).not.toContain('yaroqsiz')
  })

  it('an expired token is rejected (400)', async () => {
    const token = await generateQr('2025-01-13')
    // Simulate TTL expiry without waiting 5 minutes — functionally
    // identical from markByQr's point of view (redis.get returns null).
    await redis.del(`qr_attendance:${token}`)

    const res = await scan(studentAId, token)
    expect(res.statusCode).toBe(400)
    expect(res.json().error.message.toLowerCase()).toMatch(/yaroqsiz|tugagan/)
  })

  it('an invalid (never-issued) token is rejected (400)', async () => {
    const fakeToken = crypto.randomBytes(32).toString('hex')
    const res = await scan(studentAId, fakeToken)
    expect(res.statusCode).toBe(400)
  })

  it('a user with no enrollment in the course cannot mark via QR', async () => {
    const token = await generateQr('2025-01-14')
    // adminId has no enrollment in this course; impersonate a STUDENT-role
    // token for them to hit the "not enrolled" branch rather than RBAC.
    const notEnrolledToken = makeToken(adminId, 'STUDENT')
    const res = await app.inject({
      method: 'POST',
      url: '/v1/attendance/qr/mark',
      headers: { authorization: `Bearer ${notEnrolledToken}` },
      payload: { token },
    })
    expect(res.statusCode).toBe(403)
  })
})
