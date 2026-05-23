/**
 * Auth integration tests — real DB, no mocks.
 * Requires: TEST_DATABASE_URL (or DATABASE_URL) + REDIS_URL
 */

import { startApp, seedAdmin, seedTeacher, cleanup, makeToken } from './setup'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let adminId: string
let teacherId: string

beforeAll(async () => {
  app = await startApp()
  const admin   = await seedAdmin()
  const teacher = await seedTeacher()
  adminId   = admin.id
  teacherId = teacher.id
})

afterAll(async () => {
  await cleanup(adminId, teacherId)
  await app.close()
})

// ─── Health ───────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('ok')
  })
})

// ─── Login ────────────────────────────────────────────────────────────────────

describe('POST /v1/auth/login', () => {
  it('returns 401 for unknown email', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/v1/auth/login',
      payload: { email: 'nobody@test.com', password: 'Password@1' },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().success).toBe(false)
  })

  it('returns 401 for wrong password', async () => {
    const ts  = Date.now()
    const res = await app.inject({
      method:  'POST',
      url:     '/v1/auth/login',
      payload: { email: `admin_${ts.toString().slice(-10)}@test.com`, password: 'Wrong@1234' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 400 for invalid email format', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/v1/auth/login',
      payload: { email: 'not-an-email', password: 'Password@1' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('VALIDATION_ERROR')
  })

  it('ADMIN with no 2FA gets requiresTwoFactorSetup', async () => {
    const email = `admin_${Date.now().toString().slice(-10)}@test.com`
    const { PrismaClient } = await import('@prisma/client')
    const p = new PrismaClient()
    const bcrypt = await import('bcryptjs')
    const user = await p.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash('Admin@1234', 12),
        firstName: 'Int',
        lastName:  'Admin',
        role: 'ADMIN',
        twoFactorEnabled: false,
      },
    })

    const res = await app.inject({
      method:  'POST',
      url:     '/v1/auth/login',
      payload: { email, password: 'Admin@1234' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.requiresTwoFactorSetup).toBe(true)
    expect(typeof res.json().data.setupToken).toBe('string')

    await p.user.delete({ where: { id: user.id } })
    await p.$disconnect()
  })
})

// ─── /users/me ────────────────────────────────────────────────────────────────

describe('GET /v1/users/me', () => {
  it('returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/users/me' })
    expect(res.statusCode).toBe(401)
  })

  it('returns own profile with valid token', async () => {
    const token = makeToken(adminId, 'ADMIN')
    const res = await app.inject({
      method:  'GET',
      url:     '/v1/users/me',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.id).toBe(adminId)
    expect(res.json().data).not.toHaveProperty('passwordHash')
  })

  it('returns 401 with malformed token', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/v1/users/me',
      headers: { authorization: 'Bearer not.a.token' },
    })
    expect(res.statusCode).toBe(401)
  })
})

// ─── RBAC ─────────────────────────────────────────────────────────────────────

describe('RBAC — /v1/users list', () => {
  it('ADMIN can list users', async () => {
    const token = makeToken(adminId, 'ADMIN')
    const res = await app.inject({
      method:  'GET',
      url:     '/v1/users',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('STUDENT cannot list users — 403', async () => {
    const token = makeToken(adminId, 'STUDENT')
    const res = await app.inject({
      method:  'GET',
      url:     '/v1/users',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('TEACHER cannot list users — 403', async () => {
    const token = makeToken(teacherId, 'TEACHER')
    const res = await app.inject({
      method:  'GET',
      url:     '/v1/users',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

// ─── Logout ───────────────────────────────────────────────────────────────────

describe('POST /v1/auth/logout', () => {
  it('returns 200 with valid token', async () => {
    const token = makeToken(adminId, 'ADMIN')
    const res = await app.inject({
      method:  'POST',
      url:     '/v1/auth/logout',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('returns 401 without token', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/auth/logout' })
    expect(res.statusCode).toBe(401)
  })
})
