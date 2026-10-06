/**
 * M5 — detection/ownership resource-naming mismatch.
 *
 * `ownership_rules.resource_type` (and `MODEL_BY_RESOURCE` in
 * ownershipResolver.ts) use the PLURAL form matching the primary route
 * prefix (`enrollments`, `courses`) — this is the real contract, confirmed
 * from `prisma/seed-ownership.ts`. Several secondary/nested routes
 * (`/v1/analytics/students/:id/enrollment/:id`,
 * `/v1/assessments/course/:id`, `/v1/assessments/enrollment/:id/grades`)
 * put the SINGULAR word right before the UUID, which `targetFromPath`
 * (requestAudit.ts) correctly and faithfully extracts — but before the
 * fix, `resolveAccess` then looked up `'enrollment'`/`'course'` in a table
 * that only has `'enrollments'`/`'courses'`, silently resolving to UNKNOWN
 * instead of the real OWNER/CUSTODIAN/FOREIGN relation. That is a genuine
 * detection blind spot, not a cosmetic naming issue: audit records for
 * those paths never got a real `accessRelation`/`resourceOwnerId`, and the
 * correlation layer could never flag abuse of those specific endpoints.
 *
 * These tests seed the exact ownership rules from seed-ownership.ts
 * (idempotent upsert — matches permanent system configuration, not
 * per-test fixtures, so they are intentionally NOT deleted in afterAll)
 * and call `resolveAccess` directly with both the plural (canonical) and
 * singular (aliased) resource type for the same object, asserting they
 * now agree.
 */
import { resolveAccess } from '../../services/ownershipResolver'
import { seedTeacher, cleanup, prisma } from './setup'

let teacherId: string
let studentAId: string
let studentBId: string
let courseId: string
let enrollmentId: string

async function seedUniqueStudent(tag: string) {
  const bcrypt = await import('bcryptjs')
  const suffix = `${Date.now()}_${tag}_${Math.random().toString(36).slice(2, 8)}`
  return prisma.user.create({
    data: {
      email: `resourceAlias_${suffix}@test.com`,
      passwordHash: await bcrypt.default.hash('Test@1234', 10),
      firstName: 'Alias', lastName: 'Student', role: 'STUDENT',
    },
  })
}

beforeAll(async () => {
  const teacher = await seedTeacher()
  teacherId = teacher.id
  const [studentA, studentB] = await Promise.all([
    seedUniqueStudent('a'),
    seedUniqueStudent('b'),
  ])
  studentAId = studentA.id
  studentBId = studentB.id

  const course = await prisma.course.create({
    data: {
      title: `Resource alias course ${Date.now()}`,
      slug: `resource-alias-course-${Date.now()}`,
      teacherId, category: 'IT', durationWeeks: 4, status: 'ACTIVE',
    },
  })
  courseId = course.id

  const enrollment = await prisma.enrollment.create({
    data: { studentId: studentAId, courseId },
  })
  enrollmentId = enrollment.id

  // Exact same rows as prisma/seed-ownership.ts — permanent configuration,
  // not test-only data, so it is safe (and correct) to leave them in place.
  await Promise.all([
    (prisma as any).ownershipRule.upsert({
      where:  { resourceType_ownerPath: { resourceType: 'enrollments', ownerPath: 'studentId' } },
      update: { active: true },
      create: { resourceType: 'enrollments', ownerPath: 'studentId', role: 'OWNER' },
    }),
    (prisma as any).ownershipRule.upsert({
      where:  { resourceType_ownerPath: { resourceType: 'enrollments', ownerPath: 'course.teacherId' } },
      update: { active: true },
      create: { resourceType: 'enrollments', ownerPath: 'course.teacherId', role: 'CUSTODIAN' },
    }),
    (prisma as any).ownershipRule.upsert({
      where:  { resourceType_ownerPath: { resourceType: 'courses', ownerPath: 'teacherId' } },
      update: { active: true },
      create: { resourceType: 'courses', ownerPath: 'teacherId', role: 'CUSTODIAN' },
    }),
  ])
})

afterAll(async () => {
  await prisma.enrollment.deleteMany({ where: { id: enrollmentId } })
  await prisma.course.deleteMany({ where: { id: courseId } })
  await cleanup(teacherId, studentAId, studentBId)
  // ownership_rule rows intentionally left in place — see file header.
})

describe('M5 — singular/plural resource alias in resolveAccess', () => {
  it('canonical plural "enrollments" resolves the real OWNER relation', async () => {
    const verdict = await resolveAccess('enrollments', enrollmentId, studentAId, 'STUDENT')
    expect(verdict.relation).toBe('OWNER')
  })

  it('aliased singular "enrollment" resolves the SAME relation as "enrollments" (regression)', async () => {
    const verdict = await resolveAccess('enrollment', enrollmentId, studentAId, 'STUDENT')
    expect(verdict.relation).toBe('OWNER')
  })

  it('aliased singular "enrollment" correctly denies a non-owning student (FOREIGN, not UNKNOWN)', async () => {
    const verdict = await resolveAccess('enrollment', enrollmentId, studentBId, 'STUDENT')
    expect(verdict.relation).toBe('FOREIGN')
  })

  it('canonical plural "courses" resolves CUSTODIAN for the owning teacher', async () => {
    const verdict = await resolveAccess('courses', courseId, teacherId, 'TEACHER')
    expect(verdict.relation).toBe('CUSTODIAN')
  })

  it('aliased singular "course" resolves the SAME relation as "courses" (regression)', async () => {
    const verdict = await resolveAccess('course', courseId, teacherId, 'TEACHER')
    expect(verdict.relation).toBe('CUSTODIAN')
  })

  it('a genuinely unknown resource type is still UNKNOWN (no over-aliasing)', async () => {
    const verdict = await resolveAccess('not_a_real_resource', enrollmentId, studentAId, 'STUDENT')
    expect(verdict.relation).toBe('UNKNOWN')
  })

  it('existing detection behavior for admins is intact (PRIVILEGED, with ownerId for audit)', async () => {
    const admin = await prisma.user.create({
      data: {
        email: `resourceAlias_admin_${Date.now()}@test.com`,
        passwordHash: '$2a$12$abcdefghijklmnopqrstuv',
        firstName: 'Alias', lastName: 'Admin', role: 'ADMIN',
      },
    })
    try {
      const verdict = await resolveAccess('enrollment', enrollmentId, admin.id, 'ADMIN')
      expect(verdict.relation).toBe('PRIVILEGED')
      expect(verdict.ownerId).toBe(studentAId)
    } finally {
      await cleanup(admin.id)
    }
  })
})
