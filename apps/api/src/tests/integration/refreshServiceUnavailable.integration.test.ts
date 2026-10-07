/**
 * R1 — the 503 ENVELOPE, proven over real HTTP.
 *
 * `refreshRedisFailure.test.ts` (unit) already proves `authService.refresh()`
 * throws `{ statusCode: 503 }` when Redis is down. What was never asserted
 * is the other half: that app.ts's global error handler actually turns
 * that thrown object into the HTTP response the client receives — status
 * 503, body `{ success: false, error: { code: 'SERVICE_UNAVAILABLE', ... } }`.
 *
 * Redis is mocked at the client boundary only (`jest.spyOn` on the real
 * exported `redis` singleton, restored after each test) — everything else
 * (Postgres, the route, the error handler) is real, via a real injected
 * HTTP request.
 */
import { jest } from '@jest/globals'
import { redis } from '../../config/redis'
import { startApp } from './setup'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance

beforeAll(async () => {
  app = await startApp()
})

afterAll(async () => {
  await app.close()
})

describe('R1 — POST /v1/auth/refresh surfaces a Redis outage as 503 SERVICE_UNAVAILABLE', () => {
  it('redis.get failure on the reuse-check path (unknown token) → HTTP 503 with the standard envelope', async () => {
    const spy = jest.spyOn(redis, 'get').mockRejectedValueOnce(new Error('ECONNREFUSED'))
    try {
      const res = await app.inject({
        method:  'POST',
        url:     '/v1/auth/refresh',
        cookies: { refreshToken: 'this-token-was-never-issued' },
      })

      expect(res.statusCode).toBe(503)
      const body = res.json()
      expect(body).toMatchObject({
        success: false,
        error: { code: 'SERVICE_UNAVAILABLE' },
      })
    } finally {
      spy.mockRestore()
    }
  })

  it('a healthy Redis + the same unknown token instead gets the ordinary 401 (control — proves the 503 above is from Redis, not from an unrelated path)', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/v1/auth/refresh',
      cookies: { refreshToken: 'this-token-was-never-issued-2' },
    })
    expect(res.statusCode).toBe(401)
  })
})
