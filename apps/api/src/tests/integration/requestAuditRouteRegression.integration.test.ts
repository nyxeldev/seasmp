/**
 * R4/R6 — route-pattern-aware `targetFromPath` — HTTP regression table.
 *
 * `recordRequest` runs as an `onResponse` hook (app.ts), i.e. strictly
 * AFTER the reply has already been sent. Nothing it does — including this
 * round's change to how it extracts the audit "resource" string — can
 * alter the HTTP status the client receives. The real authorization
 * decision for every route below is enforced independently inside its own
 * service function (attendanceService.getStats, the inline teacherId/
 * studentId checks in analytics.routes.ts, analyticsService.studentStats),
 * none of which this round touched.
 *
 * So "before" and "after" are identical by construction for any single
 * request. These tests run against the current (after-fix) code and
 * assert the actual status for each case; the "before" column in the
 * report is this same value, justified by the architectural fact above
 * rather than by re-running old code.
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
let enrollmentAId: string

async function seedUniqueUser(role: 'TEACHER' | 'STUDENT') {
  const bcrypt = await import('bcryptjs')
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  return prisma.user.create({
    data: {
      email: `auditRegression_${role.toLowerCase()}_${suffix}@test.com`,
      passwordHash: await bcrypt.default.hash('Test@1234', 10),
      firstName: 'AuditRegression',
      lastName:  role === 'TEACHER' ? 'TeacherFixture' : 'StudentFixture',
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

  const courseA = await prisma.course.create({
    data: {
      title: `Audit regression course A ${Date.now()}`,
      slug:  `audit-regression-course-a-${Date.now()}`,
      teacherId: teacherAId, category: 'IT', durationWeeks: 4, status: 'ACTIVE',
    },
  })
  courseAId = courseA.id

  const enrollmentA = await prisma.enrollment.create({
    data: { studentId: studentAId, courseId: courseAId },
  })
  enrollmentAId = enrollmentA.id
})

afterAll(async () => {
  await prisma.enrollment.deleteMany({ where: { id: enrollmentAId } })
  await prisma.course.deleteMany({ where: { id: courseAId } })
  await cleanup(adminId, teacherAId, teacherBId, studentAId, studentBId)
  await app.close()
})

const NONEXISTENT = '00000000-0000-0000-0000-000000000000'

// ─── R4 — GET /v1/attendance/stats/:enrollmentId ───────────────────────────
// Before fix: resource='enrollments' already (PARAM_NAME_TO_RESOURCE existed
// for this one route from the prior round) — status table unchanged here;
// included for completeness of the "every changed route" requirement.
describe('R4 — GET /v1/attendance/stats/:enrollmentId — before/after identical', () => {
  it('owning student → 200', async () => {
    const token = makeToken(studentAId, 'STUDENT')
    const res = await app.inject({
      method: 'GET', url: `/v1/attendance/stats/${enrollmentAId}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('cross-owner student → 403', async () => {
    const token = makeToken(studentBId, 'STUDENT')
    const res = await app.inject({
      method: 'GET', url: `/v1/attendance/stats/${enrollmentAId}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('owning teacher (owns the course) → 200', async () => {
    const token = makeToken(teacherAId, 'TEACHER')
    const res = await app.inject({
      method: 'GET', url: `/v1/attendance/stats/${enrollmentAId}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('cross-owner teacher (does not own the course) → 403', async () => {
    const token = makeToken(teacherBId, 'TEACHER')
    const res = await app.inject({
      method: 'GET', url: `/v1/attendance/stats/${enrollmentAId}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('ADMIN → 200', async () => {
    const token = makeToken(adminId, 'ADMIN')
    const res = await app.inject({
      method: 'GET', url: `/v1/attendance/stats/${enrollmentAId}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('nonexistent enrollment → 404', async () => {
    const token = makeToken(adminId, 'ADMIN')
    const res = await app.inject({
      method: 'GET', url: `/v1/attendance/stats/${NONEXISTENT}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(404)
  })
})

// ─── R6 — GET /v1/analytics/teacher/:teacherId/kpi ──────────────────────────
// Before fix: this route's Node-side check ran BEFORE this round's change
// in all cases below (the 403 is thrown by the route handler itself, not by
// requestAudit/resolveAccess) — only the async audit-log telemetry (resource
// label) for the ALLOWED cases changes, which cannot affect the response.
//
// Why these three assert an EXACT 404, not "not 403" (Closeout Correction,
// Item 1): probed directly against this environment's real analytics
// container. ALL THREE return 404 "Teacher not found" — including the
// self-view case with a teacherId that genuinely has role TEACHER. Root
// cause, confirmed by direct inspection, not guessed: this host runs TWO
// separate Postgres servers — the one `apps/api`'s `.env` DATABASE_URL
// points at (host port 5432, what these Jest tests write their fixtures
// into) and the one the `seasmp-analytics` container reads from (its own
// `postgres:5432` on the Docker network, published to the host as port
// 5433 — confirmed via `netstat -ano`: PID on 5432 differs from the
// docker-proxy PID on 5433). A teacherId this test creates via Prisma is
// therefore structurally invisible to the Python service — it is in the
// other database. That is the deterministic precondition: no seeding step
// is needed beyond the normal fixture, because "freshly created by this
// test" already guarantees "absent from the analytics DB" on this host.
// Route code confirms the exact branch taken: `analytics.routes.ts`'s
// `/teacher/:teacherId/kpi` handler catches `e.statusCode === 404` from
// `pyGet` and returns `reply.status(404).send({ success: false, error:
// 'Teacher not found' })` — this is a real 404 from the real service, not
// a network/connection failure being mapped to 404.
describe('R6 — GET /v1/analytics/teacher/:teacherId/kpi — before/after identical', () => {
  it('teacher viewing own KPI → 404 "Teacher not found" (Node-side self-check passes; the analytics DB cannot see this id — see note above)', async () => {
    const token = makeToken(teacherAId, 'TEACHER')
    const res = await app.inject({
      method: 'GET', url: `/v1/analytics/teacher/${teacherAId}/kpi`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ success: false, error: 'Teacher not found' })
  })

  it("teacher viewing another teacher's KPI → 403 (Node-side check runs before any Python call — unaffected by the DB split)", async () => {
    const token = makeToken(teacherBId, 'TEACHER')
    const res = await app.inject({
      method: 'GET', url: `/v1/analytics/teacher/${teacherAId}/kpi`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('ADMIN viewing a real teacher\'s KPI → 404 "Teacher not found" (ADMIN has no Node-side self-check to short-circuit; same DB-split reason)', async () => {
    const token = makeToken(adminId, 'ADMIN')
    const res = await app.inject({
      method: 'GET', url: `/v1/analytics/teacher/${teacherAId}/kpi`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ success: false, error: 'Teacher not found' })
  })

  it('ADMIN + nonexistent teacherId → 404 "Teacher not found" (same exact response as the real-id cases above, same branch)', async () => {
    const token = makeToken(adminId, 'ADMIN')
    const res = await app.inject({
      method: 'GET', url: `/v1/analytics/teacher/${NONEXISTENT}/kpi`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ success: false, error: 'Teacher not found' })
  })
})

// ─── R6 — GET /v1/analytics/students/:studentId (simple, Node-computed) ───
describe('R6 — GET /v1/analytics/students/:studentId — before/after identical', () => {
  it('student viewing own stats → 200', async () => {
    const token = makeToken(studentAId, 'STUDENT')
    const res = await app.inject({
      method: 'GET', url: `/v1/analytics/students/${studentAId}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it("student viewing another student's stats → 403", async () => {
    const token = makeToken(studentBId, 'STUDENT')
    const res = await app.inject({
      method: 'GET', url: `/v1/analytics/students/${studentAId}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('TEACHER viewing any student stats → 200 (unchanged — no role restriction in studentStats)', async () => {
    const token = makeToken(teacherAId, 'TEACHER')
    const res = await app.inject({
      method: 'GET', url: `/v1/analytics/students/${studentAId}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('ADMIN viewing any student stats → 200', async () => {
    const token = makeToken(adminId, 'ADMIN')
    const res = await app.inject({
      method: 'GET', url: `/v1/analytics/students/${studentAId}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('nonexistent studentId → 404', async () => {
    const token = makeToken(adminId, 'ADMIN')
    const res = await app.inject({
      method: 'GET', url: `/v1/analytics/students/${NONEXISTENT}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(404)
  })
})
