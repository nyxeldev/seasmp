/**
 * Item 2 (Closeout Correction) — `request.routeOptions.url` is typed
 * `string | undefined` (Fastify 5: it is `undefined` for a true 404,
 * `is404` true, no route matched). `recordRequest` is an `onResponse`
 * hook — it must NEVER throw, regardless of what reaches it.
 *
 * Reading the code (not guessing): `targetFromPath`'s `UNOWNABLE_PATTERNS`
 * check is guarded by `routePattern &&`, and `findIdParam` opens with
 * `if (!routePattern) return null` — both already treat `undefined` as a
 * normal, non-throwing input, falling through to the pathname-based
 * first-segment fallback (same branch used for `/me`/list/login routes
 * that have no `:param` at all). No null-guard fix was needed; this test
 * proves that behavior directly at the `recordRequest` level, not just
 * inside the pure `targetFromPath` function (already covered in
 * `requestTarget.test.ts`).
 */
import { jest } from '@jest/globals'
import type { FastifyRequest, FastifyReply } from 'fastify'

const mockAuditLog = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
jest.mock('../../services/audit.service', () => ({
  auditService: { log: mockAuditLog },
}))

const mockResolveAccess = jest.fn<() => Promise<any>>()
jest.mock('../../services/ownershipResolver', () => ({
  resolveAccess: mockResolveAccess,
}))

jest.mock('../../services/behaviorDetector', () => ({ inspect: jest.fn().mockResolvedValue(undefined) }))
jest.mock('../../services/signalWindow', () => ({
  recordAuthz: jest.fn().mockResolvedValue(undefined),
  recordPrivilegedScope: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('../../services/correlationDetector', () => ({ evaluate: jest.fn().mockResolvedValue(undefined) }))
jest.mock('../../config/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}))

import { recordRequest } from '../../services/requestAudit'

beforeEach(() => {
  jest.clearAllMocks()
  mockResolveAccess.mockResolvedValue({ relation: 'UNKNOWN', ownerId: null, hasOwnerRule: false })
})

function makeRequest(overrides: Record<string, unknown> = {}): FastifyRequest {
  return {
    url: '/v1/this-route-does-not-exist',
    method: 'GET',
    routeOptions: { url: undefined },
    params: {},
    user: undefined,
    headers: {},
    ip: '127.0.0.1',
    ...overrides,
  } as unknown as FastifyRequest
}

function makeReply(statusCode = 404): FastifyReply {
  return { statusCode, elapsedTime: 3 } as unknown as FastifyReply
}

describe('recordRequest — request.routeOptions.url === undefined (true 404)', () => {
  it('completes without throwing or rejecting', async () => {
    await expect(recordRequest(makeRequest(), makeReply(404))).resolves.toBeUndefined()
  })

  it('extraction falls back to the pathname first segment, resourceId stays undefined — not a thrown error', async () => {
    await recordRequest(makeRequest(), makeReply(404))

    expect(mockAuditLog).toHaveBeenCalledTimes(1)
    const call = mockAuditLog.mock.calls[0][0] as any
    expect(call.resource).toBe('this-route-does-not-exist')
    expect(call.resourceId).toBeUndefined()
  })

  it('an authenticated user hitting a nonexistent route still completes without throwing', async () => {
    const req = makeRequest({ user: { sub: 'user-1', role: 'STUDENT' } })
    await expect(recordRequest(req, makeReply(404))).resolves.toBeUndefined()
  })
})
