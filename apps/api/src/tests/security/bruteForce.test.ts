import { jest } from '@jest/globals'

// ─── Mocks ────────────────────────────────────────────────────────────────────
const mockGet    = jest.fn<() => Promise<string | null>>()
const mockIncr   = jest.fn<() => Promise<number>>()
const mockExpire = jest.fn<() => Promise<number>>()
const mockSetex  = jest.fn<() => Promise<string>>()
const mockDel    = jest.fn<() => Promise<number>>()
const mockTtl    = jest.fn<() => Promise<number>>()

jest.mock('../../config/redis', () => ({
  redis: {
    get:    mockGet,
    incr:   mockIncr,
    expire: mockExpire,
    setex:  mockSetex,
    del:    mockDel,
    ttl:    mockTtl,
  },
}))

jest.mock('../../config/prisma', () => ({
  prisma: {
    securityAlert: { create: jest.fn().mockResolvedValue({}) },
  },
}))

jest.mock('../../services/audit.service', () => ({
  auditService: { log: jest.fn().mockResolvedValue(undefined) },
}))

import { checkIpBlocked, recordFailedLogin } from '../../services/securityMonitor'

describe('Brute Force Detection', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('allows login when IP is not blocked', async () => {
    mockGet.mockResolvedValue(null)
    await expect(checkIpBlocked('1.2.3.4')).resolves.toBeUndefined()
  })

  it('throws 429 when IP is blocked', async () => {
    mockGet.mockResolvedValue('1')
    mockTtl.mockResolvedValue(1200)
    await expect(checkIpBlocked('1.2.3.4')).rejects.toMatchObject({ statusCode: 429 })
  })

  it('records failure attempts without blocking under limit', async () => {
    mockIncr.mockResolvedValue(5)
    mockExpire.mockResolvedValue(1)

    await recordFailedLogin('1.2.3.4', null)

    expect(mockSetex).not.toHaveBeenCalled()  // not blocked yet
  })

  it('blocks IP after 10 failed attempts', async () => {
    mockIncr.mockResolvedValue(10)
    mockExpire.mockResolvedValue(1)
    mockSetex.mockResolvedValue('OK')
    mockDel.mockResolvedValue(1)

    await recordFailedLogin('1.2.3.4', null)

    expect(mockSetex).toHaveBeenCalledWith('ip_blocked:1.2.3.4', 1800, '1')
  })

  it('does not re-block on 9th attempt', async () => {
    mockIncr.mockResolvedValue(9)
    mockExpire.mockResolvedValue(1)

    await recordFailedLogin('1.2.3.4', null)

    expect(mockSetex).not.toHaveBeenCalled()
  })

  it('shows correct time remaining in 429 message', async () => {
    mockGet.mockResolvedValue('1')
    mockTtl.mockResolvedValue(900)  // 15 minutes

    try {
      await checkIpBlocked('1.2.3.4')
      fail('should have thrown')
    } catch (err: any) {
      expect(err.message).toContain('15 minute')
    }
  })
})
