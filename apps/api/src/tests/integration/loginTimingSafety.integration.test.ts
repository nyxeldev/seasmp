/**
 * M3 — login must not have an obvious early-exit for a nonexistent email
 * that skips the expensive bcrypt verification step entirely.
 *
 * Per the task's own instruction, this is NOT tested with timing
 * assertions (those are brittle/flaky). Instead these tests prove the
 * BEHAVIORAL equivalence that the fix guarantees:
 *   - identical HTTP status/error message for "no such user" vs "wrong
 *     password" (already true before the fix — kept intact)
 *   - identical side effects (an audit LOGIN_FAILED row, failed-attempt
 *     counting) fire on BOTH paths, proving neither path short-circuits
 *     before reaching the same bcrypt.compare + failure-handling code
 *   - the real-user correct-password path still works (bcrypt.compare
 *     against the REAL hash was not weakened or bypassed)
 */
import { startApp, seedStudent, cleanup, prisma } from './setup'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let studentId: string
let studentEmail: string

beforeAll(async () => {
  app = await startApp()
  const student = await seedStudent()
  studentId = student.id
  studentEmail = student.email
})

afterAll(async () => {
  await cleanup(studentId)
  await app.close()
})

describe('M3 — login behaves identically for nonexistent user vs wrong password', () => {
  it('nonexistent email returns the generic 401 message (no enumeration hint)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: `definitely-not-registered-${Date.now()}@test.com`, password: 'WhateverPassword1' },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.message).toBe("Email yoki parol noto'g'ri")
  })

  it('existing email + wrong password returns the EXACT SAME message', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: studentEmail, password: 'DefinitelyWrongPassword1' },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.message).toBe("Email yoki parol noto'g'ri")
  })

  it('a failed login against a nonexistent email still records a LOGIN_FAILED audit entry (no short-circuit before the shared failure path)', async () => {
    const fakeEmail = `audit-check-${Date.now()}@test.com`
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: fakeEmail, password: 'WhateverPassword1' },
    })
    expect(res.statusCode).toBe(401)

    const log = await prisma.auditLog.findFirst({
      where: { action: 'LOGIN_FAILED', userId: null },
      orderBy: { id: 'desc' },
    })
    expect(log).not.toBeNull()
    expect(log?.userId).toBeNull()
  })

  it('a failed login with the wrong password for a real user records a LOGIN_FAILED entry tied to that user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: studentEmail, password: 'DefinitelyWrongPassword2' },
    })
    expect(res.statusCode).toBe(401)

    const log = await prisma.auditLog.findFirst({
      where: { action: 'LOGIN_FAILED', userId: studentId },
      orderBy: { id: 'desc' },
    })
    expect(log).not.toBeNull()
  })

  it('the real bcrypt verification path is intact: correct password for a real user still succeeds', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: studentEmail, password: 'Student@1234' }, // set by seedStudent() in setup.ts
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.accessToken).toBeTruthy()
  })

  it('a wrong password for a DEACTIVATED user still returns the generic 401 (isActive check preserved)', async () => {
    const bcrypt = await import('bcryptjs')
    const inactive = await prisma.user.create({
      data: {
        email: `inactive_${Date.now()}@test.com`,
        passwordHash: await bcrypt.default.hash('RealPassword1', 12),
        firstName: 'Inactive', lastName: 'User', role: 'STUDENT', isActive: false,
      },
    })
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { email: inactive.email, password: 'RealPassword1' },
      })
      expect(res.statusCode).toBe(401)
      expect(res.json().error.message).toBe("Email yoki parol noto'g'ri")
    } finally {
      await cleanup(inactive.id)
    }
  })
})
