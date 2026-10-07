/**
 * Security integration tests — audit logs, sessions, RBAC on /security.
 */

import { startApp, seedAdmin, seedStudent, seedTeacher, cleanup, makeToken, prisma } from './setup'
import type { FastifyInstance } from 'fastify'

let app:       FastifyInstance
let adminId:   string
let studentId: string
let teacherId: string

beforeAll(async () => {
  app = await startApp()
  const [admin, student, teacher] = await Promise.all([seedAdmin(), seedStudent(), seedTeacher()])
  adminId   = admin.id
  studentId = student.id
  teacherId = teacher.id
})

afterAll(async () => {
  await prisma.course.deleteMany({ where: { teacherId } })
  await cleanup(adminId, studentId, teacherId)
  await app.close()
})

// ─── Audit Logs ───────────────────────────────────────────────────────────────

describe('GET /v1/security/audit-logs', () => {
  it('ADMIN can access audit logs', async () => {
    const token = makeToken(adminId, 'ADMIN')
    const res = await app.inject({
      method:  'GET',
      url:     '/v1/security/audit-logs',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().success).toBe(true)
    expect(Array.isArray(res.json().data)).toBe(true)
    expect(res.json().meta).toBeDefined()
  })

  it('STUDENT cannot access audit logs — 403', async () => {
    const token = makeToken(studentId, 'STUDENT')
    const res = await app.inject({
      method:  'GET',
      url:     '/v1/security/audit-logs',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('unauthenticated request → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/security/audit-logs' })
    expect(res.statusCode).toBe(401)
  })

  it('filters by action param', async () => {
    const token = makeToken(adminId, 'ADMIN')
    const res = await app.inject({
      method:  'GET',
      url:     '/v1/security/audit-logs?action=LOGIN',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    // All returned logs must have action LOGIN
    const logs: any[] = res.json().data
    logs.forEach(log => expect(log.action).toBe('LOGIN'))
  })
})

// L1 — GET /v1/security/audit-logs/:id must validate `id` BEFORE BigInt(id):
// a non-numeric id used to throw an uncaught SyntaxError (no statusCode),
// which the global error handler turned into a raw 500. This had no direct
// regression test — the list-endpoint tests above do not exercise :id at
// all — so the fix was unverified by the suite.
describe('GET /v1/security/audit-logs/:id', () => {
  let logId: string

  beforeAll(async () => {
    const log = await prisma.auditLog.create({
      data: { userId: adminId, action: 'LOGIN', resource: 'users', ipAddress: '127.0.0.1' },
    })
    logId = log.id.toString()
  })

  it('a valid, existing numeric id returns the log (ADMIN)', async () => {
    const token = makeToken(adminId, 'ADMIN')
    const res = await app.inject({
      method:  'GET',
      url:     `/v1/security/audit-logs/${logId}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.id).toBe(logId)
  })

  it('a malformed (non-numeric) id returns 400, not 500', async () => {
    const token = makeToken(adminId, 'ADMIN')
    const res = await app.inject({
      method:  'GET',
      url:     '/v1/security/audit-logs/not-a-bigint',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(400)
  })

  it('a negative-looking id returns 400, not 500', async () => {
    const token = makeToken(adminId, 'ADMIN')
    const res = await app.inject({
      method:  'GET',
      url:     '/v1/security/audit-logs/-1',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(400)
  })

  it('a well-formed but nonexistent numeric id returns 404', async () => {
    const token = makeToken(adminId, 'ADMIN')
    const res = await app.inject({
      method:  'GET',
      url:     '/v1/security/audit-logs/999999999999',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('STUDENT cannot access a single audit log — 403', async () => {
    const token = makeToken(studentId, 'STUDENT')
    const res = await app.inject({
      method:  'GET',
      url:     `/v1/security/audit-logs/${logId}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(403)
  })

  // Closeout: the digits-only regex alone was not enough. JS BigInt is
  // arbitrary-precision, so a numeric string far larger than Postgres'
  // bigint range still passed the regex, reached the DB, and raised
  // SQLSTATE 22003 ("value out of range for type bigint") — an uncaught
  // Prisma error with no statusCode, falling through to a raw 500.
  it('an id far larger than Postgres bigint range returns 400, not 500', async () => {
    const token = makeToken(adminId, 'ADMIN')
    const res = await app.inject({
      method:  'GET',
      url:     '/v1/security/audit-logs/99999999999999999999999999',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(400)
  })

  it('exactly Postgres bigint max (9223372036854775807) is a VALID id shape — 404, not 400', async () => {
    const token = makeToken(adminId, 'ADMIN')
    const res = await app.inject({
      method:  'GET',
      url:     '/v1/security/audit-logs/9223372036854775807',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('bigint max + 1 (9223372036854775808) is rejected — 400', async () => {
    const token = makeToken(adminId, 'ADMIN')
    const res = await app.inject({
      method:  'GET',
      url:     '/v1/security/audit-logs/9223372036854775808',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(400)
  })
})

// ─── Security Alerts ─────────────────────────────────────────────────────────

describe('GET /v1/security/alerts', () => {
  it('ADMIN can list alerts', async () => {
    const token = makeToken(adminId, 'ADMIN')
    const res = await app.inject({
      method:  'GET',
      url:     '/v1/security/alerts',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().success).toBe(true)
  })

  it('GET /v1/security/alerts/stats returns counts', async () => {
    const token = makeToken(adminId, 'ADMIN')
    const res = await app.inject({
      method:  'GET',
      url:     '/v1/security/alerts/stats',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const data = res.json().data
    expect(typeof data.todayTotal).toBe('number')
    expect(typeof data.unresolved).toBe('number')
    expect(typeof data.blockedIps).toBe('number')
  })
})

// R7 — PATCH /v1/security/alerts/:id/resolve BigInt overflow guard
// (same defect class as L1 on the audit-logs route — no validation at all).
describe('PATCH /v1/security/alerts/:id/resolve', () => {
  it('non-numeric id returns 400', async () => {
    const token = makeToken(adminId, 'ADMIN')
    const res = await app.inject({
      method:  'PATCH',
      url:     '/v1/security/alerts/not-a-bigint/resolve',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(400)
  })

  it('an id far larger than Postgres bigint range returns 400, not 500', async () => {
    const token = makeToken(adminId, 'ADMIN')
    const res = await app.inject({
      method:  'PATCH',
      url:     '/v1/security/alerts/99999999999999999999999999/resolve',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(400)
  })

  it('exactly Postgres bigint max (9223372036854775807) is a VALID id shape — 404, not 400', async () => {
    const token = makeToken(adminId, 'ADMIN')
    const res = await app.inject({
      method:  'PATCH',
      url:     '/v1/security/alerts/9223372036854775807/resolve',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('bigint max + 1 (9223372036854775808) is rejected — 400', async () => {
    const token = makeToken(adminId, 'ADMIN')
    const res = await app.inject({
      method:  'PATCH',
      url:     '/v1/security/alerts/9223372036854775808/resolve',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(400)
  })

  it('STUDENT cannot access resolve — 403 (RBAC unchanged)', async () => {
    const token = makeToken(studentId, 'STUDENT')
    const res = await app.inject({
      method:  'PATCH',
      url:     '/v1/security/alerts/999999/resolve',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

// ─── Own Sessions ─────────────────────────────────────────────────────────────

describe('GET /v1/security/sessions', () => {
  it('returns own sessions list', async () => {
    const token = makeToken(adminId, 'ADMIN')
    const res = await app.inject({
      method:  'GET',
      url:     '/v1/security/sessions',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.json().data)).toBe(true)
  })

  it('STUDENT can also see own sessions', async () => {
    const token = makeToken(studentId, 'STUDENT')
    const res = await app.inject({
      method:  'GET',
      url:     '/v1/security/sessions',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
  })
})

// ─── Active Sessions (admin only) ─────────────────────────────────────────────

describe('GET /v1/security/active-sessions', () => {
  it('ADMIN can list all active sessions', async () => {
    const token = makeToken(adminId, 'ADMIN')
    const res = await app.inject({
      method:  'GET',
      url:     '/v1/security/active-sessions',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.json().data)).toBe(true)
  })

  it('STUDENT cannot access active-sessions — 403', async () => {
    const token = makeToken(studentId, 'STUDENT')
    const res = await app.inject({
      method:  'GET',
      url:     '/v1/security/active-sessions',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

// ─── Audit log written after write ops ───────────────────────────────────────

describe('Audit log side-effects', () => {
  it('creates audit log after course CREATE', async () => {
    const token = makeToken(adminId, 'ADMIN')

    const before = await prisma.auditLog.count({
      where: { userId: adminId, action: 'CREATE', resource: 'courses' },
    })

    await app.inject({
      method:  'POST',
      url:     '/v1/courses',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title:         `Audit Test Course ${Date.now()}`,
        teacherId:     teacherId,
        category:      'IT',
        durationWeeks: 4,
      },
    })

    const after = await prisma.auditLog.count({
      where: { userId: adminId, action: 'CREATE', resource: 'courses' },
    })

    expect(after).toBeGreaterThan(before)
  })
})
