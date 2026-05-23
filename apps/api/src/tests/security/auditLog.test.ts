import { jest } from '@jest/globals'

const mockCreate = jest.fn<() => Promise<any>>()

jest.mock('../../config/prisma', () => ({
  prisma: {
    auditLog: { create: mockCreate },
  },
}))

import { auditService } from '../../services/audit.service'

describe('Audit Log Service', () => {
  beforeEach(() => jest.clearAllMocks())

  it('writes CREATE action to DB', async () => {
    mockCreate.mockResolvedValue({ id: BigInt(1) })

    await auditService.log({
      userId: 'user-1',
      action: 'CREATE',
      resource: 'courses',
      resourceId: 'course-1',
      newData: { title: 'New Course' },
      ipAddress: '127.0.0.1',
    })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'CREATE',
          resource: 'courses',
          userId: 'user-1',
        }),
      })
    )
  })

  it('writes LOGIN_FAILED action to DB', async () => {
    mockCreate.mockResolvedValue({ id: BigInt(2) })

    await auditService.log({
      userId: null,
      action: 'LOGIN_FAILED',
      resource: 'users',
      ipAddress: '1.2.3.4',
    })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'LOGIN_FAILED',
          userId: null,
        }),
      })
    )
  })

  it('includes oldData in DELETE action', async () => {
    mockCreate.mockResolvedValue({ id: BigInt(3) })

    await auditService.log({
      userId: 'admin-1',
      action: 'DELETE',
      resource: 'users',
      resourceId: 'user-99',
      oldData: { email: 'deleted@test.com', role: 'STUDENT' },
      ipAddress: '127.0.0.1',
    })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          oldData: { email: 'deleted@test.com', role: 'STUDENT' },
        }),
      })
    )
  })

  it('does NOT throw if DB write fails (graceful degradation)', async () => {
    mockCreate.mockRejectedValue(new Error('DB connection lost'))

    // Should not throw
    await expect(
      auditService.log({
        userId: 'user-1',
        action: 'LOGIN',
        resource: 'users',
        ipAddress: '127.0.0.1',
      })
    ).resolves.toBeUndefined()
  })

  it('logs 2FA setup action', async () => {
    mockCreate.mockResolvedValue({ id: BigInt(4) })

    await auditService.log({
      userId: 'user-1',
      action: 'TWO_FA_SETUP',
      resource: 'users',
      ipAddress: '127.0.0.1',
    })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'TWO_FA_SETUP' }),
      })
    )
  })
})
