/**
 * R1 (Redis 503) + R3 (tombstone rollback) — unit tests.
 *
 * R1: Redis ulanishi uzilganda refresh() 503 qaytarishi kerak (xato yopiq holat).
 * R3: P2025 bo'lmagan DB o'chirish xatosida belgi o'chirilishi kerak.
 */
import { jest } from '@jest/globals'

// ─── Mocks ────────────────────────────────────────────────────────────────────
const mockRedisGet    = jest.fn<() => Promise<string | null>>()
const mockRedisSetex  = jest.fn<() => Promise<string>>()
const mockRedisDel    = jest.fn<() => Promise<number>>()

jest.mock('../../config/redis', () => ({
  redis: { get: mockRedisGet, setex: mockRedisSetex, del: mockRedisDel },
}))

const mockPrismaFindUnique = jest.fn<() => Promise<any>>()
const mockPrismaDelete     = jest.fn<() => Promise<any>>()
const mockPrismaCreate     = jest.fn<() => Promise<any>>()

jest.mock('../../config/prisma', () => ({
  prisma: {
    refreshToken: {
      findUnique: mockPrismaFindUnique,
      delete:     mockPrismaDelete,
      create:     mockPrismaCreate,
    },
    user: { update: jest.fn().mockResolvedValue({}) },
  },
}))

jest.mock('../../services/audit.service',   () => ({ auditService: { log: jest.fn().mockResolvedValue(undefined) } }))
jest.mock('../../services/security.service', () => ({ securityService: { revokeAllSessions: jest.fn().mockResolvedValue(undefined) } }))
jest.mock('../../services/securityMonitor',  () => ({
  flagRefreshTokenReuse: jest.fn().mockResolvedValue(undefined),
  removeSessionIp:       jest.fn().mockResolvedValue(undefined),
  checkIpBlocked:        jest.fn().mockResolvedValue(undefined),
  checkMultiDevice:      jest.fn().mockResolvedValue(undefined),
  checkUnusualHour:      jest.fn().mockResolvedValue(undefined),
  recordFailedLogin:     jest.fn().mockResolvedValue(undefined),
  resetLoginAttempts:    jest.fn().mockResolvedValue(undefined),
}))
jest.mock('../../services/emailService', () => ({ emailService: { sendEmail: jest.fn() } }))
jest.mock('../../config/env', () => ({
  env: {
    JWT_ACCESS_SECRET:    'test-access-secret-that-is-long-enough',
    JWT_REFRESH_SECRET:   'test-refresh-secret-that-is-long-enough',
    JWT_ACCESS_EXPIRES_IN:  '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
    AES_ENCRYPTION_KEY:   'b7dcb02c6342b24134b3a09db4d897c16df22aa9034a757d4d0028118159a756',
    DISABLE_2FA_REQUIRED: 'false',
  },
}))

import { authService } from '../../services/auth.service'
import { Prisma } from '@prisma/client'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeStoredToken() {
  return {
    tokenHash:  'testhash',
    userId:     'user-1',
    expiresAt:  new Date(Date.now() + 60_000),
    user: { id: 'user-1', role: 'STUDENT', isActive: true },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
})

// ─── R1: Redis get failure ────────────────────────────────────────────────────
describe('R1 — Redis get failure → 503 (fail-closed)', () => {
  it('redis.get failure on the reuse-detection path → 503, no token pair, no new DB row', async () => {
    // Simulate: storedToken NOT found (null) → reuse check path
    mockPrismaFindUnique.mockResolvedValue(null)
    mockRedisGet.mockRejectedValue(new Error('Redis ECONNREFUSED'))

    await expect(
      authService.refresh('fake-token', '1.2.3.4', 'test-agent'),
    ).rejects.toMatchObject({ statusCode: 503 })

    // No token pair was issued — confirm no create call was made
    expect(mockPrismaCreate).not.toHaveBeenCalled()
  })

  it('response code is SERVICE_UNAVAILABLE (503), not 500', async () => {
    mockPrismaFindUnique.mockResolvedValue(null)
    mockRedisGet.mockRejectedValue(new Error('connect ETIMEDOUT'))

    await expect(
      authService.refresh('fake-token', '1.2.3.4', 'test-agent'),
    ).rejects.toMatchObject({ statusCode: 503 })
  })
})

// ─── R1: Redis setex failure ──────────────────────────────────────────────────
describe('R1 — Redis setex failure → 503 (fail-closed)', () => {
  it('redis.setex failure on tombstone write → 503, no token pair, token NOT deleted', async () => {
    const stored = makeStoredToken()
    mockPrismaFindUnique.mockResolvedValue(stored)
    mockRedisGet.mockResolvedValue(null)  // no reuse detected
    mockRedisSetex.mockRejectedValue(new Error('Redis write error'))

    await expect(
      authService.refresh('fake-token', '1.2.3.4', 'test-agent'),
    ).rejects.toMatchObject({ statusCode: 503 })

    // Token rotation was NOT completed — delete must NOT have been called
    expect(mockPrismaDelete).not.toHaveBeenCalled()
    expect(mockPrismaCreate).not.toHaveBeenCalled()
  })
})

// ─── R3: non-P2025 delete failure → tombstone cleanup ────────────────────────
describe('R3 — non-P2025 delete failure → tombstone removed (best effort)', () => {
  it('DB transient error: tombstone is removed so token is not left tombstoned-but-valid', async () => {
    const stored = makeStoredToken()
    mockPrismaFindUnique.mockResolvedValue(stored)
    mockRedisGet.mockResolvedValue(null)   // no reuse
    mockRedisSetex.mockResolvedValue('OK') // tombstone written

    const dbError = new Error('DB transient error')
    mockPrismaDelete.mockRejectedValue(dbError)
    mockRedisDel.mockResolvedValue(1)

    await expect(
      authService.refresh('fake-token', '1.2.3.4', 'test-agent'),
    ).rejects.toThrow('DB transient error')

    // Tombstone cleanup was attempted
    expect(mockRedisDel).toHaveBeenCalledWith(expect.stringContaining('refresh_used:'))
    // No token pair was issued
    expect(mockPrismaCreate).not.toHaveBeenCalled()
  })

  it('even if del also fails, the original error is still thrown (fail-closed)', async () => {
    const stored = makeStoredToken()
    mockPrismaFindUnique.mockResolvedValue(stored)
    mockRedisGet.mockResolvedValue(null)
    mockRedisSetex.mockResolvedValue('OK')
    mockPrismaDelete.mockRejectedValue(new Error('DB error'))
    mockRedisDel.mockRejectedValue(new Error('Redis also down'))

    await expect(
      authService.refresh('fake-token', '1.2.3.4', 'test-agent'),
    ).rejects.toMatchObject({ message: 'DB error' })
  })
})

// ─── R3: P2025 benign race unchanged ─────────────────────────────────────────
describe('R3 — P2025 benign race is unchanged (no reuse alert)', () => {
  it('P2025 → 401 without any redis.del call (not a tombstone-rollback scenario)', async () => {
    const stored = makeStoredToken()
    mockPrismaFindUnique.mockResolvedValue(stored)
    mockRedisGet.mockResolvedValue(null)
    mockRedisSetex.mockResolvedValue('OK')

    const p2025 = new Prisma.PrismaClientKnownRequestError('Not found', {
      code: 'P2025', clientVersion: '6.0.0',
    })
    mockPrismaDelete.mockRejectedValue(p2025)

    await expect(
      authService.refresh('fake-token', '1.2.3.4', 'test-agent'),
    ).rejects.toMatchObject({ statusCode: 401 })

    // del must NOT be called for P2025 — it's a benign race, not a failure
    expect(mockRedisDel).not.toHaveBeenCalled()
  })
})

// ─── Healthy Redis: normal rotation unchanged ─────────────────────────────────
describe('healthy Redis — normal rotation still works', () => {
  it('rotation succeeds: no errors from redis/prisma', async () => {
    const stored = makeStoredToken()
    mockPrismaFindUnique.mockResolvedValue(stored)
    mockRedisGet.mockResolvedValue(null)
    mockRedisSetex.mockResolvedValue('OK')
    mockPrismaDelete.mockResolvedValue({ tokenHash: 'testhash' })
    // _createTokenPair uses prisma.refreshToken.create and jwt sign — mock what's needed
    mockPrismaCreate.mockResolvedValue({ tokenHash: 'newhash', expiresAt: new Date() })

    // Should not throw
    await expect(
      authService.refresh('fake-token', '1.2.3.4', 'test-agent'),
    ).resolves.toMatchObject({ accessToken: expect.any(String) })
  })
})
