/**
 * R7 — PATCH /v1/notifications/:id/read BigInt overflow guard.
 *
 * The route had a try/catch for syntax errors (non-numeric id → 400) but
 * NO upper-bound check. JS BigInt is arbitrary precision, so a numeric string
 * larger than Postgres bigint range parses successfully, then raises
 * SQLSTATE 22003 at the DB level — outside the try/catch, so it fell through
 * to a raw 500.
 *
 * These tests also verify normal behavior (not-found 404, RBAC/auth) is
 * unchanged — proving the guard does not widen or narrow the happy path.
 */
import { startApp, seedStudent, cleanup, makeToken, prisma } from './setup'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let studentId: string

beforeAll(async () => {
  app = await startApp()
  const student = await seedStudent()
  studentId = student.id
})

afterAll(async () => {
  await cleanup(studentId)
  await app.close()
})

describe('PATCH /v1/notifications/:id/read — BigInt overflow guard (R7)', () => {
  it('non-numeric id returns 400, not 500', async () => {
    const token = makeToken(studentId, 'STUDENT')
    const res = await app.inject({
      method:  'PATCH',
      url:     '/v1/notifications/not-a-number/read',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(400)
  })

  it('an id far larger than Postgres bigint range returns 400, not 500', async () => {
    const token = makeToken(studentId, 'STUDENT')
    const res = await app.inject({
      method:  'PATCH',
      url:     '/v1/notifications/99999999999999999999999999/read',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(400)
  })

  it('exactly Postgres bigint max (9223372036854775807) is a VALID id shape — 404 (not found), not 400', async () => {
    const token = makeToken(studentId, 'STUDENT')
    const res = await app.inject({
      method:  'PATCH',
      url:     '/v1/notifications/9223372036854775807/read',
      headers: { authorization: `Bearer ${token}` },
    })
    // The route returns 404 when the notification is not found or belongs
    // to someone else — both map to 404 to avoid enumeration.
    expect(res.statusCode).toBe(404)
  })

  it('bigint max + 1 (9223372036854775808) is rejected — 400', async () => {
    const token = makeToken(studentId, 'STUDENT')
    const res = await app.inject({
      method:  'PATCH',
      url:     '/v1/notifications/9223372036854775808/read',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(400)
  })

  it('unauthenticated request → 401 (auth unchanged)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url:    '/v1/notifications/1/read',
    })
    expect(res.statusCode).toBe(401)
  })

  it('a real notification belonging to the user is marked read successfully', async () => {
    const notif = await prisma.notification.create({
      data: {
        userId: studentId,
        type:   'ENROLLED',
        title:  'Test notification',
        body:   'Integration test notification',
      },
    })
    try {
      const token = makeToken(studentId, 'STUDENT')
      const res = await app.inject({
        method:  'PATCH',
        url:     `/v1/notifications/${notif.id}/read`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(true)
    } finally {
      await prisma.notification.deleteMany({ where: { id: notif.id } })
    }
  })
})
