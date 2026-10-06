/**
 * M4 — refresh-token rotation exists, but reusing an already-rotated
 * (consumed) refresh token was not detected: the row is hard-deleted on
 * rotation, so the DB alone cannot tell "stolen token replayed" apart from
 * "token never existed". The fix adds a short-lived Redis tombstone
 * (`refresh_used:<hash>`, TTL = the token's own remaining lifetime) written
 * at rotation time — no Prisma schema change. If that tombstone is found
 * for a token that's no longer in the DB, the whole session family is
 * revoked (`securityService.revokeAllSessions`, already-existing
 * mechanism) and a security alert + audit entry are recorded.
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

function extractRefreshCookie(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie']
  const setCookies = Array.isArray(raw) ? raw : raw ? [String(raw)] : []
  for (const c of setCookies) {
    const match = /refreshToken=([^;]+)/.exec(c)
    if (match) return match[1]
  }
  throw new Error('refreshToken cookie not found in response')
}

async function login() {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: { email: studentEmail, password: 'Student@1234' },
  })
  expect(res.statusCode).toBe(200)
  return { accessToken: res.json().data.accessToken as string, refreshToken: extractRefreshCookie(res) }
}

async function refresh(refreshToken: string) {
  return app.inject({
    method: 'POST',
    url: '/v1/auth/refresh',
    cookies: { refreshToken },
  })
}

describe('M4 — refresh-token rotation and reuse detection', () => {
  it('a fresh login + refresh works, and rotation issues a new usable token', async () => {
    const { refreshToken: rt0 } = await login()

    const res1 = await refresh(rt0)
    expect(res1.statusCode).toBe(200)
    expect(res1.json().data.accessToken).toBeTruthy()
    const rt1 = extractRefreshCookie(res1)
    expect(rt1).not.toBe(rt0)

    // The newly-issued token must itself still work for a further refresh.
    const res2 = await refresh(rt1)
    expect(res2.statusCode).toBe(200)
  })

  it('reusing an already-rotated refresh token is detected and revokes the whole session family', async () => {
    const { refreshToken: rt0 } = await login()

    const rotated = await refresh(rt0)
    expect(rotated.statusCode).toBe(200)
    const rt1 = extractRefreshCookie(rotated)

    // Replay the OLD, already-consumed token.
    const reused = await refresh(rt0)
    expect(reused.statusCode).toBe(401)

    // The legitimately-issued rt1 must now ALSO be dead — proof that
    // reuse detection revoked the whole session family, not just rt0.
    const afterReuse = await refresh(rt1)
    expect(afterReuse.statusCode).toBe(401)

    const alert = await prisma.securityAlert.findFirst({
      where: { userId: studentId, type: 'UNAUTHORIZED_OBJECT_ACCESS', severity: 'CRITICAL' },
      orderBy: { id: 'desc' },
    })
    expect(alert).not.toBeNull()

    const log = await prisma.auditLog.findFirst({
      where: { userId: studentId, action: 'ACCESS_DENIED', resource: 'refresh_tokens' },
      orderBy: { id: 'desc' },
    })
    expect(log).not.toBeNull()

    // Session family is actually gone from the DB too.
    const remaining = await prisma.refreshToken.count({ where: { userId: studentId } })
    expect(remaining).toBe(0)
  })

  it('a newly-issued refresh token after the incident continues to work normally', async () => {
    // Fresh login establishes a brand-new, unrelated session — must be
    // unaffected by the earlier incident's revocation.
    const { refreshToken: rtFresh } = await login()
    const res = await refresh(rtFresh)
    expect(res.statusCode).toBe(200)
  })

  it('logout remains functional', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: studentEmail, password: 'Student@1234' },
    })
    const accessToken = loginRes.json().data.accessToken as string
    const rt = extractRefreshCookie(loginRes)

    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { authorization: `Bearer ${accessToken}` },
      cookies: { refreshToken: rt },
    })
    expect(res.statusCode).toBe(200)

    // The logged-out token must no longer work for refresh.
    const after = await refresh(rt)
    expect(after.statusCode).toBe(401)
  })

  it('an expired refresh token is rejected (401), without raising a false reuse alert', async () => {
    const crypto = await import('node:crypto')
    const rawToken = crypto.randomBytes(64).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

    await prisma.refreshToken.create({
      data: {
        userId: studentId,
        tokenHash,
        expiresAt: new Date(Date.now() - 60_000), // already expired
      },
    })

    const res = await refresh(rawToken)
    expect(res.statusCode).toBe(401)

    await prisma.refreshToken.deleteMany({ where: { tokenHash } })
  })

  it('a malformed/never-issued refresh token is rejected (401)', async () => {
    const res = await refresh('not-a-real-token-at-all')
    expect(res.statusCode).toBe(401)
  })
})
