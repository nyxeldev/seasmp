/**
 * DB fix phase — functional integration tests for C1, C2, M2.
 *
 * Runs against a real PostgreSQL (see setup.ts) — all created rows are
 * uniquely named and cleaned up in afterAll, same convention as the other
 * integration suites in this folder.
 */
import { startApp, seedAdmin, seedTeacher, seedStudent, cleanup, makeToken, prisma } from './setup'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let superAdminId: string

beforeAll(async () => {
  app = await startApp()
  const admin = await seedAdmin()
  superAdminId = admin.id
})

afterAll(async () => {
  await cleanup(superAdminId)
  await app.close()
})

// ─── C1 — user hard-delete: P2003 translated to a clean 409 ──────────────────

describe('DELETE /v1/users/:id — C1 (FK RESTRICT -> 409, not a raw 500)', () => {
  it('deletes a user with no dependent records — succeeds', async () => {
    const throwaway = await seedStudent()
    const token = makeToken(superAdminId, 'SUPER_ADMIN')

    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/users/${throwaway.id}`,
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
    const row = await prisma.user.findUnique({ where: { id: throwaway.id } })
    expect(row).toBeNull()
  })

  it('refuses to delete a teacher who has a course (dependent record) — 409, friendly message, no leaked Prisma error', async () => {
    const teacher = await seedTeacher()
    const course = await prisma.course.create({
      data: {
        title: `DB fix phase test course ${Date.now()}`,
        slug: `db-fix-phase-test-course-${Date.now()}`,
        teacherId: teacher.id,
        category: 'IT',
        durationWeeks: 4,
      },
    })

    const token = makeToken(superAdminId, 'SUPER_ADMIN')
    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/users/${teacher.id}`,
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(409)
    const body = res.json()
    expect(body.success).toBe(false)
    expect(body.error.message.toLowerCase()).not.toContain('prisma')
    expect(body.error.message).not.toContain('P2003')
    // Deaktivatsiya (isActive) muqobil yo'l sifatida ko'rsatilishi kerak
    expect(body.error.message.toLowerCase()).toMatch(/deaktivatsiya|toggle-status/)

    // Teacher row must still exist — delete was correctly rejected, not partially applied
    const stillThere = await prisma.user.findUnique({ where: { id: teacher.id } })
    expect(stillThere).not.toBeNull()

    await prisma.course.delete({ where: { id: course.id } })
    await cleanup(teacher.id)
  })
})

// ─── C2 — enrollment capacity race + M2 — duplicate enrollment (P2002) ───────

describe('POST /v1/enrollments — C2 (capacity race) + M2 (P2002 -> 409)', () => {
  it('never lets concurrent enrollments exceed maxStudents', async () => {
    const teacher = await seedTeacher()
    const maxStudents = 3
    const course = await prisma.course.create({
      data: {
        title: `Capacity race test ${Date.now()}`,
        slug: `capacity-race-test-${Date.now()}`,
        teacherId: teacher.id,
        category: 'IT',
        durationWeeks: 4,
        maxStudents,
        status: 'ACTIVE',
      },
    })

    const studentCount = 6 // more than capacity, to force the race
    const students = await Promise.all(
      Array.from({ length: studentCount }, () => seedUniqueStudent()),
    )
    const token = makeToken(superAdminId, 'SUPER_ADMIN')

    const results = await Promise.all(
      students.map((s) =>
        app.inject({
          method: 'POST',
          url: '/v1/enrollments',
          headers: { authorization: `Bearer ${token}` },
          payload: { studentId: s.id, courseId: course.id },
        }),
      ),
    )

    // No request should ever see a raw 500 — either it got a seat (201) or a
    // clean, expected rejection (400 "to'lgan").
    for (const r of results) {
      expect([201, 400]).toContain(r.statusCode)
    }

    const succeeded = results.filter((r) => r.statusCode === 201).length
    expect(succeeded).toBe(maxStudents)

    const activeCount = await prisma.enrollment.count({
      where: { courseId: course.id, status: 'ACTIVE' },
    })
    expect(activeCount).toBe(maxStudents)
    expect(activeCount).toBeLessThanOrEqual(maxStudents)

    await prisma.enrollment.deleteMany({ where: { courseId: course.id } })
    await prisma.course.delete({ where: { id: course.id } })
    await cleanup(teacher.id, ...students.map((s) => s.id))
  })

  it('duplicate enrollment under concurrency: exactly one row persists, loser gets a clean 409 (not 500)', async () => {
    const teacher = await seedTeacher()
    const student = await seedUniqueStudent()
    const course = await prisma.course.create({
      data: {
        title: `Duplicate race test ${Date.now()}`,
        slug: `duplicate-race-test-${Date.now()}`,
        teacherId: teacher.id,
        category: 'IT',
        durationWeeks: 4,
        maxStudents: 30,
        status: 'ACTIVE',
      },
    })
    const token = makeToken(superAdminId, 'SUPER_ADMIN')

    const payload = { studentId: student.id, courseId: course.id }
    const [a, b] = await Promise.all([
      app.inject({ method: 'POST', url: '/v1/enrollments', headers: { authorization: `Bearer ${token}` }, payload }),
      app.inject({ method: 'POST', url: '/v1/enrollments', headers: { authorization: `Bearer ${token}` }, payload }),
    ])

    for (const r of [a, b]) {
      expect([201, 409]).toContain(r.statusCode)
      if (r.statusCode === 409) {
        expect(r.json().error.message.toLowerCase()).not.toContain('prisma')
      }
    }
    // exactly one of the two succeeded
    expect([a.statusCode, b.statusCode].filter((s) => s === 201).length).toBe(1)

    const rows = await prisma.enrollment.findMany({ where: { courseId: course.id, studentId: student.id } })
    expect(rows.length).toBe(1)

    await prisma.enrollment.deleteMany({ where: { courseId: course.id } })
    await prisma.course.delete({ where: { id: course.id } })
    await cleanup(teacher.id, student.id)
  })
})

// seedStudent() uses a shared TS suffix (see setup.ts), so calling it twice in
// one suite would collide on email. This mints a distinct student per call.
async function seedUniqueStudent() {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  return prisma.user.create({
    data: {
      email: `dbfix_student_${suffix}@test.com`,
      passwordHash: '$2a$12$abcdefghijklmnopqrstuv', // never logged in with — hash content is irrelevant
      firstName: 'Race',
      lastName: 'Student',
      role: 'STUDENT',
    },
  })
}
