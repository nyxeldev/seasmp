/**
 * 2FA unit tests — mock Prisma and Redis, test pure logic.
 */
import { jest } from '@jest/globals'

// ─── Mocks ────────────────────────────────────────────────────────────────────
jest.mock('../../config/prisma', () => ({
  prisma: {
    user: {
      findUnique:        jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update:            jest.fn(),
    },
    backupCode: {
      findMany:    jest.fn(),
      createMany:  jest.fn(),
      deleteMany:  jest.fn(),
      update:      jest.fn(),
    },
    refreshToken: {
      create:      jest.fn(),
      findUnique:  jest.fn(),
      delete:      jest.fn(),
      deleteMany:  jest.fn(),
    },
  },
}))

jest.mock('../../config/redis', () => ({
  redis: {
    get:    jest.fn(),
    set:    jest.fn(),
    setex:  jest.fn(),
    del:    jest.fn(),
    incr:   jest.fn(),
    expire: jest.fn(),
    sadd:   jest.fn(),
    scard:  jest.fn(),
    srem:   jest.fn(),
    ttl:    jest.fn(),
    pipeline: jest.fn(() => ({
      zremrangebyscore: jest.fn().mockReturnThis(),
      zadd:             jest.fn().mockReturnThis(),
      zcard:            jest.fn().mockReturnThis(),
      expire:           jest.fn().mockReturnThis(),
      exec:             jest.fn().mockResolvedValue([[null,0],[null,'1'],[null,1],[null,1]]),
    })),
  },
}))

jest.mock('../../services/audit.service', () => ({
  auditService: { log: jest.fn().mockResolvedValue(undefined) },
}))

jest.mock('../../services/emailService', () => ({
  emailService: {
    send2FAEnabled:      jest.fn().mockResolvedValue(undefined),
    sendUnusualHourAlert: jest.fn().mockResolvedValue(undefined),
    sendMultiDeviceAlert:  jest.fn().mockResolvedValue(undefined),
  },
}))

jest.mock('../../services/securityMonitor', () => ({
  checkIpBlocked:       jest.fn().mockResolvedValue(undefined),
  recordFailedLogin:    jest.fn().mockResolvedValue(undefined),
  resetLoginAttempts:   jest.fn().mockResolvedValue(undefined),
  checkMultiDevice:     jest.fn().mockResolvedValue(undefined),
  checkUnusualHour:     jest.fn().mockResolvedValue(undefined),
  removeSessionIp:      jest.fn().mockResolvedValue(undefined),
}))

import { authenticator } from 'otplib'
import { authService } from '../../services/auth.service'
import { prisma } from '../../config/prisma'
import { redis } from '../../config/redis'

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockRedis  = redis  as jest.Mocked<typeof redis>

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('2FA setup', () => {
  it('generates a secret and QR code URL', async () => {
    ;(mockPrisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      twoFactorEnabled: false,
    })
    ;(mockRedis.setex as jest.Mock).mockResolvedValue('OK')

    const result = await authService.setup2FA('user-1')

    expect(result.secret.length).toBeGreaterThanOrEqual(16)
    expect(result.qrCodeUrl).toMatch(/^data:image\/png;base64,/)
    expect(result.backupCodes).toHaveLength(10)
  })
})

describe('2FA confirm', () => {
  it('enables 2FA when correct code provided', async () => {
    const secret = authenticator.generateSecret()
    const code   = authenticator.generate(secret)

    // Mock encrypt(secret) stored in Redis
    const { prisma: p } = require('../../config/prisma')
    ;(mockRedis.get as jest.Mock).mockResolvedValue(`iv:tag:${Buffer.from(secret).toString('hex')}`)

    // Bypass decrypt — patch the confirm to use real secret
    // Instead test via setup → confirm flow with real secret
    const AES_KEY = Buffer.from(process.env.AES_ENCRYPTION_KEY!, 'hex')
    const crypto  = require('crypto')
    const iv      = crypto.randomBytes(12)
    const cipher  = crypto.createCipheriv('aes-256-gcm', AES_KEY, iv)
    const enc     = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
    const tag     = cipher.getAuthTag()
    const stored  = `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`

    ;(mockRedis.get as jest.Mock).mockResolvedValue(stored)
    ;(mockPrisma.user.update as jest.Mock).mockResolvedValue({ id: 'user-1', email: 'test@example.com', firstName: 'A', lastName: 'B' })
    ;(mockPrisma.backupCode.deleteMany as jest.Mock).mockResolvedValue({ count: 0 })
    ;(mockPrisma.backupCode.createMany as jest.Mock).mockResolvedValue({ count: 10 })
    ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ email: 'test@example.com', firstName: 'A', lastName: 'B' })
    ;(mockRedis.del as jest.Mock).mockResolvedValue(1)

    const result = await authService.confirm2FA('user-1', code)

    expect(result.backupCodes).toHaveLength(10)
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ twoFactorEnabled: true }) })
    )
  })

  it('throws when code is wrong', async () => {
    const secret = authenticator.generateSecret()
    const AES_KEY = Buffer.from(process.env.AES_ENCRYPTION_KEY!, 'hex')
    const crypto  = require('crypto')
    const iv      = crypto.randomBytes(12)
    const cipher  = crypto.createCipheriv('aes-256-gcm', AES_KEY, iv)
    const enc     = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
    const tag     = cipher.getAuthTag()
    const stored  = `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`

    ;(mockRedis.get as jest.Mock).mockResolvedValue(stored)

    await expect(authService.confirm2FA('user-1', '000000')).rejects.toMatchObject({ statusCode: 400 })
  })

  it('throws when setup token expired', async () => {
    ;(mockRedis.get as jest.Mock).mockResolvedValue(null)
    await expect(authService.confirm2FA('user-1', '123456')).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('2FA verify (login)', () => {
  const makeEncryptedSecret = (secret: string) => {
    const AES_KEY = Buffer.from(process.env.AES_ENCRYPTION_KEY!, 'hex')
    const crypto  = require('crypto')
    const iv      = crypto.randomBytes(12)
    const cipher  = crypto.createCipheriv('aes-256-gcm', AES_KEY, iv)
    const enc     = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
    const tag     = cipher.getAuthTag()
    return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`
  }

  it('returns full tokens when code is correct', async () => {
    const secret = authenticator.generateSecret()
    const code   = authenticator.generate(secret)

    ;(mockRedis.get as jest.Mock).mockResolvedValue('user-1')
    ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-1', role: 'TEACHER', twoFactorSecret: makeEncryptedSecret(secret),
      email: 't@t.com', firstName: 'A', lastName: 'B',
    })
    ;(mockRedis.del as jest.Mock).mockResolvedValue(1)
    ;(mockPrisma.refreshToken.create as jest.Mock).mockResolvedValue({})
    ;(mockPrisma.user.update as jest.Mock).mockResolvedValue({})

    const result = await authService.verifyTwoFactor('token-abc', code, '1.2.3.4', 'UA')

    expect(result.tokens?.accessToken).toBeTruthy()
    expect(result.requiresTwoFactor).toBe(false)
  })

  it('throws 401 when code is wrong', async () => {
    const secret = authenticator.generateSecret()

    ;(mockRedis.get as jest.Mock).mockResolvedValue('user-1')
    ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-1', role: 'TEACHER', twoFactorSecret: makeEncryptedSecret(secret),
    })

    await expect(
      authService.verifyTwoFactor('token-abc', '000000', '1.2.3.4', 'UA')
    ).rejects.toMatchObject({ statusCode: 401 })
  })

  it('throws 401 when temp_token is expired', async () => {
    ;(mockRedis.get as jest.Mock).mockResolvedValue(null)

    await expect(
      authService.verifyTwoFactor('expired-token', '123456', '1.2.3.4', 'UA')
    ).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('Backup code', () => {
  it('accepts valid backup code (one-time use)', async () => {
    const bcrypt = require('bcryptjs')
    const code   = 'ABCD-1234'
    const hash   = await bcrypt.hash(code, 10)

    ;(mockRedis.get as jest.Mock).mockResolvedValue('user-1')
    ;(mockPrisma.backupCode.findMany as jest.Mock).mockResolvedValue([
      { id: 'bc-1', userId: 'user-1', codeHash: hash, usedAt: null },
    ])
    ;(mockPrisma.backupCode.update as jest.Mock).mockResolvedValue({})
    ;(mockRedis.del as jest.Mock).mockResolvedValue(1)
    ;(mockPrisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue({
      id: 'user-1', role: 'TEACHER',
      email: 't@t.com', firstName: 'A', lastName: 'B',
    })
    ;(mockPrisma.refreshToken.create as jest.Mock).mockResolvedValue({})
    ;(mockPrisma.user.update as jest.Mock).mockResolvedValue({})

    const result = await authService.verifyBackupCode('token-abc', code, '1.2.3.4', 'UA')
    expect(result.tokens?.accessToken).toBeTruthy()
    expect(mockPrisma.backupCode.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ usedAt: expect.any(Date) }) })
    )
  })

  it('rejects wrong backup code with 401', async () => {
    const bcrypt = require('bcryptjs')
    const hash   = await bcrypt.hash('RIGHT-CODE', 10)

    ;(mockRedis.get as jest.Mock).mockResolvedValue('user-1')
    ;(mockPrisma.backupCode.findMany as jest.Mock).mockResolvedValue([
      { id: 'bc-1', userId: 'user-1', codeHash: hash, usedAt: null },
    ])

    await expect(
      authService.verifyBackupCode('token-abc', 'WRONG-CODE', '1.2.3.4', 'UA')
    ).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('Login — Admin 2FA required', () => {
  it('returns requiresTwoFactorSetup for ADMIN without 2FA', async () => {
    ;(mockRedis.get as jest.Mock).mockResolvedValue(null)     // not blocked
    ;(mockRedis.incr as jest.Mock).mockResolvedValue(1)
    ;(mockRedis.ttl as jest.Mock).mockResolvedValue(300)
    const bcrypt = require('bcryptjs')
    const hash   = await bcrypt.hash('Admin@1234', 12)

    ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'admin-1', role: 'ADMIN', twoFactorEnabled: false,
      isActive: true, passwordHash: hash,
      email: 'admin@test.com',
    })
    ;(mockRedis.del as jest.Mock).mockResolvedValue(1)
    ;(mockRedis.setex as jest.Mock).mockResolvedValue('OK')

    const result = await authService.login('admin@test.com', 'Admin@1234', '1.2.3.4', 'UA')
    expect(result.requiresTwoFactorSetup).toBe(true)
  })
})
