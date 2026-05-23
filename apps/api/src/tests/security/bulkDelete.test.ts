import { jest } from '@jest/globals'

const mockIncr   = jest.fn<() => Promise<number>>()
const mockExpire = jest.fn<() => Promise<number>>()

jest.mock('../../config/redis', () => ({
  redis: {
    incr:   mockIncr,
    expire: mockExpire,
  },
}))

jest.mock('../../config/prisma', () => ({
  prisma: {
    securityAlert: { create: jest.fn().mockResolvedValue({}) },
  },
}))

import { checkBulkDelete } from '../../services/securityMonitor'

describe('Bulk Delete Guard', () => {
  beforeEach(() => jest.clearAllMocks())

  it('allows deletions under the limit', async () => {
    mockIncr.mockResolvedValue(5)
    mockExpire.mockResolvedValue(1)

    await expect(checkBulkDelete('user-1', '1.2.3.4')).resolves.toBeUndefined()
  })

  it('allows exactly 10 deletions', async () => {
    mockIncr.mockResolvedValue(10)
    mockExpire.mockResolvedValue(1)

    await expect(checkBulkDelete('user-1', '1.2.3.4')).resolves.toBeUndefined()
  })

  it('blocks the 11th deletion with 403', async () => {
    mockIncr.mockResolvedValue(11)
    mockExpire.mockResolvedValue(1)

    await expect(checkBulkDelete('user-1', '1.2.3.4')).rejects.toMatchObject({
      statusCode: 403,
    })
  })

  it('blocks on the 20th deletion', async () => {
    mockIncr.mockResolvedValue(20)
    mockExpire.mockResolvedValue(1)

    await expect(checkBulkDelete('user-1', '1.2.3.4')).rejects.toMatchObject({
      statusCode: 403,
    })
  })

  it('counts per-user (different users independent)', async () => {
    mockIncr.mockResolvedValue(3)  // user-2 only at 3
    mockExpire.mockResolvedValue(1)

    await expect(checkBulkDelete('user-2', '1.2.3.4')).resolves.toBeUndefined()
    expect(mockIncr).toHaveBeenCalledWith('bulk_delete:user-2')
  })
})
