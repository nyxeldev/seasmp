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
